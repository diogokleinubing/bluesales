// Fonte: Q2 Ingressos — APIs JSON estáticas no CDN.
//   Lista:   GET https://cdn.q2ingressos.com.br/assets/api/nextEvents.json
//     -> [{ Id, Name, StartDate, Place, City, State, Slug, ImageEvent, Artists }]
//     (já traz local/cidade/UF/imagem/data; o detalhe acrescenta preço/taxa/IG)
//   Detalhe: GET https://cdn.q2ingressos.com.br/assets/api/getEventTicketsBySlug/<slug>.json
//     -> { city, state, location, date, time, sections[].tickets[]{ value, taxOnline },
//          websiteInformations (HTML com Instagram da produção) }
//   Lista fixa (~140): cobre por janela deslizante (cursor em config.offset),
//   enriquecendo TODOS com preço ao longo de algumas execuções.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const CDN = 'https://cdn.q2ingressos.com.br/assets/api'
const SITE = 'https://q2ingressos.com.br'
const MAX_DET = 60 // janela de enriquecimento por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }

interface ListaEvento {
  Id: number
  Name?: string
  StartDate?: string | null
  EndDate?: string | null
  Place?: string | null
  City?: string | null
  State?: string | null
  Slug?: string
  ImageEvent?: string | null
}

interface Detalhe {
  dataInicio: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  min: number | null
  max: number | null
  taxa: number | null
  organizador: string | null
}

const eventoUrl = (e: ListaEvento) => `${SITE}/evento/${e.Slug}`

function dataIso(data?: string | null, hora?: string | null): string | null {
  if (!data) return null
  const dia = data.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const h = hora && /^\d{1,2}:\d{2}/.test(hora) ? hora.slice(0, 5) : (data.slice(11, 16) || '00:00')
  return `${dia}T${h}:00-03:00`
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'q2ingressos').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function fetchDetalhe(slug: string): Promise<Detalhe | null> {
  try {
    const res = await fetch(`${CDN}/getEventTicketsBySlug/${encodeURIComponent(slug)}.json?h=1`, {
      headers: HEADERS, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    let d: any
    try { d = await res.json() } catch { return null }
    if (!d || d.status !== 'success') return null
    // deno-lint-ignore no-explicit-any
    const tickets: any[] = (d.sections ?? []).flatMap((s: any) => s?.tickets ?? [])
    const precos = tickets.map((t) => Number(t?.value)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = tickets
      .map((t) => ({ price: Number(t?.value), tax: Number(t?.taxOnline) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    const wi = String(d.websiteInformations ?? '')
    const ig = wi.match(/instagram\.com\/([A-Za-z0-9_.]+)/i)?.[1]?.replace(/\.$/, '') ?? null
    return {
      dataInicio: dataIso(d.date, d.time),
      local: d.location || null,
      cidade: d.city || null,
      uf: d.state || null,
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
      organizador: ig,
    }
  } catch {
    return null
  }
}

export const q2IngressosScraper: Scraper = async () => {
  const db = adminClient()

  let eventos: ListaEvento[] = []
  try {
    const res = await fetch(`${CDN}/nextEvents.json?h=1`, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    if (!res.ok) {
      console.error('[q2] lista HTTP', res.status)
      return []
    }
    eventos = (await res.json()) as ListaEvento[]
  } catch (e) {
    console.error('[q2] lista falhou', String(e))
    return []
  }

  const ativos = (eventos ?? [])
    .filter((e) => e?.Id && e?.Name && e?.Slug)
    .sort((a, b) => Number(b.Id) - Number(a.Id))
  if (ativos.length === 0) return []

  // Cursor deslizante (avança a cada run) — o Lote percorre tudo e atualiza.
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const offset = Number(cfg.offset ?? 0) % ativos.length
  const janela = ativos.slice(offset, offset + MAX_DET)
  const novoOffset = offset + MAX_DET >= ativos.length ? 0 : offset + MAX_DET
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[q2] lista=${ativos.length} janela=[${offset},${offset + janela.length}) offset ${offset}->${novoOffset}`)

  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < janela.length; i += BATCH) {
    const slice = janela.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (e) => {
      const det = await fetchDetalhe(e.Slug!)
      const cidade = (det?.cidade || (e.City && e.City !== '...' ? e.City : null)) || null
      const uf = (det?.uf || (e.State && e.State !== '...' ? e.State : null) || '').toUpperCase()
      return {
        url_evento: eventoUrl(e),
        nome: e.Name!,
        data_inicio: det?.dataInicio ?? dataIso(e.StartDate),
        data_fim: dataIso(e.EndDate),
        organizador_raw: det?.organizador ?? null,
        organizador_url: det?.organizador ? `https://instagram.com/${det.organizador}` : null,
        local_raw: det?.local || e.Place || null,
        cidade,
        uf: uf.length === 2 ? uf : null,
        pais: 'Brasil',
        preco_min: det?.min ?? null,
        preco_max: det?.max ?? null,
        taxa_pct: det?.taxa ?? null,
        gratuito: det?.min === 0,
        online: false,
        categoria: null,
        imagem_url: e.ImageEvent ?? null,
        descricao: null,
        raw: { id: e.Id, slug: e.Slug },
      } as RawEvent
    }))
    out.push(...mapped)
  }
  return out
}
