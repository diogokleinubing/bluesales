// Fonte: Sympla — descoberta via sitemap + extração do __NEXT_DATA__.
//
// Por que assim:
//  - Não há API de busca pública; a página de evento é SPA mas embute todo o
//    evento em <script id="__NEXT_DATA__"> (props.pageProps.hydrationData
//    .eventHydration.event).
//  - O acesso passa por Cloudflare + Queue-it (sala de espera): seguimos os
//    redirects manualmente com um cookie-jar, o que libera o QueueITAccepted.
//  - Descoberta: sitemap-eventos.xml lista ~31k eventos (slug__id), SEM lastmod
//    nem cidade. Abrir todos por semana é inviável numa Edge Function.
//
// Estratégia (v1, roda dentro do limite de tempo da Edge Function):
//  - Pré-filtra as URLs do sitemap cujo SLUG contém a cidade-alvo.
//  - Abre no máximo MAX_POR_CIDADE por execução (teto logado, sem corte
//    silencioso) e confirma cidade/data pelo __NEXT_DATA__.
//  Limitações conhecidas: perde eventos sem a cidade no slug; preço não vem no
//  HTML (carregado à parte) -> fica nulo.

import type { RawEvent, Scraper, ScrapeContext } from '../../_shared/types.ts'
import { norm } from '../../_shared/classify.ts'
import { adminClient } from '../../_shared/db.ts'

const SITEMAP = 'https://www.sympla.com.br/sitemap-eventos.xml'
const MAX_POR_CIDADE = 12

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Cookie-jar compartilhado entre chamadas do mesmo isolate (reaproveita o
// QueueITAccepted entre cidades/eventos).
const jar = new Map<string, string>()

// Memoiza a lista de URLs do sitemap durante a invocação (fetch de ~5 MB 1x).
let sitemapCache: string[] | null = null

// IDs de eventos Sympla já coletados — "pular para sempre" (não reentrar nos
// mesmos eventos). Memoizado durante a invocação.
let knownIdsCache: Set<string> | null = null

/** Extrai o id do evento da URL do sitemap (…/<slug>__<id>). */
function idDaUrl(u: string): string | null {
  const m = u.match(/__(\d+)(?:[/?#]|$)/)
  return m ? m[1] : null
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

function readSetCookies(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') return h.getSetCookie()
  const raw = res.headers.get('set-cookie')
  return raw ? [raw] : []
}

async function fetchSeguindoRedirects(start: string): Promise<{ status: number; body: string } | null> {
  let url = start
  for (let hop = 0; hop < 8; hop++) {
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    })
    for (const sc of readSetCookies(res)) {
      const first = sc.split(';')[0]
      const eq = first.indexOf('=')
      if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim())
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      url = loc.startsWith('http') ? loc : new URL(loc, url).toString()
      await res.body?.cancel()
      continue
    }
    return { status: res.status, body: await res.text() }
  }
  return null
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

interface SymplaEvent {
  id?: number | string
  name?: string
  slug?: string
  newUrl?: string
  startDate?: string
  endDate?: string
  logoUrl?: string
  cancelled?: boolean
  published?: boolean
  visible?: boolean
  onlineInfo?: unknown
  eventsAddress?: { name?: string; city?: string; state?: string }
  eventsHost?: { name?: string } | string | null
}

function hostName(h: SymplaEvent['eventsHost']): string | null {
  if (!h) return null
  if (typeof h === 'string') return h
  return h.name ?? null
}

function toIso(s?: string): string | null {
  if (!s) return null
  return s.includes(' ') ? s.replace(' ', 'T') : s
}

function parseEvento(body: string, fallbackUrl: string): SymplaEvent | null {
  const m = body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return null
  try {
    const ev = JSON.parse(m[1])?.props?.pageProps?.hydrationData?.eventHydration?.event
    if (!ev?.name) return null
    if (!ev.newUrl) ev.newUrl = fallbackUrl
    return ev as SymplaEvent
  } catch {
    return null
  }
}

export const symplaScraper: Scraper = async (ctx: ScrapeContext) => {
  const { cidade, uf, janelaDias } = ctx
  const cidadeToken = norm(cidade).replace(/ /g, '-') // "São Paulo" -> "sao-paulo"

  const urls = await getSitemapUrls()
  const known = await getKnownIds()
  const candidatas = urls
    .filter((u) => u.includes(cidadeToken) && !/online/i.test(u))
    .filter((u) => {
      const id = idDaUrl(u) // pula para sempre eventos já coletados
      return !id || !known.has(id)
    })
    .slice(0, MAX_POR_CIDADE)

  if (urls.length && candidatas.length === MAX_POR_CIDADE) {
    console.log(`[sympla] ${cidade}: teto de ${MAX_POR_CIDADE} novos por execução (restante segue na próxima)`) // sem corte silencioso
  }

  const agora = Date.now()
  const limite = agora + janelaDias * 86_400_000
  const out: RawEvent[] = []

  for (const url of candidatas) {
    let r: { status: number; body: string } | null = null
    try {
      r = await fetchSeguindoRedirects(url)
    } catch (e) {
      console.error('[sympla] fetch evento falhou', url, String(e))
      continue
    }
    if (!r || r.status !== 200) continue
    const ev = parseEvento(r.body, url)
    if (!ev) continue
    if (ev.cancelled || ev.published === false || ev.visible === false) continue

    // Confirma cidade real e janela de data.
    const cidadeEv = ev.eventsAddress?.city ?? null
    if (!cidadeEv || norm(cidadeEv) !== norm(cidade)) continue
    const t = ev.startDate ? Date.parse(toIso(ev.startDate)!) : NaN
    if (isNaN(t) || t < agora - 86_400_000 || t > limite) continue

    out.push({
      url_evento: ev.newUrl ?? url,
      nome: ev.name!,
      data_inicio: toIso(ev.startDate),
      data_fim: toIso(ev.endDate),
      organizador_raw: hostName(ev.eventsHost),
      organizador_url: null,
      local_raw: ev.eventsAddress?.name ?? null,
      cidade: cidadeEv,
      uf: ev.eventsAddress?.state ?? uf,
      preco_min: null, // preço não vem no HTML (API de ingressos à parte)
      preco_max: null,
      gratuito: false,
      online: !!ev.onlineInfo,
      imagem_url: ev.logoUrl ?? null,
      descricao: null,
      raw: { id: ev.id, slug: ev.slug },
    })
  }
  return out
}
