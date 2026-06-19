// Fonte: Ticket360 (ticket360.com.br) — SSR. Sem API; descoberta POR ESTADO.
//   Listagem: GET /sub-categoria/<id>/<estado>[/?p=N] -> <script ld+json>
//     com @type ItemList -> itemListElement[].url (/evento/<id>/ingressos-para-…).
//   Detalhe: GET /evento/<id>/<slug> -> ld+json @type *Event com name, startDate,
//     endDate, location (name + addressLocality + addressRegion), offers
//     (AggregateOffer lowPrice/highPrice, ou array de Offer.price) -> preço.
//   Organizador e taxa não expostos -> null.
//
// Descoberta vê o catálogo (estados) a cada execução; coleta normal pega os
// ainda-novos (skip-known) em blocos; reprocessar caminha por um offset.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.ticket360.com.br'
const MAX_DETALHES = 80 // teto de detalhes por execução (run rápida ~6s no anterior)
const MAX_PG_UF = 6 // teto de páginas por estado na descoberta
const BATCH = 5
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'pt-BR',
}

// Estados com eventos no Ticket360 (sub-categoria id + slug + UF).
const ESTADOS: { id: number; slug: string; uf: string }[] = [
  { id: 211, slug: 'sao-paulo', uf: 'SP' },
  { id: 212, slug: 'rio-de-janeiro', uf: 'RJ' },
  { id: 213, slug: 'minas-gerais', uf: 'MG' },
  { id: 215, slug: 'parana', uf: 'PR' },
  { id: 216, slug: 'bahia', uf: 'BA' },
  { id: 217, slug: 'rio-grande-do-sul', uf: 'RS' },
  { id: 219, slug: 'distrito-federal', uf: 'DF' },
  { id: 220, slug: 'mato-grosso-do-sul', uf: 'MS' },
  { id: 628, slug: 'ceara', uf: 'CE' },
  { id: 661, slug: 'rio-grande-do-norte', uf: 'RN' },
]

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ticket360').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%ticket360.com.br%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) {
    console.error('[ticket360] getKnown falhou', String(e))
  }
  return s
}

// deno-lint-ignore no-explicit-any
function ldBlocks(html: string): any[] {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  // deno-lint-ignore no-explicit-any
  const out: any[] = []
  for (const m of html.matchAll(re)) {
    try { out.push(JSON.parse(m[1].trim())) } catch { /* bloco inválido */ }
  }
  return out
}

/** URLs de evento de uma página de listagem (JSON-LD ItemList). */
function itemListUrls(html: string): string[] {
  const urls: string[] = []
  for (const j of ldBlocks(html)) {
    if (j?.['@type'] === 'ItemList' && Array.isArray(j.itemListElement)) {
      for (const it of j.itemListElement) if (it?.url) urls.push(String(it.url))
    }
  }
  return urls
}

/** Descobre os eventos de um estado, paginando até esvaziar (ou o teto). */
async function descobrirEstado(
  e: { id: number; slug: string; uf: string },
  maxPg: number,
): Promise<{ url: string; uf: string }[]> {
  const out: { url: string; uf: string }[] = []
  const vistos = new Set<string>()
  for (let p = 1; p <= maxPg; p++) {
    const url = p === 1 ? `${HOST}/sub-categoria/${e.id}/${e.slug}` : `${HOST}/sub-categoria/${e.id}/${e.slug}/?p=${p}`
    const html = await get(url)
    if (!html) break
    const urls = itemListUrls(html).filter((u) => !vistos.has(u))
    if (urls.length === 0) break // fim das páginas do estado
    for (const u of urls) { vistos.add(u); out.push({ url: u, uf: e.uf }) }
  }
  return out
}

// deno-lint-ignore no-explicit-any
function isEventNode(node: any): boolean {
  const t = node?.['@type']
  if (typeof t === 'string') return /Event$/.test(t)
  if (Array.isArray(t)) return t.some((x) => /Event$/.test(String(x)))
  return false
}

// deno-lint-ignore no-explicit-any
function precosDe(offers: any): { min: number | null; max: number | null } {
  if (!offers) return { min: null, max: null }
  if (Array.isArray(offers)) {
    const ps = offers.map((o) => Number(o?.price)).filter((v) => Number.isFinite(v) && v > 0)
    return ps.length ? { min: Math.min(...ps), max: Math.max(...ps) } : { min: null, max: null }
  }
  const lo = Number(offers.lowPrice)
  const hi = Number(offers.highPrice)
  if (Number.isFinite(lo) || Number.isFinite(hi)) {
    return { min: Number.isFinite(lo) ? lo : hi, max: Number.isFinite(hi) ? hi : lo }
  }
  const p = Number(offers.price)
  return Number.isFinite(p) && p > 0 ? { min: p, max: p } : { min: null, max: null }
}

async function fetchDetalhe(url: string, ufFallback: string): Promise<RawEvent | null> {
  const html = await get(url)
  if (!html) return null
  const node = ldBlocks(html).flatMap((j) =>
    Array.isArray(j) ? j : Array.isArray(j?.['@graph']) ? j['@graph'] : [j],
  ).find((n) => isEventNode(n) && n?.name)
  if (!node) return null

  const { min, max } = precosDe(node.offers)
  const addr = node.location?.address ?? {}
  const imagem = typeof node.image === 'string'
    ? node.image
    : Array.isArray(node.image) ? node.image[0] ?? null : null

  return {
    url_evento: url,
    nome: String(node.name),
    data_inicio: node.startDate ?? null,
    data_fim: node.endDate ?? null,
    organizador_raw: null,
    organizador_url: null,
    local_raw: node.location?.name ?? null,
    cidade: addr.addressLocality ?? null,
    uf: addr.addressRegion || ufFallback || null,
    pais: 'Brasil',
    preco_min: min,
    preco_max: max,
    taxa_pct: null,
    gratuito: false,
    online: false,
    categoria: null,
    imagem_url: imagem,
    descricao: null,
    raw: { url },
  }
}

export const ticket360Scraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))
  const maxPg = Math.max(1, Number(cfg.paginas_por_estado ?? MAX_PG_UF))

  // Descobre todos os eventos (estados em paralelo), dedup por URL.
  const listas = await Promise.all(ESTADOS.map((e) => descobrirEstado(e, maxPg)))
  const ufByUrl = new Map<string, string>()
  for (const lista of listas) for (const it of lista) if (!ufByUrl.has(it.url)) ufByUrl.set(it.url, it.uf)
  const urls = [...ufByUrl.keys()]
  if (!urls.length) {
    ctx.notas?.push('Ticket360: descoberta vazia (HTTP/challenge?)')
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
    ctx.notas?.push(`Ticket360: reprocessando ${off}–${novoOff} de ${urls.length}${fim ? ' (fim → reinicia)' : ''}`)
  } else {
    const known = await getKnown(db)
    alvo = urls.filter((u) => !known.has(u)).slice(0, cap)
    ctx.notas?.push(`Ticket360: descobertos ${urls.length}, novos ${alvo.length}`)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((u) => fetchDetalhe(u, ufByUrl.get(u) ?? '')))
    for (const ev of mapped) if (ev) out.push(ev)
  }
  console.log(`[ticket360] urls=${urls.length} alvo=${alvo.length} coletados=${out.length} reproc=${ctx.reprocessar}`)
  return out
}
