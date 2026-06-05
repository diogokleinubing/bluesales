// Fonte: Disk Ingressos — Elasticsearch público (www.diskingressos.com.br).
//   GET /home/_search?size=N&from=K  -> hits.hits[]._source (+ hits.total)
// Discovery + dados na mesma chamada. Preço não vem na busca (API à parte).
// Paginação por offset (from); pula os já coletados (dedupe por URL).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.diskingressos.com.br'
const SEARCH = `${HOST}/home/_search`
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

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
  const out: RawEvent[] = []
  for (const h of hits) {
    const s = h._source
    if (!s?.eventname) continue
    const u = urlDe(s)
    if (known.has(u)) continue
    const categoria = Array.isArray(s.classification) && s.classification.length
      ? s.classification.map((c) => c.trim()).filter(Boolean).join(', ')
      : null
    out.push({
      url_evento: u,
      nome: s.eventname,
      data_inicio: s.data ?? (s.date ? `${s.date}T00:00:00` : null),
      data_fim: null,
      organizador_raw: null,
      organizador_url: null,
      local_raw: s.local?.trim() || null,
      cidade: s.city?.trim() || null,
      uf: s.state ? s.state.trim().toUpperCase() : null,
      pais: 'Brasil',
      preco_min: null,
      preco_max: null,
      gratuito: false,
      online: false,
      categoria,
      imagem_url: s.image ? `${HOST}${s.image}` : null,
      descricao: null,
      raw: { uid: s.uid, groupid: s.groupid, id: s.id, producerid: s.producerid },
    })
  }

  const novoOffset = hits.length < size || from + size >= total ? 0 : from + size
  await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[disk] offset ${from}->${novoOffset} novos=${out.length}`)

  return out
}
