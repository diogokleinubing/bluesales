// Fonte: Ingresse — API REST oficial pública (sem token).
//   GET https://api.ingresse.com/event
// Doc informal: aceita filtros de busca + paginação. Mapeamento defensivo:
// qualquer campo ausente vira null e o evento ainda é coletado.
//
// VALIDAR com dado real: confirmar nomes de parâmetros (state/city/term) e os
// caminhos dos campos (venue, sessions, prices) com o JSON cru de 1 cidade.

import type { RawEvent, Scraper } from '../../_shared/types.ts'

const BASE = 'https://api.ingresse.com/event'

interface IngresseEvent {
  id?: number | string
  title?: string
  link?: string
  slug?: string
  poster?: string
  description?: string
  venue?: { name?: string; city?: string; state?: string }
  producer?: { name?: string; id?: number | string }
  sessions?: { date?: string; dateString?: string }[]
  date?: { date?: string }
  prices?: { value?: number }[]
}

function precos(ev: IngresseEvent): { min: number | null; max: number | null } {
  const vals = (ev.prices ?? [])
    .map((p) => (typeof p.value === 'number' ? p.value : null))
    .filter((v): v is number => v != null)
  if (!vals.length) return { min: null, max: null }
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

export const ingresseScraper: Scraper = async ({ cidade, uf }) => {
  const url = new URL(BASE)
  url.searchParams.set('method', 'search')
  url.searchParams.set('state', uf)
  url.searchParams.set('city', cidade)
  url.searchParams.set('size', '100')

  let payload: { data?: IngresseEvent[] }
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    payload = await res.json()
  } catch (e) {
    console.error('[ingresse] fetch falhou', cidade, uf, String(e))
    return []
  }

  const list = Array.isArray(payload?.data) ? payload.data : []
  const out: RawEvent[] = []
  for (const ev of list) {
    const link =
      ev.link ?? (ev.slug ? `https://www.ingresse.com/${ev.slug}` : null)
    if (!link || !ev.title) continue
    const { min, max } = precos(ev)
    const dataInicio = ev.sessions?.[0]?.date ?? ev.date?.date ?? null
    out.push({
      url_evento: link,
      nome: ev.title,
      data_inicio: dataInicio,
      data_fim: null,
      organizador_raw: ev.producer?.name ?? null,
      organizador_url: null,
      local_raw: ev.venue?.name ?? null,
      cidade: ev.venue?.city ?? cidade,
      uf: ev.venue?.state ?? uf,
      preco_min: min,
      preco_max: max,
      gratuito: max === 0,
      online: false,
      imagem_url: ev.poster ?? null,
      descricao: ev.description ?? null,
      raw: ev,
    })
  }
  return out
}
