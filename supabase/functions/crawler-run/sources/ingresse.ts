// Fonte: Ingresse — API de busca pública (api-site.ingresse.com).
//   GET /events/search?company_id=1&size=N&offset=K&order_by_date=true
// Retorna a lista completa (paginada por offset) com título, sessão (data),
// place (local/cidade/uf) e poster. Preço/organizador não vêm na busca.
//
// Descoberta + dados na mesma chamada: avançamos um offset (config) cobrindo
// toda a base aos poucos e pulamos os já coletados (dedupe por URL).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { normPais, avgTaxaPct } from '../../_shared/classify.ts'

const SEARCH = 'https://api-site.ingresse.com/events/search'
const EMBED = 'https://api-embedstore.ingresse.com/api/v1/event'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// apikey pública do embed store da Ingresse — vem de um secret (nunca do git).
const EMBED_KEY = Deno.env.get('INGRESSE_EMBED_APIKEY') ?? ''

interface Precos { min: number | null; max: number | null; gratuito: boolean; taxa: number | null }

/** Faixa de preço (min–max) + taxa média dos lotes (API embed store). */
async function fetchPrecos(id: number): Promise<Precos | null> {
  if (!EMBED_KEY) return null
  try {
    const res = await fetch(`${EMBED}/${id}/session/0/tickets?apikey=${EMBED_KEY}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const j = await res.json() as {
      detail?: { responseData?: { type?: { price?: number; tax?: number; hidden?: boolean }[] }[] }
    }
    const precos: number[] = []
    const taxas: { price: number; tax: number }[] = []
    for (const lot of j.detail?.responseData ?? []) {
      for (const t of lot.type ?? []) {
        if (t.hidden) continue
        const p = Number(t.price)
        if (Number.isFinite(p)) precos.push(p)
        if (Number.isFinite(p) && Number.isFinite(Number(t.tax))) taxas.push({ price: p, tax: Number(t.tax) })
      }
    }
    if (!precos.length) return null
    const taxa = avgTaxaPct(taxas)
    const pos = precos.filter((p) => p > 0)
    if (!pos.length) return { min: 0, max: 0, gratuito: true, taxa }
    return { min: Math.min(...pos), max: Math.max(...pos), gratuito: false, taxa }
  } catch (e) {
    console.error('[ingresse] precos falhou', id, String(e))
    return null
  }
}

interface IngEvent {
  id: number
  slug?: string
  title?: string
  poster?: { large?: string; medium?: string; small?: string }
  session?: { dateTime?: string }
  place?: { name?: string; city?: string; state?: string; country?: string }
}

let knownCache: Set<string> | null = null

function urlDe(ev: IngEvent): string {
  return ev.slug ? `https://www.ingresse.com/${ev.slug}` : `https://www.ingresse.com/evento/${ev.id}`
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  if (knownCache) return knownCache
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%ingresse.com%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) {
    console.error('[ingresse] getKnown falhou', String(e))
  }
  knownCache = s
  return s
}

async function getSource() {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ingresse').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const ingresseScraper: Scraper = async () => {
  const db = adminClient()
  const src = await getSource()
  if (!src) return []
  const cfg = src.cfg
  const companyId = Number(cfg.company_id ?? 1)
  const size = Number(cfg.scan ?? 150)
  const offset = Number(cfg.offset ?? 0)

  const url = new URL(SEARCH)
  url.searchParams.set('company_id', String(companyId))
  url.searchParams.set('title', '')
  url.searchParams.set('size', String(size))
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('order_by_date', 'true')

  let payload: { events?: IngEvent[]; pagination?: { total?: number } }
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error('[ingresse] busca HTTP', res.status)
      return []
    }
    payload = await res.json()
  } catch (e) {
    console.error('[ingresse] busca falhou', String(e))
    return []
  }

  const events = payload.events ?? []
  const total = payload.pagination?.total ?? 0
  console.log(`[ingresse] busca offset=${offset} total=${total} retornou=${events.length}`)

  const known = await getKnown(db)
  const agora = Date.now()
  const novos = events.filter((ev) => ev.title && !known.has(urlDe(ev)))

  function toRaw(ev: IngEvent, precos: Precos | null): RawEvent {
    return {
      url_evento: urlDe(ev),
      nome: ev.title!,
      data_inicio: ev.session?.dateTime ?? null,
      data_fim: null,
      organizador_raw: null,
      organizador_url: null,
      local_raw: ev.place?.name ?? null,
      cidade: ev.place?.city ?? null,
      uf: ev.place?.state ?? null,
      pais: normPais(ev.place?.country),
      preco_min: precos?.min ?? null,
      preco_max: precos?.max ?? null,
      taxa_pct: precos?.taxa ?? null,
      gratuito: precos?.gratuito ?? false,
      online: false,
      categoria: null,
      imagem_url: ev.poster?.large ?? ev.poster?.medium ?? null,
      descricao: null,
      raw: { id: ev.id, slug: ev.slug },
    }
  }

  // Preço em paralelo (lotes), só para eventos ativos.
  const out: RawEvent[] = []
  const BATCH = 8
  for (let i = 0; i < novos.length; i += BATCH) {
    const slice = novos.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (ev) => {
      const t = ev.session?.dateTime ? Date.parse(ev.session.dateTime) : NaN
      const ehPassado = !isNaN(t) && t < agora - 86_400_000
      const precos = ehPassado ? null : await fetchPrecos(ev.id)
      return toRaw(ev, precos)
    }))
    out.push(...mapped)
  }

  // Avança enquanto a página vier cheia; recomeça só quando vier curta (fim).
  // (total pode vir limitado ao size, então não dá pra confiar nele p/ parar.)
  void total
  const novoOffset = events.length < size ? 0 : offset + size
  await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[ingresse] offset ${offset}->${novoOffset} novos=${out.length}`)

  return out
}
