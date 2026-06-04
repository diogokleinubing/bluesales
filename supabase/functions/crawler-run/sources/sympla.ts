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
import { norm } from '../../_shared/classify.ts'
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

async function getSitemapUrls(): Promise<string[]> {
  if (sitemapCache) return sitemapCache
  try {
    const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA } })
    const xml = await res.text()
    sitemapCache = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim())
  } catch (e) {
    console.error('[sympla] sitemap falhou', String(e))
    sitemapCache = []
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
  eventsAddress?: { name?: string; city?: string; state?: string }
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

export const symplaScraper: Scraper = async (ctx: ScrapeContext) => {
  const { cidade, uf, janelaDias } = ctx
  const cidadeToken = norm(cidade).replace(/ /g, '-') // "São Paulo" -> "sao-paulo"

  const urls = await getSitemapUrls()
  const known = await getKnownIds()

  const ids: string[] = []
  for (const u of urls) {
    if (!u.includes(cidadeToken) || /online/i.test(u)) continue
    const id = idDaUrl(u)
    if (!id || known.has(id)) continue // pula para sempre os já coletados
    ids.push(id)
    if (ids.length >= MAX_POR_CIDADE) break
  }
  if (urls.length && ids.length === MAX_POR_CIDADE) {
    console.log(`[sympla] ${cidade}: teto de ${MAX_POR_CIDADE} novos por execução (restante na próxima)`)
  }

  const agora = Date.now()
  const limite = agora + janelaDias * 86_400_000
  const out: RawEvent[] = []

  for (const id of ids) {
    const ev = await fetchEvento(id)
    if (!ev?.name) continue
    if (ev.cancelled || ev.published === false || ev.visible === false) continue

    const cidadeEv = ev.eventsAddress?.city ?? null
    if (!cidadeEv || norm(cidadeEv) !== norm(cidade)) continue

    const dataIni = ev.startDateMultiFormat?.ISO8601 ?? ev.startDate ?? null
    const t = dataIni ? Date.parse(dataIni) : NaN
    if (isNaN(t) || t < agora - 86_400_000 || t > limite) continue

    // Gratuito pelo tipo do evento evita uma chamada de preço.
    const ehFree = (ev.paymentEventType ?? '').toLowerCase() === 'free'
    const precos = ehFree ? null : await fetchPrecos(id)

    out.push({
      url_evento: ev.oldUrl ?? `https://www.sympla.com.br/${ev.slug ?? ''}__${id}`,
      nome: ev.name,
      data_inicio: dataIni,
      data_fim: ev.endDateMultiFormat?.ISO8601 ?? ev.endDate ?? null,
      organizador_raw: ev.eventsHost?.name ?? null,
      organizador_url: null,
      local_raw: ev.eventsAddress?.name ?? null,
      cidade: cidadeEv,
      uf: ev.eventsAddress?.state ?? uf,
      preco_min: precos?.min ?? null,
      preco_max: precos?.max ?? null,
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
    })
  }
  return out
}
