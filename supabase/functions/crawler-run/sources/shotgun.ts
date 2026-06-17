// Fonte: Shotgun (shotgun.live) — eventos eletrônicos/clubes/raves (Next.js).
//   Cidades: GET /api/data/areas-by-country  -> lista por país; filtramos BR
//     (66+ áreas { slug, name }). É o catálogo de cidades da plataforma.
//   Lista da cidade: GET /pt-br/cities/<slug>  (HTML SSR) -> cards com
//     href="/pt-br/events/<slug>" (descoberta dos eventos da cidade).
//   Detalhe: GET /pt-br/events/<slug>  (HTML SSR) com dados estruturados:
//     - JSON-LD "@type":"MusicEvent" -> nome, datas (ISO), descrição, imagem,
//         location (endereço + geo), organizer (nome/url), offers (preço+moeda).
//     - HTML server-side da seção "Mood" -> gênero (categoria).
//     - blob RSC (__next_f) -> venue real (geolocation.venue) quando houver.
//   UF não vem estruturada: extraída do endereço ("… - ES, 29010-060, Brasil").
//   Cidade vem do `name` da área que estamos varrendo (addressLocality é bairro).
//
// Varredura incremental por cidade: config.city_cursor avança um bloco de
// cidades por execução (wrap no fim). Eventos já coletados são pulados no
// detalhe (skip-known), salvo `reprocessar`. O "Rodar em lote" cobre todas.
//
// ⚠️ Shotgun fica atrás do challenge de bots da Vercel (HTTP 429
// x-vercel-mitigated: challenge a partir de IPs de datacenter). Validar o
// retorno cru A PARTIR do runtime da Edge Function (supabase functions logs),
// não de máquina local. Se o runtime também for desafiado, vira caso de worker
// com browser (fora do escopo destas Edge Functions).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://shotgun.live'
const AREAS = `${HOST}/api/data/areas-by-country`
const CITIES_PER_RUN = 8 // cidades varridas por execução (cursor avança)
const MAX_DETALHES = 80 // teto de páginas de detalhe por execução
const BATCH = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/json,application/xhtml+xml,*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Referer: `${HOST}/pt-br`,
}

/** GET com 1 retry em 429 (challenge/rate-limit). Retorna texto ou null. */
async function get(url: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 503) {
        if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1500)); continue }
        console.error('[shotgun] challenge/HTTP', res.status, url)
        return null
      }
      if (!res.ok) { console.error('[shotgun] HTTP', res.status, url); return null }
      return await res.text()
    } catch (e) {
      if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[shotgun] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

interface Area { slug: string; name: string }

/** Lista de cidades do Brasil (ordenada por slug, estável p/ o cursor). */
async function fetchCidadesBR(): Promise<Area[]> {
  const txt = await get(AREAS)
  if (!txt) return []
  let data: { countryCode: string; areas: Area[] }[]
  try { data = JSON.parse(txt) } catch { console.error('[shotgun] areas não-JSON (challenge?)'); return [] }
  const br = data.find((c) => c.countryCode === 'BR')?.areas ?? []
  return [...br].filter((a) => a.slug && a.name).sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Slugs de evento de uma página de cidade (cards SSR href="/pt-br/events/…"). */
function eventSlugsDe(html: string): string[] {
  const slugs = new Set<string>()
  for (const m of html.matchAll(/href="\/pt-br\/events\/([a-z0-9][a-z0-9-]*)"/g)) slugs.add(m[1])
  return [...slugs]
}

/** Primeiro objeto JSON-LD com "@type":"MusicEvent" da página de detalhe. */
function musicEventLD(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes('"MusicEvent"')) continue
    try {
      const obj = JSON.parse(m[1]) as Record<string, unknown>
      if (obj['@type'] === 'MusicEvent') return obj
    } catch { /* tenta o próximo */ }
  }
  return null
}

/** Gênero (categoria) pela seção "Mood" do HTML SSR (1º chip de gênero). */
function categoriaDe(html: string): string | null {
  const i = html.indexOf('>Mood<')
  const trecho = i >= 0 ? html.slice(i, i + 1200) : ''
  const m = trecho.match(/href="\/pt-br\/cities\/[a-z0-9-]+\/[a-z0-9-]+"[^>]*>([^<]+)<\/a>/)
  return m ? m[1].trim() : null
}

/** Venue real do blob RSC (geolocation.venue), quando preenchido. */
function venueDe(html: string): string | null {
  const m = html.match(/\\"geolocation\\":\{[^]*?\\"venue\\":\\"([^"\\]*)\\"/)
  return m && m[1].trim() ? m[1].trim() : null
}

/** UF a partir do endereço: "… - ES, 29010-060, Brasil" / "… - SP, Brasil". */
function ufDe(endereco: string | null | undefined): string | null {
  if (!endereco) return null
  const m = endereco.match(/-\s*([A-Z]{2})\s*,\s*(?:\d{5}-?\d{3}|Bra[sz]il)/)
  return m ? m[1] : null
}

interface LDOffer { price?: number; priceCurrency?: string }
interface LDLocation { name?: string; address?: { addressLocality?: string }; geo?: unknown }

async function fetchDetalhe(slug: string, cidade: string): Promise<RawEvent | null> {
  const url = `${HOST}/pt-br/events/${slug}`
  const html = await get(url)
  if (!html) return null
  const ld = musicEventLD(html)
  if (!ld || !ld.name) return null

  const location = (ld.location ?? {}) as LDLocation
  const organizer = (ld.organizer ?? {}) as { name?: string; url?: string }
  const offers = (Array.isArray(ld.offers) ? ld.offers : []) as LDOffer[]

  const precos = offers
    .map((o) => Number(o.price))
    .filter((p) => Number.isFinite(p))
  const pos = precos.filter((p) => p > 0)
  const gratuito = precos.length > 0 && pos.length === 0
  const preco_min = pos.length ? Math.min(...pos) : (gratuito ? 0 : null)
  const preco_max = pos.length ? Math.max(...pos) : (gratuito ? 0 : null)

  const venue = venueDe(html) ?? location.address?.addressLocality ?? null
  const endereco = location.name ?? null

  return {
    url_evento: url,
    nome: String(ld.name),
    data_inicio: (ld.startDate as string) ?? null,
    data_fim: (ld.endDate as string) ?? null,
    organizador_raw: organizer.name ?? null,
    organizador_url: organizer.url ?? null,
    local_raw: venue ?? endereco,
    cidade,
    uf: ufDe(endereco),
    pais: 'Brasil',
    preco_min,
    preco_max,
    taxa_pct: null, // Shotgun não expõe taxa estruturada na página pública
    gratuito,
    online: false,
    categoria: categoriaDe(html),
    imagem_url: typeof ld.image === 'string' ? ld.image : null,
    descricao: typeof ld.description === 'string' ? ld.description : null,
    raw: { slug, endereco, currency: offers[0]?.priceCurrency ?? null },
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'shotgun').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

/** URLs já coletadas (dedupe / skip-known no detalhe). */
async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%shotgun.live%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[shotgun] getKnown falhou', String(e)) }
  return s
}

export const shotgunScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const passo = Math.max(1, Number(cfg.cidades_por_run ?? CITIES_PER_RUN))

  const cidades = await fetchCidadesBR()
  if (!cidades.length) {
    ctx.notas?.push('Shotgun: lista de cidades vazia (challenge da Vercel?)')
    return []
  }

  // Bloco de cidades desta execução (cursor avança; wrap no fim).
  let start = Math.max(0, Number(cfg.city_cursor ?? 0))
  if (start >= cidades.length) start = 0
  const bloco = cidades.slice(start, start + passo)
  const prox = start + passo >= cidades.length ? 0 : start + passo

  // Descoberta: slugs de evento das cidades do bloco (cidade de origem junto).
  const candidatos: { slug: string; cidade: string }[] = []
  const vistos = new Set<string>()
  for (const c of bloco) {
    const html = await get(`${HOST}/pt-br/cities/${c.slug}`)
    if (!html) continue
    for (const slug of eventSlugsDe(html)) {
      if (vistos.has(slug)) continue
      vistos.add(slug)
      candidatos.push({ slug, cidade: c.name })
    }
  }

  // Normal: pula conhecidos, detalha os primeiros MAX_DETALHES e avança o cursor.
  // Reprocessar: CAMINHA por um offset DENTRO do bloco (recoleta os já existentes
  // em pedaços), segurando o city_cursor até esgotar o bloco — só então avança
  // para as próximas cidades (e zera o offset).
  let alvo: { slug: string; cidade: string }[]
  let cursorSalvar = prox
  const patch: Record<string, unknown> = {}
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = candidatos.slice(off, off + MAX_DETALHES)
    const fimBloco = off + alvo.length >= candidatos.length || alvo.length === 0
    if (!fimBloco) cursorSalvar = start // segura o bloco
    patch.reproc_offset = fimBloco ? 0 : off + alvo.length
  } else {
    const known = await getKnown(db)
    alvo = candidatos
      .filter((c) => !known.has(`${HOST}/pt-br/events/${c.slug}`))
      .slice(0, MAX_DETALHES)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((c) => fetchDetalhe(c.slug, c.cidade)))
    for (const ev of mapped) if (ev) out.push(ev)
  }

  patch.city_cursor = cursorSalvar
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, ...patch } }).eq('id', src.id)
  const faixa = bloco.map((c) => c.name).join(', ')
  ctx.notas?.push(
    `Shotgun: cidades ${start + 1}-${start + bloco.length}/${cidades.length} (${faixa}); ` +
    `candidatos=${candidatos.length}, detalhes=${alvo.length}; city_cursor ${start}->${cursorSalvar}${ctx.reprocessar ? ' (reproc)' : ''}`,
  )
  console.log(`[shotgun] cidades ${start}->${cursorSalvar} candidatos=${candidatos.length} detalhes=${alvo.length} novos=${out.length} reproc=${!!ctx.reprocessar}`)
  return out
}
