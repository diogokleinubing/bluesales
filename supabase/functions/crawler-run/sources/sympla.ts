// Fonte: Sympla — API JSON interna (consumida pelo próprio site via HTTP).
//   GET https://www.sympla.com.br/api/v1/search?...
// Não é API pública documentada: o endpoint/parâmetros podem mudar.
//
// VALIDAR com dado real ANTES de confiar no mapeamento: rodar 1 cidade e
// inspecionar o JSON cru (campos de local, organizador, preço, data).

import type { RawEvent, Scraper } from '../../_shared/types.ts'

const SEARCH = 'https://www.sympla.com.br/api/v1/search'

interface SymplaEvent {
  id?: number | string
  name?: string
  url?: string
  images?: { original?: string; thumb?: string }
  location?: { name?: string; city?: string; state?: string; address?: string }
  start_date?: string
  end_date?: string
  organizer?: { name?: string }
  min_price?: number
  max_price?: number
  is_online?: boolean
}

export const symplaScraper: Scraper = async ({ cidade, uf }) => {
  const url = new URL(SEARCH)
  url.searchParams.set('city', cidade)
  url.searchParams.set('state', uf)
  url.searchParams.set('only', 'events')
  url.searchParams.set('pageSize', '100')

  let payload: { data?: SymplaEvent[]; events?: SymplaEvent[] }
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    payload = await res.json()
  } catch (e) {
    console.error('[sympla] fetch falhou', cidade, uf, String(e))
    return []
  }

  const list = payload?.data ?? payload?.events ?? []
  const out: RawEvent[] = []
  for (const ev of Array.isArray(list) ? list : []) {
    if (!ev.url || !ev.name) continue
    out.push({
      url_evento: ev.url,
      nome: ev.name,
      data_inicio: ev.start_date ?? null,
      data_fim: ev.end_date ?? null,
      organizador_raw: ev.organizer?.name ?? null,
      organizador_url: null,
      local_raw: ev.location?.name ?? ev.location?.address ?? null,
      cidade: ev.location?.city ?? cidade,
      uf: ev.location?.state ?? uf,
      preco_min: typeof ev.min_price === 'number' ? ev.min_price : null,
      preco_max: typeof ev.max_price === 'number' ? ev.max_price : null,
      gratuito: ev.min_price === 0 && ev.max_price === 0,
      online: ev.is_online ?? false,
      imagem_url: ev.images?.original ?? ev.images?.thumb ?? null,
      descricao: null,
      raw: ev,
    })
  }
  return out
}
