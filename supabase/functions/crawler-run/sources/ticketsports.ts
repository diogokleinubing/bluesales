// Fonte: Ticket Sports — provas esportivas (corridas, ciclismo, etc.).
//   Lista: GET https://www.ticketsports.com.br/api/events/list?quantity=3000&atlheteId=0&term=&country=BR
//     -> [{ eventId, title, organizer, date "DD/MM/YYYY", address "Cidade, UF",
//           uri, logoImageSource, isVirtualEvent, status }]
//   A lista já traz o essencial (sem preço — o site não expõe preço estruturado;
//   só texto livre em "VALORES E INSCRIÇÕES"). Todos os eventos recebem a
//   categoria fixa "Provas Esportivas". Cobertura por janela deslizante
//   (config.offset) — o "Rodar em lote" percorre o catálogo inteiro.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const API = 'https://www.ticketsports.com.br/api/events'
const CATEGORIA = 'Provas Esportivas'
const MAX_JANELA = 400 // eventos emitidos por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }

interface ListaEvento {
  eventId: number
  title?: string
  organizer?: string | null
  organizerDocumentNumber?: string | null
  date?: string | null // DD/MM/YYYY
  address?: string | null // "Cidade, UF"
  uri?: string
  logoImageSource?: string | null
  isVirtualEvent?: boolean
  status?: string | null
}

/** "DD/MM/YYYY" -> ISO -03:00 (dia). */
function dataBR(d?: string | null): string | null {
  if (!d) return null
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00-03:00` : null
}

/** "Cidade, UF" (ou "Bairro, Cidade, UF") -> { cidade, uf }. */
function splitCidadeUf(addr?: string | null): { cidade: string | null; uf: string | null } {
  if (!addr) return { cidade: null, uf: null }
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return { cidade: null, uf: null }
  const last = parts[parts.length - 1]
  if (/^[A-Za-z]{2}$/.test(last)) {
    return { cidade: parts[parts.length - 2] ?? null, uf: last.toUpperCase() }
  }
  return { cidade: last, uf: null }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ticketsports').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const ticketSportsScraper: Scraper = async () => {
  const db = adminClient()

  let eventos: ListaEvento[] = []
  try {
    const res = await fetch(`${API}/list?quantity=3000&atlheteId=0&term=&country=BR`, {
      headers: HEADERS, signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) { console.error('[ticketsports] lista HTTP', res.status); return [] }
    eventos = (await res.json()) as ListaEvento[]
  } catch (e) { console.error('[ticketsports] lista falhou', String(e)); return [] }

  const ativos = (eventos ?? [])
    .filter((e) => e?.eventId && e?.title && e?.uri)
    .sort((a, b) => Number(b.eventId) - Number(a.eventId))
  if (ativos.length === 0) return []

  // Janela deslizante (cursor em config.offset).
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const offset = Number(cfg.offset ?? 0) % ativos.length
  const janela = ativos.slice(offset, offset + MAX_JANELA)
  const novoOffset = offset + MAX_JANELA >= ativos.length ? 0 : offset + MAX_JANELA
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[ticketsports] lista=${ativos.length} janela=[${offset},${offset + janela.length}) offset ${offset}->${novoOffset}`)

  return janela.map((e) => {
    const { cidade, uf } = splitCidadeUf(e.address)
    return {
      url_evento: e.uri!,
      nome: e.title!,
      data_inicio: dataBR(e.date),
      data_fim: null,
      organizador_raw: e.organizer || null,
      organizador_url: null,
      local_raw: null,
      cidade,
      uf,
      pais: 'Brasil',
      preco_min: null,
      preco_max: null,
      taxa_pct: null,
      gratuito: false,
      online: !!e.isVirtualEvent,
      categoria: CATEGORIA,
      imagem_url: e.logoImageSource || null,
      descricao: null,
      raw: { eventId: e.eventId, organizerDoc: e.organizerDocumentNumber ?? null },
    } as RawEvent
  })
}
