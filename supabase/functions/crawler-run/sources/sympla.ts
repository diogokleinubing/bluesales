// Fonte: Sympla — descoberta via sitemap + APIs de BFF (JSON limpo).
//
// Descoberta: sitemap-eventos.xml lista ~31k eventos (slug__id), aberto e sem
// Queue-it. Pré-filtra pelo slug com a cidade-alvo e pula os já coletados.
//
// Dados: dois endpoints de backend (host event-page.svc, sem Queue-it/HTML):
//   GET /api/event-bff/purchase/event/<id>          -> evento completo (JSON)
//   GET /api/event-bff/purchase/event/<id>/tickets/grouped -> lotes/preços
//
// Limitação: cobre eventos cujo slug cita a cidade (teto por execução, logado).

import type { RawEvent, Scraper, ScrapeContext } from '../../_shared/types.ts'
import { norm, normPais } from '../../_shared/classify.ts'
import { adminClient } from '../../_shared/db.ts'

const SITEMAP = 'https://www.sympla.com.br/sitemap-eventos.xml'
const API = 'https://event-page.svc.sympla.com.br/api/event-bff/purchase/event'
const MAX_POR_CIDADE = 15

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// --- memo por invocação ---------------------------------------------------
let sitemapCache: string[] | null = null
let knownIdsCache: Set<string> | null = null

/** Extrai o id do evento da URL do sitemap (…/<slug>__<id>). */
function idDaUrl(u: string): string | null {
  const m = u.match(/__(\d+)(?:[/?#]|$)/)
  return m ? m[1] : null
}

const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000 // 24h

async function getSitemapUrls(): Promise<string[]> {
  if (sitemapCache) return sitemapCache // memo da invocação
  const db = adminClient()

  // 1) Cache no banco (válido por 24h) — evita rebaixar a Sympla a cada run.
  try {
    const { data } = await db
      .from('crawler_cache')
      .select('sitemap, fetched_at')
      .eq('source_slug', 'sympla')
      .maybeSingle()
    if (data?.sitemap && Array.isArray(data.sitemap) && data.fetched_at) {
      const age = Date.now() - new Date(data.fetched_at).getTime()
      if (age < SITEMAP_TTL_MS) {
        sitemapCache = data.sitemap as string[]
        return sitemapCache
      }
    }
  } catch (e) {
    console.error('[sympla] cache leitura', String(e))
  }

  // 2) Cache vencido/ausente: busca fresco e regrava.
  try {
    const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA } })
    const xml = await res.text()
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim())
    sitemapCache = urls
    await db.from('crawler_cache').upsert({
      source_slug: 'sympla',
      sitemap: urls,
      fetched_at: new Date().toISOString(),
    })
    console.log(`[sympla] sitemap atualizado no cache (${urls.length} urls)`)
  } catch (e) {
    console.error('[sympla] sitemap falhou', String(e))
    sitemapCache = sitemapCache ?? []
  }
  return sitemapCache
}

async function getKnownIds(): Promise<Set<string>> {
  if (knownIdsCache) return knownIdsCache
  const s = new Set<string>()
  try {
    const db = adminClient()
    const { data } = await db
      .from('crawled_events')
      .select('raw, url_evento')
      .ilike('url_evento', '%sympla.com.br%')
      .limit(100000)
    for (const r of data ?? []) {
      const rawId = (r.raw as { id?: number | string } | null)?.id
      if (rawId != null) s.add(String(rawId))
      const urlId = idDaUrl(String(r.url_evento ?? ''))
      if (urlId) s.add(urlId)
    }
  } catch (e) {
    console.error('[sympla] getKnownIds falhou', String(e))
  }
  knownIdsCache = s
  return s
}

// --- tipos da API ---------------------------------------------------------
interface SymplaEvent {
  id?: number | string
  name?: string
  cancelled?: boolean
  published?: boolean
  visible?: boolean
  onlineInfo?: unknown
  paymentEventType?: string // "paid" | "free" | ...
  startDate?: string
  endDate?: string
  startDateMultiFormat?: { ISO8601?: string }
  endDateMultiFormat?: { ISO8601?: string }
  oldUrl?: string
  newUrl?: string
  slug?: string
  serviceFee?: number
  eventsAddress?: { name?: string; city?: string; state?: string; country?: string }
  eventsHost?: { name?: string }
  eventsCategory?: { description?: string; vertical?: string }
  images?: { logoLarge?: string; logoUrl?: string }
}

interface SymplaTicket {
  show?: boolean
  isFree?: boolean
  salePriceMonetary?: { decimal?: number }
}

async function fetchEvento(id: string): Promise<SymplaEvent | null> {
  try {
    const res = await fetch(`${API}/${id}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json() as SymplaEvent
  } catch (e) {
    console.error('[sympla] fetchEvento falhou', id, String(e))
    return null
  }
}

async function fetchPrecos(
  id: string,
): Promise<{ min: number | null; max: number | null; gratuito: boolean } | null> {
  try {
    const res = await fetch(`${API}/${id}/tickets/grouped`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json() as {
      tickets?: SymplaTicket[]
      groups?: { tickets?: SymplaTicket[] }[]
    }
    let pool = (data.tickets ?? []).filter((t) => t.show !== false)
    if (!pool.length) {
      pool = (data.groups ?? []).flatMap((g) => g.tickets ?? []).filter((t) => t.show !== false)
    }
    if (!pool.length) return null
    const pagos = pool.filter((t) => !t.isFree)
    if (!pagos.length) return { min: 0, max: 0, gratuito: true }
    const precos = pagos
      .map((t) => t.salePriceMonetary?.decimal)
      .filter((v): v is number => typeof v === 'number')
    if (!precos.length) return null
    return { min: Math.min(...precos), max: Math.max(...precos), gratuito: false }
  } catch (e) {
    console.error('[sympla] precos falhou', id, String(e))
    return null
  }
}

/** Monta o RawEvent a partir do evento da API (reusado por coleta e backfill). */
function toRawEvent(
  ev: SymplaEvent,
  id: string,
  urlEvento: string,
  precos: { min: number | null; max: number | null; gratuito: boolean } | null,
  ehFree: boolean,
): RawEvent {
  const dataIni = ev.startDateMultiFormat?.ISO8601 ?? ev.startDate ?? null
  return {
    url_evento: urlEvento,
    nome: ev.name!,
    data_inicio: dataIni,
    data_fim: ev.endDateMultiFormat?.ISO8601 ?? ev.endDate ?? null,
    organizador_raw: ev.eventsHost?.name ?? null,
    organizador_url: null,
    local_raw: ev.eventsAddress?.name ?? null,
    cidade: ev.eventsAddress?.city ?? null,
    uf: ev.eventsAddress?.state ?? null,
    pais: normPais(ev.eventsAddress?.country),
    preco_min: precos?.min ?? null,
    preco_max: precos?.max ?? null,
    taxa_pct: typeof ev.serviceFee === 'number' ? ev.serviceFee : null,
    gratuito: ehFree || (precos?.gratuito ?? false),
    online: !!ev.onlineInfo,
    categoria: ev.eventsCategory?.description ?? null,
    imagem_url: ev.images?.logoLarge ?? ev.images?.logoUrl ?? null,
    descricao: null,
    raw: {
      id: ev.id,
      slug: ev.slug,
      categoria: ev.eventsCategory?.description ?? null,
      vertical: ev.eventsCategory?.vertical ?? null,
    },
  }
}

async function getSource(): Promise<{ id: string; cfg: Record<string, unknown> } | null> {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'sympla').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const symplaScraper: Scraper = async (ctx: ScrapeContext) => {
  const { cidade } = ctx
  const semCidade = !cidade // fonte sem cidades cadastradas -> não filtra por cidade

  const urls = await getSitemapUrls()
  const known = await getKnownIds()

  const ids: string[] = []
  let srcId: string | null = null
  let novoOffset: number | null = null

  if (semCidade) {
    // Caminha o sitemap a partir do offset ACUMULANDO até `cap` NOVOS — pula os
    // já coletados/online de graça (só checagem em memória), sem gastar o ciclo.
    // Assim cada run rende um lote cheio de trabalho real (não uma janela que
    // pode estar quase toda já coletada). O offset avança o quanto for preciso.
    const src = await getSource()
    srcId = src?.id ?? null
    const cfg = src?.cfg ?? {}
    const cap = Number(cfg.scan ?? 150)
    let i = urls.length ? Number(cfg.sitemap_offset ?? 0) % urls.length : 0
    while (ids.length < cap && i < urls.length) {
      const u = urls[i]; i++
      if (/online/i.test(u)) continue
      const id = idDaUrl(u)
      if (!id || known.has(id)) continue
      ids.push(id)
    }
    novoOffset = i >= urls.length ? 0 : i // chegou ao fim do sitemap -> recomeça
  } else {
    const cidadeToken = norm(cidade).replace(/ /g, '-') // "São Paulo" -> "sao-paulo"
    for (const u of urls) {
      if (!u.includes(cidadeToken) || /online/i.test(u)) continue
      const id = idDaUrl(u)
      if (!id || known.has(id)) continue
      ids.push(id)
      if (ids.length >= MAX_POR_CIDADE) break
    }
  }

  const agora = Date.now()
  const out: RawEvent[] = []

  // Busca os novos em lotes paralelos (evento + preço por evento em paralelo).
  const BATCH = 8
  for (let b = 0; b < ids.length; b += BATCH) {
    const slice = ids.slice(b, b + BATCH)
    const mapped = await Promise.all(slice.map(async (id) => {
      const ev = await fetchEvento(id)
      if (!ev?.name) return null
      if (ev.cancelled || ev.published === false || ev.visible === false) return null

      const cidadeEv = ev.eventsAddress?.city ?? null
      if (!semCidade && (!cidadeEv || norm(cidadeEv) !== norm(cidade))) return null

      // Capturamos eventos passados também (sem data não descarta). Só não
      // buscamos preço de evento já encerrado (venda fechada).
      const dataIni = ev.startDateMultiFormat?.ISO8601 ?? ev.startDate ?? null
      const t = dataIni ? Date.parse(dataIni) : NaN
      const ehPassado = !isNaN(t) && t < agora - 86_400_000

      const ehFree = (ev.paymentEventType ?? '').toLowerCase() === 'free'
      const precos = (ehFree || ehPassado) ? null : await fetchPrecos(id)
      const urlEvento = ev.oldUrl ?? `https://www.sympla.com.br/${ev.slug ?? ''}__${id}`
      return toRawEvent(ev, id, urlEvento, precos, ehFree)
    }))
    for (const r of mapped) if (r) out.push(r)
  }

  if (semCidade && srcId && novoOffset != null) {
    const db = adminClient()
    const { data: cur } = await db.from('crawler_sources').select('config').eq('id', srcId).maybeSingle()
    const cfg = (cur?.config ?? {}) as Record<string, unknown>
    await db.from('crawler_sources').update({
      config: { ...cfg, sitemap_offset: novoOffset, sitemap_total: urls.length },
    }).eq('id', srcId)
    console.log(`[sympla] sitemap_offset -> ${novoOffset} (${ids.length} novos, ${out.length} válidos)`)
  }

  return out
}
