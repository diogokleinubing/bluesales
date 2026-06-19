// Fonte: Ticketmaster Brasil (ticketmaster.com.br) — SSR (plataforma Crowder).
//   Sem API pública/sitemap. Descoberta por HTML (server-rendered):
//     - Home + páginas /page/<x> linkam eventos /event/<slug>.
//   Detalhe: GET /event/<slug> tem <script type="application/ld+json"> com
//     schema.org/Event: name, startDate, endDate, location (name + address),
//     offers[].price (BRL) -> preço mín/máx, image, performer.
//   Organizador e taxa não são expostos -> null. UF sai de addressRegion ou de
//   um mapa de cidades; senão null.
//
// Descoberta vê o catálogo a cada execução; coleta normal pega os ainda-novos
// (skip-known) em blocos de MAX_DETALHES; reprocessar caminha por um offset.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.ticketmaster.com.br'
const MAX_DETALHES = 20 // teto de detalhes por execução (via proxy = +lento/+créditos)
const MAX_PAGES = 15 // teto de páginas /page/ na descoberta (cada uma gasta 1 crédito)
const BATCH = 5
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

// Akamai do Ticketmaster bloqueia IP de datacenter (403). Roteamos por um proxy
// de scraping (IP residencial). Secret TICKETMASTER_PROXY = template com {url},
// ex.: https://api.scraperapi.com/?api_key=SUACHAVE&url={url}
const PROXY = Deno.env.get('TICKETMASTER_PROXY') ?? ''
const viaProxy = (url: string) => (PROXY ? PROXY.replace('{url}', encodeURIComponent(url)) : url)

const eventUrl = (slug: string) => `${HOST}/event/${slug}`

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(viaProxy(url), { headers: HEADERS, signal: AbortSignal.timeout(45000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function matchAll(html: string, re: RegExp): string[] {
  const set = new Set<string>()
  for (const m of html.matchAll(re)) set.add(m[1])
  return [...set]
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ticketmaster').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%ticketmaster.com.br%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) {
    console.error('[ticketmaster] getKnown falhou', String(e))
  }
  return s
}

/** Descobre slugs de evento: home + páginas /page/ linkadas (2 níveis). */
async function descobrirSlugs(ctx: { notas?: string[] }, maxPages: number): Promise<string[]> {
  const EV_RE = /\/event\/([a-z0-9][a-z0-9-]*)/gi
  const PG_RE = /\/page\/([a-z0-9][a-z0-9-]*)/gi
  const slugs = new Set<string>()

  // Diagnóstico do fetch da home (status + bytes) — ajuda a ver bloqueio/challenge.
  let status = -1
  let home: string | null = null
  try {
    const res = await fetch(viaProxy(`${HOST}/`), { headers: HEADERS, signal: AbortSignal.timeout(45000) })
    status = res.status
    if (res.ok) home = await res.text()
  } catch (e) {
    ctx.notas?.push(`Ticketmaster: home fetch erro: ${String(e).slice(0, 120)}`)
  }
  if (home) for (const s of matchAll(home, EV_RE)) slugs.add(s)
  ctx.notas?.push(`Ticketmaster: home HTTP ${status}, ${home?.length ?? 0} bytes, ${slugs.size} eventos${PROXY ? ' (via proxy)' : ' (SEM proxy)'}`)
  if (!home) return []

  const pages = matchAll(home, PG_RE).slice(0, maxPages)
  for (let i = 0; i < pages.length; i += BATCH) {
    const slice = pages.slice(i, i + BATCH)
    const htmls = await Promise.all(slice.map((p) => get(`${HOST}/page/${p}`)))
    for (const h of htmls) if (h) for (const s of matchAll(h, EV_RE)) slugs.add(s)
  }
  return [...slugs]
}

interface LdEvent {
  '@type'?: string | string[]
  name?: string
  startDate?: string
  endDate?: string
  image?: string | string[]
  location?: { name?: string; address?: { addressLocality?: string; addressRegion?: string } }
  offers?: { price?: number; priceCurrency?: string }[]
  // deno-lint-ignore no-explicit-any
  performer?: any
}

/** Acha o nó schema.org/Event entre os blocos <script type="application/ld+json">. */
function parseLdEvent(html: string): LdEvent | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      const j = JSON.parse(m[1].trim())
      // deno-lint-ignore no-explicit-any
      const nodes: any[] = Array.isArray(j) ? j : Array.isArray(j['@graph']) ? j['@graph'] : [j]
      for (const node of nodes) {
        const t = node?.['@type']
        const isEvent = t === 'Event' || (Array.isArray(t) && t.includes('Event')) ||
          (typeof t === 'string' && /Event$/.test(t))
        if (isEvent && node?.name) return node as LdEvent
      }
    } catch {
      // bloco inválido — ignora
    }
  }
  return null
}

// UF a partir da cidade (capitais + grandes cidades). Fallback null.
const UF_POR_CIDADE: Record<string, string> = {
  'sao paulo': 'SP', 'campinas': 'SP', 'ribeirao preto': 'SP', 'santos': 'SP',
  'sao caetano do sul': 'SP', 'sao jose dos campos': 'SP', 'sorocaba': 'SP', 'guarulhos': 'SP',
  'rio de janeiro': 'RJ', 'niteroi': 'RJ',
  'belo horizonte': 'MG', 'uberlandia': 'MG', 'contagem': 'MG', 'juiz de fora': 'MG',
  'curitiba': 'PR', 'londrina': 'PR', 'maringa': 'PR',
  'porto alegre': 'RS', 'caxias do sul': 'RS', 'pelotas': 'RS',
  'florianopolis': 'SC', 'joinville': 'SC', 'blumenau': 'SC',
  'salvador': 'BA', 'feira de santana': 'BA',
  'recife': 'PE', 'olinda': 'PE',
  'fortaleza': 'CE', 'brasilia': 'DF', 'goiania': 'GO', 'manaus': 'AM',
  'belem': 'PA', 'sao luis': 'MA', 'natal': 'RN', 'joao pessoa': 'PB',
  'maceio': 'AL', 'aracaju': 'SE', 'teresina': 'PI', 'cuiaba': 'MT',
  'campo grande': 'MS', 'vitoria': 'ES', 'vila velha': 'ES', 'serra': 'ES',
}
function ufDeCidade(cidade: string | null): string | null {
  if (!cidade) return null
  const k = cidade.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return UF_POR_CIDADE[k] ?? null
}

async function fetchDetalhe(slug: string): Promise<RawEvent | null> {
  const url = eventUrl(slug)
  const html = await get(url)
  if (!html) return null
  const ld = parseLdEvent(html)
  if (!ld?.name) return null

  const precos = (ld.offers ?? [])
    .map((o) => Number(o?.price))
    .filter((v) => Number.isFinite(v) && v > 0)
  const cidade = ld.location?.address?.addressLocality ?? null
  const uf = (ld.location?.address?.addressRegion || ufDeCidade(cidade)) ?? null
  const imagem = typeof ld.image === 'string' ? ld.image : Array.isArray(ld.image) ? ld.image[0] ?? null : null
  const perf = ld.performer
  const performer = Array.isArray(perf)
    ? perf.map((p) => p?.name).filter(Boolean).join(', ') || null
    : (perf?.name ?? null)

  return {
    url_evento: url,
    nome: ld.name,
    data_inicio: ld.startDate ?? null,
    data_fim: ld.endDate ?? null,
    organizador_raw: null,
    organizador_url: null,
    local_raw: ld.location?.name ?? null,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min: precos.length ? Math.min(...precos) : null,
    preco_max: precos.length ? Math.max(...precos) : null,
    taxa_pct: null,
    gratuito: false,
    online: false,
    categoria: null,
    imagem_url: imagem,
    descricao: null,
    raw: { slug, performer },
  }
}

export const ticketmasterScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))
  const maxPages = Math.max(0, Number(cfg.max_pages ?? MAX_PAGES))

  const slugs = await descobrirSlugs(ctx, maxPages)
  if (!slugs.length) {
    ctx.notas?.push('Ticketmaster: descoberta vazia (HTTP/challenge?)')
    return []
  }

  // Reprocessar CAMINHA por um offset; coleta normal pega só os ainda-novos.
  let alvo: string[]
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = slugs.slice(off, off + cap)
    const novoOff = off + alvo.length
    const fim = novoOff >= slugs.length || alvo.length === 0
    if (src) await db.from('crawler_sources').update({ config: { ...cfg, reproc_offset: fim ? 0 : novoOff } }).eq('id', src.id)
    ctx.notas?.push(`Ticketmaster: reprocessando ${off}–${novoOff} de ${slugs.length}${fim ? ' (fim → reinicia)' : ''}`)
  } else {
    const known = await getKnown(db)
    alvo = slugs.filter((s) => !known.has(eventUrl(s))).slice(0, cap)
    ctx.notas?.push(`Ticketmaster: descobertos ${slugs.length}, novos ${alvo.length}`)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((s) => fetchDetalhe(s)))
    for (const ev of mapped) if (ev) out.push(ev)
  }
  console.log(`[ticketmaster] slugs=${slugs.length} alvo=${alvo.length} coletados=${out.length} reproc=${ctx.reprocessar}`)
  return out
}
