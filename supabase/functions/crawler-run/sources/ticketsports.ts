// Fonte: Ticket Sports — provas esportivas (corridas, ciclismo, etc.).
//   Lista: GET https://www.ticketsports.com.br/api/events/list?quantity=3000&atlheteId=0&term=&country=BR
//     -> [{ eventId, title, organizer, date "DD/MM/YYYY", address "Cidade, UF",
//           uri, logoImageSource, isVirtualEvent, status }]
//   Preço/Taxa (2 passos no app de inscrição):
//     1) GET  .../Inscricao/Controller/CategoriaController.ashx?eventoId=<id>&action=categoria
//          -> body HTML com data-id="<categoriaId>" (modalidades)
//     2) POST .../Inscricao/Controller/CategoriaController.ashx
//          body: __idMOD=<categoriaId>&__idEV=<eventId>
//          -> body HTML com lotes: "... R$ 299,90 + R$ 19,49 taxa de serviço ..."
//   Categoria fixa "Provas Esportivas". Janela deslizante (config.offset).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const API = 'https://www.ticketsports.com.br/api/events'
const CTRL = 'https://site.ticketsports.com.br/Inscricao/Controller/CategoriaController.ashx'
const CATEGORIA = 'Provas Esportivas'
const MAX_DET = 100 // eventos enriquecidos por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }
const POST_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: 'https://site.ticketsports.com.br',
  Referer: 'https://site.ticketsports.com.br/Inscricao/',
}

interface ListaEvento {
  eventId: number
  title?: string
  organizer?: string | null
  organizerDocumentNumber?: string | null
  date?: string | null
  address?: string | null
  uri?: string
  logoImageSource?: string | null
  isVirtualEvent?: boolean
  status?: string | null
}

function paraFloat(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}
function dataBR(d?: string | null): string | null {
  if (!d) return null
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00-03:00` : null
}
function splitCidadeUf(addr?: string | null): { cidade: string | null; uf: string | null } {
  if (!addr) return { cidade: null, uf: null }
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return { cidade: null, uf: null }
  const last = parts[parts.length - 1]
  if (/^[A-Za-z]{2}$/.test(last)) return { cidade: parts[parts.length - 2] ?? null, uf: last.toUpperCase() }
  return { cidade: last, uf: null }
}
/** Extrai o campo "body" (HTML) das respostas .ashx. */
function bodyHtml(raw: string): string {
  try { return String(JSON.parse(raw)?.body ?? raw) } catch { return raw }
}

/** Preço mín/máx + taxa média de um evento.
 *  1) GET categoria: pega os data-ids E o cookie de sessão (Cloudflare _cfuvid);
 *  2) POST por categoria COM o cookie — sem ele o servidor responde 500. */
async function fetchPreco(eventId: number): Promise<{ min: number | null; max: number | null; taxa: number | null } | null> {
  let ids: string[] = []
  let cookie = ''
  try {
    const res = await fetch(`${CTRL}?eventoId=${eventId}&tagO=&action=categoria&lang=pt-BR`, {
      headers: HEADERS, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    const html = bodyHtml(await res.text())
    ids = [...new Set([...html.matchAll(/data-id="(\d+)"/g)].map((m) => m[1]))]
  } catch { return null }
  if (ids.length === 0) return null

  const precos: number[] = []
  const taxaItems: { price: number; tax: number }[] = []
  for (const id of ids) {
    try {
      const res = await fetch(CTRL, {
        method: 'POST',
        headers: cookie ? { ...POST_HEADERS, Cookie: cookie } : POST_HEADERS,
        body: `__idMOD=${id}&__idEV=${eventId}`,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const txt = bodyHtml(await res.text()).replace(/<[^>]+>/g, ' ')
      // "R$ 299,90 + R$ 19,49 taxa de serviço" (lotes esgotados não têm R$)
      for (const m of txt.matchAll(/R\$\s*([\d.,]+)\s*\+\s*R\$\s*([\d.,]+)\s*taxa/gi)) {
        const preco = paraFloat(m[1]); const taxa = paraFloat(m[2])
        if (Number.isFinite(preco) && preco > 0) {
          precos.push(preco)
          if (Number.isFinite(taxa)) taxaItems.push({ price: preco, tax: taxa })
        }
      }
    } catch { /* ignora categoria */ }
  }
  if (precos.length === 0) return null
  return { min: Math.min(...precos), max: Math.max(...precos), taxa: avgTaxaPct(taxaItems) }
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

  // Janela deslizante (cursor em config.offset) — o "Rodar em lote" cobre tudo.
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const offset = Number(cfg.offset ?? 0) % ativos.length
  const janela = ativos.slice(offset, offset + MAX_DET)
  const novoOffset = offset + MAX_DET >= ativos.length ? 0 : offset + MAX_DET
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[ticketsports] lista=${ativos.length} janela=[${offset},${offset + janela.length}) offset ${offset}->${novoOffset}`)

  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < janela.length; i += BATCH) {
    const slice = janela.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (e) => {
      const { cidade, uf } = splitCidadeUf(e.address)
      const p = await fetchPreco(e.eventId)
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
        preco_min: p?.min ?? null,
        preco_max: p?.max ?? null,
        taxa_pct: p?.taxa ?? null,
        gratuito: false,
        online: !!e.isVirtualEvent,
        categoria: CATEGORIA,
        imagem_url: e.logoImageSource || null,
        descricao: null,
        raw: { eventId: e.eventId, organizerDoc: e.organizerDocumentNumber ?? null },
      } as RawEvent
    }))
    out.push(...mapped)
  }
  return out
}
