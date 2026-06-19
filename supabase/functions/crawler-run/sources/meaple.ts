// Fonte: Meaple (meaple.com.br) — Next.js client-side com API JSON aberta.
//   Descoberta: GET api.meaple.com.br/v1/sitemaps/events.xml -> <loc> com as
//     URLs públicas meaple.com.br/<canal>/<slug> (catálogo completo, ~4,6k).
//   Detalhe: GET /v1/channels/<canal>/events/<slug> -> name, startsAt, endsAt,
//     address (name=local, city, state, country), channel (organizador),
//     categories, image.
//   Preço: GET /v1/events/<id>/tickets -> tickets[].price (mín/máx).
//
// Catálogo completo a cada execução (sitemap); coleta normal pega os ainda-novos
// (skip-known) em blocos; reprocessar caminha por um offset.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const SITE = 'https://meaple.com.br'
const API = 'https://api.meaple.com.br/v1'
const SITEMAP = `${API}/sitemaps/events.xml`
const MAX_DETALHES = 40 // teto de eventos detalhados por execução (2 chamadas cada)
const BATCH = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const NOME_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
}
function ufDe(estado: string | null | undefined): string | null {
  if (!estado) return null
  if (estado.length === 2) return estado.toUpperCase()
  const k = estado.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return NOME_UF[k] ?? null
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'meaple').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%meaple.com.br%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) {
    console.error('[meaple] getKnown falhou', String(e))
  }
  return s
}

async function descobrirUrls(): Promise<string[]> {
  try {
    const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return []
    const xml = await res.text()
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
      .map((m) => m[1].trim())
      .filter((u) => u.includes('meaple.com.br/'))
    return [...new Set(urls)]
  } catch (e) {
    console.error('[meaple] sitemap falhou', String(e))
    return []
  }
}

/** Menor/maior preço em qualquer ticket aninhado (setores/lotes). */
function precosDe(ticketsJson: unknown): { min: number | null; max: number | null } {
  const vals: number[] = []
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>
      const p = Number(rec.price)
      if (Number.isFinite(p) && p > 0) vals.push(p)
      for (const v of Object.values(rec)) walk(v)
    }
  }
  walk(ticketsJson)
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: null, max: null }
}

async function fetchDetalhe(url: string): Promise<RawEvent | null> {
  let ch = '', slug = ''
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    ch = parts[parts.length - 2]
    slug = parts[parts.length - 1]
  } catch {
    return null
  }

  // deno-lint-ignore no-explicit-any
  const raw = await getJson(`${API}/channels/${encodeURIComponent(ch)}/events/${encodeURIComponent(slug)}`) as any
  const ev = raw?.event ?? raw
  if (!ev?.name || !ev?.id) return null
  if (ev.canceledAt || (ev.status && ev.status !== 'PUBLISHED')) return null

  const tickets = await getJson(`${API}/events/${ev.id}/tickets`)
  const { min, max } = precosDe(tickets)

  const addr = ev.address ?? {}
  const img = typeof ev.image === 'string' ? ev.image : (ev.image?.url ?? null)
  const cats = Array.isArray(ev.categories)
    ? ev.categories.map((c: unknown) => (typeof c === 'string' ? c : (c as { name?: string })?.name)).filter(Boolean)
    : []

  return {
    url_evento: url,
    nome: String(ev.name),
    data_inicio: ev.startsAt ?? null,
    data_fim: ev.endsAt ?? null,
    organizador_raw: ev.channel?.name ?? null,
    organizador_url: ev.channel?.slug ? `${SITE}/${ev.channel.slug}` : null,
    local_raw: addr.name ?? null,
    cidade: addr.city ?? null,
    uf: ufDe(addr.state),
    pais: addr.country ?? 'Brasil',
    preco_min: min,
    preco_max: max,
    taxa_pct: null,
    gratuito: false,
    online: false,
    categoria: cats.join(', ') || null,
    imagem_url: img,
    descricao: null,
    raw: { id: ev.id, canal: ch, slug },
  }
}

export const meapleScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))

  const urls = await descobrirUrls()
  if (!urls.length) {
    ctx.notas?.push('Meaple: sitemap vazio (HTTP?)')
    return []
  }

  // Reprocessar CAMINHA por um offset; coleta normal pega só os ainda-novos.
  let alvo: string[]
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = urls.slice(off, off + cap)
    const novoOff = off + alvo.length
    const fim = novoOff >= urls.length || alvo.length === 0
    if (src) await db.from('crawler_sources').update({ config: { ...cfg, reproc_offset: fim ? 0 : novoOff } }).eq('id', src.id)
    ctx.notas?.push(`Meaple: reprocessando ${off}–${novoOff} de ${urls.length}${fim ? ' (fim → reinicia)' : ''}`)
  } else {
    const known = await getKnown(db)
    alvo = urls.filter((u) => !known.has(u)).slice(0, cap)
    ctx.notas?.push(`Meaple: descobertos ${urls.length}, novos ${alvo.length}`)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((u) => fetchDetalhe(u)))
    for (const ev of mapped) if (ev) out.push(ev)
  }
  console.log(`[meaple] urls=${urls.length} alvo=${alvo.length} coletados=${out.length} reproc=${ctx.reprocessar}`)
  return out
}
