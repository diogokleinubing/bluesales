// Fonte: Sympla Bileto — plataforma de eventos grandes (bileto.sympla.com.br).
//
// Sistema separado do www: IDs próprios e API de BFF aberta (JSON, sem
// Queue-it). NÃO há sitemap (403), então a descoberta é por VARREDURA DE IDs:
//   GET https://bff-sales-api-cdn.bileto.sympla.com.br/api/v1/events/<id>
// Os IDs são ~cronológicos (eventos novos no topo). Avançamos um cursor
// (crawler_sources.config.id_cursor), pulando os já coletados e parando ao
// bater na fronteira (sequência de IDs inexistentes). Preço, capacidade e
// vendidos já vêm na própria resposta.

import type { RawEvent, Scraper, ScrapeContext } from '../../_shared/types.ts'
import { norm } from '../../_shared/classify.ts'
import { adminClient } from '../../_shared/db.ts'

const API = 'https://bff-sales-api-cdn.bileto.sympla.com.br/api/v1/events'
const MAX_SCAN = 800 // IDs varridos por execução
const MISS_STREAK = 40 // IDs inexistentes seguidos => fronteira
const BATCH = 10
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// venue.locale.state.name vem por extenso ("São Paulo") — mapeia para a UF.
const UF_POR_ESTADO: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA',
  ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO',
  maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
  pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO',
  roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE',
  tocantins: 'TO',
}
function ufDe(estado: string | null | undefined): string | null {
  if (!estado) return null
  return UF_POR_ESTADO[norm(estado)] ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BiletoEvent = any

interface Scanned { id: number; ev: BiletoEvent }
let scanCache: Scanned[] | null = null
let knownCache: Set<string> | null = null

async function fetchBileto(id: number): Promise<BiletoEvent | null> {
  try {
    const res = await fetch(`${API}/${id}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const j = await res.json()
    const ev = j?.data
    return ev?.id ? ev : null
  } catch {
    return null
  }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  if (knownCache) return knownCache
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%bileto.sympla.com.br%')
      .limit(100000)
    for (const r of data ?? []) {
      const m = String(r.url_evento ?? '').match(/event\/(\d+)/)
      if (m) s.add(m[1])
    }
  } catch (e) {
    console.error('[bileto] getKnown falhou', String(e))
  }
  knownCache = s
  return s
}

/** Varredura por faixa de ID (uma vez por invocação); avança o cursor. */
async function runScan(): Promise<Scanned[]> {
  if (scanCache) return scanCache
  scanCache = []
  const db = adminClient()
  const { data: src } = await db
    .from('crawler_sources')
    .select('id, config')
    .eq('slug', 'bileto')
    .maybeSingle()
  if (!src) return scanCache

  const cfg = (src.config ?? {}) as Record<string, unknown>
  const cursor = Number(cfg.id_cursor ?? 119000)
  const maxScan = Number(cfg.scan ?? MAX_SCAN)
  const known = await getKnown(db)

  let id = cursor + 1
  let scanned = 0
  let misses = 0
  let lastValid = cursor
  let stop = false
  const events: Scanned[] = []

  while (scanned < maxScan && !stop) {
    const ids: number[] = []
    for (let k = 0; k < BATCH && scanned < maxScan; k++) { ids.push(id); id++; scanned++ }
    const results = await Promise.all(
      ids.map(async (i) =>
        known.has(String(i)) ? { i, ev: 'KNOWN' as const } : { i, ev: await fetchBileto(i) },
      ),
    )
    for (const { i, ev } of results) {
      if (ev === 'KNOWN') { misses = 0; lastValid = i; continue }
      if (!ev) { misses++; if (misses >= MISS_STREAK) { stop = true; break } }
      else { misses = 0; lastValid = i; events.push({ id: i, ev }) }
    }
  }

  const newCursor = stop ? lastValid : id - 1
  await db.from('crawler_sources')
    .update({ config: { ...cfg, id_cursor: newCursor } })
    .eq('id', src.id)
  console.log(`[bileto] scan: cursor ${cursor} -> ${newCursor} (${scanned} ids, ${events.length} eventos)`)

  scanCache = events
  return scanCache
}

function cents(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n / 100 : null
}

function mapBileto(ev: BiletoEvent): RawEvent | null {
  if (!ev?.name) return null
  const pres = ev.presentations ?? {}
  const venue = ev.venue ?? {}
  const min = cents(pres.lowest_price?.value)
  const max = cents(pres.highest_price?.value)
  const tags = ev.tags && typeof ev.tags === 'object'
    ? Object.values(ev.tags as Record<string, string>).join(', ')
    : null
  return {
    url_evento: `https://bileto.sympla.com.br/event/${ev.id}`,
    nome: ev.name,
    data_inicio: pres.next_local_date_time ?? ev.next_local_date_time ?? null,
    data_fim: ev.last_local_date_time ?? null,
    organizador_raw: ev.seller_data?.merchant_name ?? null,
    organizador_url: null,
    local_raw: venue.name ?? null,
    cidade: venue.locale?.city?.name ?? null,
    uf: ufDe(venue.locale?.state?.name),
    preco_min: min,
    preco_max: max,
    gratuito: min === 0,
    online: false,
    categoria: tags,
    capacidade_total: typeof pres.total_capacity === 'number' ? pres.total_capacity : null,
    vendidos: typeof pres.total_booked === 'number' ? pres.total_booked : null,
    imagem_url: ev.notification_image ?? null,
    descricao: null,
    raw: { id: ev.id, category_id: ev.event_category_id, genre_id: ev.event_genre_id },
  }
}

export const biletoScraper: Scraper = async (ctx: ScrapeContext) => {
  const { cidade, janelaDias } = ctx
  const events = await runScan()

  const agora = Date.now()
  const limite = agora + janelaDias * 86_400_000
  const out: RawEvent[] = []

  for (const { ev } of events) {
    if ((ev.status ?? '') !== 'STARTED') continue
    const cidadeEv = ev.venue?.locale?.city?.name ?? null
    if (!cidadeEv || norm(cidadeEv) !== norm(cidade)) continue
    const dataIni = ev.presentations?.next_local_date_time ?? null
    const t = dataIni ? Date.parse(dataIni) : NaN
    if (isNaN(t) || t < agora - 86_400_000 || t > limite) continue
    const r = mapBileto(ev)
    if (r) out.push(r)
  }
  return out
}
