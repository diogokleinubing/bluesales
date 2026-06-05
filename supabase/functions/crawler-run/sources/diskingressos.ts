// Fonte: Disk Ingressos — Elasticsearch público (www.diskingressos.com.br).
//   GET /home/_search?size=N&from=K  -> hits.hits[]._source (+ hits.total)
// Discovery + dados na mesma chamada. Preço não vem na busca (API à parte).
// Paginação por offset (from); pula os já coletados (dedupe por URL).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const HOST = 'https://www.diskingressos.com.br'
const SEARCH = `${HOST}/home/_search`
const DETALHE = 'https://genesisapi.diskingressos.com.br/event'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Detalhe (genesisapi): preço (faixa) + taxa média do evento. */
async function fetchDetalhe(
  slug: string,
): Promise<{ min: number | null; max: number | null; gratuito: boolean; taxa: number | null } | null> {
  try {
    const res = await fetch(`${DETALHE}/${slug}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const j = await res.json() as { prices?: Record<string, unknown> }
    const items: { price: number; tax: number }[] = []
    for (const [k, v] of Object.entries(j.prices ?? {})) {
      if (k === 'minPrice' || !Array.isArray(v)) continue
      for (const t of v as { price?: string; tax?: string }[]) {
        items.push({ price: Number(t.price), tax: Number(t.tax) })
      }
    }
    if (!items.length) return null
    const precos = items.map((i) => i.price).filter((p) => Number.isFinite(p))
    const pos = precos.filter((p) => p > 0)
    const taxa = avgTaxaPct(items)
    if (!pos.length) return { min: 0, max: 0, gratuito: true, taxa }
    return { min: Math.min(...pos), max: Math.max(...pos), gratuito: false, taxa }
  } catch (e) {
    console.error('[disk] detalhe falhou', slug, String(e))
    return null
  }
}

interface DiskSource {
  uid?: string
  slug?: string
  eventname?: string
  data?: string
  date?: string
  city?: string
  state?: string
  local?: string
  image?: string
  classification?: string[] | null
  producerid?: number
  groupid?: number
  id?: number
}

let knownCache: Set<string> | null = null

function urlDe(s: DiskSource): string {
  return `${HOST}/evento/${s.slug ?? s.uid}`
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  if (knownCache) return knownCache
  const set = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%diskingressos%')
      .limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) {
    console.error('[disk] getKnown falhou', String(e))
  }
  knownCache = set
  return set
}

async function getSource() {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'diskingressos').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const diskIngressosScraper: Scraper = async () => {
  const db = adminClient()
  const src = await getSource()
  if (!src) return []
  const cfg = src.cfg
  const size = Number(cfg.scan ?? 150)
  const from = Number(cfg.offset ?? 0)

  const url = `${SEARCH}?size=${size}&from=${from}`
  let payload: { hits?: { total?: number | { value?: number }; hits?: { _source?: DiskSource }[] } }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `${HOST}/` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error('[disk] busca HTTP', res.status)
      return []
    }
    payload = await res.json()
  } catch (e) {
    console.error('[disk] busca falhou', String(e))
    return []
  }

  const hits = payload.hits?.hits ?? []
  const totalRaw = payload.hits?.total
  const total = typeof totalRaw === 'object' ? (totalRaw?.value ?? 0) : (totalRaw ?? 0)
  console.log(`[disk] busca from=${from} total=${total} retornou=${hits.length}`)

  const known = await getKnown(db)
  const agora = Date.now()
  const novos = hits.map((h) => h._source).filter((s): s is DiskSource => !!s?.eventname && !known.has(urlDe(s)))

  // Detalhe (preço/taxa) em paralelo, só para eventos ativos.
  const out: RawEvent[] = []
  const BATCH = 8
  for (let i = 0; i < novos.length; i += BATCH) {
    const slice = novos.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (s) => {
      const categoria = Array.isArray(s.classification) && s.classification.length
        ? s.classification.map((c) => c.trim()).filter(Boolean).join(', ')
        : null
      const dataIni = s.data ?? (s.date ? `${s.date}T00:00:00` : null)
      const t = dataIni ? Date.parse(dataIni) : NaN
      const ehPassado = !isNaN(t) && t < agora - 86_400_000
      const det = ehPassado ? null : await fetchDetalhe(String(s.slug ?? s.id))
      return {
        url_evento: urlDe(s),
        nome: s.eventname!,
        data_inicio: dataIni,
        data_fim: null,
        organizador_raw: null,
        organizador_url: null,
        local_raw: s.local?.trim() || null,
        cidade: s.city?.trim() || null,
        uf: s.state ? s.state.trim().toUpperCase() : null,
        pais: 'Brasil',
        preco_min: det?.min ?? null,
        preco_max: det?.max ?? null,
        taxa_pct: det?.taxa ?? null,
        gratuito: det?.gratuito ?? false,
        online: false,
        categoria,
        imagem_url: s.image ? `${HOST}${s.image}` : null,
        descricao: null,
        raw: { uid: s.uid, groupid: s.groupid, id: s.id, producerid: s.producerid },
      } as RawEvent
    }))
    out.push(...mapped)
  }

  void total
  const novoOffset = hits.length < size ? 0 : from + size
  await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[disk] offset ${from}->${novoOffset} novos=${out.length}`)

  return out
}
