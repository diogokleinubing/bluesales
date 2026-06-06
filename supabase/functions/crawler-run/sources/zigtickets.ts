// Fonte: Zig.Tickets (SuperTicket) — lista estática no S3 + detalhe via _next/data.
//   Lista:   GET https://zigtickets-static-zig-tickets.s3.us-east-1.amazonaws.com/domains/zig.tickets/new-events.json
//     objeto "events": [{ id, name, slug, start_date, end_date, banner, is_online,
//       is_closed, event_location{name,city,state}, event_categories[].name,
//       organization{name,slug} }]  — já traz organizador/local/cidade/UF/data/categoria.
//   Detalhe: GET https://zig.tickets/_next/data/<buildId>/pt-BR/eventos/<slug>.json?slug=<slug>
//     -> pageProps.tickets.tickets[]{ value, fee }  (preço + taxa)
//   O <buildId> muda a cada deploy do site; é extraído da home ("buildId":"...").
//
// Estratégia: a lista (~335) já tem dados ricos, então emitimos TODOS os eventos
// a cada run (upsert) e enriquecemos preço/taxa numa janela deslizante
// (config.offset), priorizando os eventos com data mais próxima.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const LIST_URL =
  'https://zigtickets-static-zig-tickets.s3.us-east-1.amazonaws.com/domains/zig.tickets/new-events.json'
const SITE = 'https://zig.tickets'
const MAX_DET = 40 // janela de enriquecimento de preço por execução (detalhe é grande)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA }

interface ZigLoc {
  name?: string | null
  city?: string | null
  state?: string | null
}
interface ZigEvent {
  id: number
  name?: string
  slug?: string
  start_date?: string | null
  end_date?: string | null
  banner?: string | null
  vertical_banner?: string | null
  is_online?: boolean
  is_closed?: boolean
  event_location?: ZigLoc
  // deno-lint-ignore no-explicit-any
  event_categories?: any[]
  organization?: { name?: string | null; slug?: string | null }
}

const eventoUrl = (slug: string) => `${SITE}/eventos/${slug}`

function dataIso(s?: string | null): string | null {
  if (!s) return null
  // "2026-06-06T17:00:00.000-03:00" -> mantém data/hora/tz, remove milissegundos
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2}:\d{2}|Z)?$/)
  if (!m) return null
  return `${m[1]}${m[2] ?? '-03:00'}`
}

async function getBuildId(): Promise<string | null> {
  try {
    const res = await fetch(SITE, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/"buildId":"([^"]+)"/)?.[1] ?? null
  } catch {
    return null
  }
}

async function fetchPreco(
  buildId: string,
  slug: string,
): Promise<{ min: number | null; max: number | null; taxa: number | null } | null> {
  try {
    const res = await fetch(
      `${SITE}/_next/data/${buildId}/pt-BR/eventos/${encodeURIComponent(slug)}.json?slug=${encodeURIComponent(slug)}`,
      { headers: HEADERS, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    let d: any
    try { d = await res.json() } catch { return null }
    // deno-lint-ignore no-explicit-any
    const tk: any[] = d?.pageProps?.tickets?.tickets ?? []
    const precos = tk.map((t) => Number(t?.value)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = tk
      .map((t) => ({ price: Number(t?.value), tax: Number(t?.fee) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    return {
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
    }
  } catch {
    return null
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'zigtickets').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const zigTicketsScraper: Scraper = async () => {
  const db = adminClient()

  let lista: ZigEvent[] = []
  try {
    const res = await fetch(LIST_URL, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error('[zig] lista HTTP', res.status); return [] }
    const json = await res.json()
    lista = (json?.events ?? []) as ZigEvent[]
  } catch (e) {
    console.error('[zig] lista falhou', String(e)); return []
  }

  const ativos = (lista ?? [])
    .filter((e) => e?.id && e?.name && e?.slug && !e.is_online && !e.is_closed)
    .sort((a, b) => String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')))
  if (ativos.length === 0) return []

  // Janela deslizante para enriquecer preço (config.offset avança a cada run).
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const offset = Number(cfg.offset ?? 0) % ativos.length
  const novoOffset = offset + MAX_DET >= ativos.length ? 0 : offset + MAX_DET
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  const janela = new Set(ativos.slice(offset, offset + MAX_DET).map((e) => e.slug))

  const buildId = janela.size ? await getBuildId() : null
  console.log(`[zig] lista=${ativos.length} janela=[${offset},${offset + janela.size}) build=${buildId ?? '—'}`)

  // Enriquece a janela com preço (em lotes), guardando por slug.
  const precoPorSlug = new Map<string, { min: number | null; max: number | null; taxa: number | null }>()
  if (buildId) {
    const alvos = ativos.slice(offset, offset + MAX_DET)
    const BATCH = 6
    for (let i = 0; i < alvos.length; i += BATCH) {
      const slice = alvos.slice(i, i + BATCH)
      await Promise.all(slice.map(async (e) => {
        const p = await fetchPreco(buildId, e.slug!)
        if (p) precoPorSlug.set(e.slug!, p)
      }))
    }
  }

  // Emite TODOS (upsert): os da janela com preço; os demais com dados de lista.
  return ativos.map((e) => {
    const loc = e.event_location ?? {}
    const p = precoPorSlug.get(e.slug!)
    const cat = (e.event_categories ?? []).map((c) => c?.name).find(Boolean) ?? null
    const org = e.organization?.name || null
    return {
      url_evento: eventoUrl(e.slug!),
      nome: e.name!,
      data_inicio: dataIso(e.start_date),
      data_fim: dataIso(e.end_date),
      organizador_raw: org,
      organizador_url: e.organization?.slug ? `${SITE}/organizacoes/${e.organization.slug}` : null,
      local_raw: loc.name || null,
      cidade: loc.city || null,
      uf: (loc.state || '').toUpperCase().length === 2 ? (loc.state as string).toUpperCase() : null,
      pais: 'Brasil',
      preco_min: p?.min ?? null,
      preco_max: p?.max ?? null,
      taxa_pct: p?.taxa ?? null,
      gratuito: p?.min === 0,
      online: false,
      categoria: cat,
      imagem_url: e.banner || e.vertical_banner || null,
      descricao: null,
      raw: { id: e.id, slug: e.slug },
    } as RawEvent
  })
}
