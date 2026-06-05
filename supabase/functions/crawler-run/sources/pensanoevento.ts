// Fonte: Pensa no Evento — API JSON de busca (descoberta + dados) + HTML do
// evento (preço/taxa nos div.lotes).
//   Listagem: GET /sitev2/api/eventos/busca?date=<range>&cursor=<cursor>
//     header X-Public-Token: pne-site-api  -> { data[], meta.next_cursor }
//   Detalhe (HTML): /sitev2/eventos/<id>/<slug> -> div.lotes "R$ X + R$ Y taxa"
// Paginação por cursor (salvo na config); pula os já coletados.

import { load } from 'https://esm.sh/cheerio@1.0.0'
import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const HOST = 'https://www.pensanoevento.com.br'
const BUSCA = `${HOST}/sitev2/api/eventos/busca`
const DATE_RANGE = '01/01/2020 até 31/12/2099' // inclui passados também
const MAX_PAGINAS = 8 // páginas por execução
const MAX_NOVOS = 80
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const HEADERS_API = { 'X-Public-Token': 'pne-site-api', Accept: 'application/json', 'User-Agent': UA }
const HEADERS_HTML = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }

interface BuscaItem {
  url: string
  evento: string
  data?: string // "YYYY-MM-DD HH:MM:SS"
  dataDescricao?: string | null
  capaURL?: string | null
  local?: string | null
  cidade?: string | null
  estado?: string | null
}

function paraFloat(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

function isoData(d?: string): string | null {
  if (!d) return null
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return d
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`
}

/** Página HTML do evento: faixa de preço + taxa média (div.lotes). */
async function fetchDetalhe(url: string): Promise<{ min: number | null; max: number | null; taxa: number | null; gratuito: boolean }> {
  try {
    const res = await fetch(url, { headers: HEADERS_HTML, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { min: null, max: null, taxa: null, gratuito: false }
    const $ = load(await res.text())
    const precos: number[] = []
    const taxaItems: { price: number; tax: number }[] = []
    $('div.lotes').each((_i: number, el: unknown) => {
      const texto = $(el as never).text()
      const m = texto.match(/R\$\s*([\d.,]+)[\s\S]*?\+\s*R\$\s*([\d.,]+)\s*taxa/i)
      if (!m) return
      const preco = paraFloat(m[1])
      const taxa = paraFloat(m[2])
      if (Number.isFinite(preco)) precos.push(preco)
      if (Number.isFinite(preco) && Number.isFinite(taxa)) taxaItems.push({ price: preco, tax: taxa })
    })
    if (!precos.length) return { min: null, max: null, taxa: null, gratuito: false }
    const pos = precos.filter((p) => p > 0)
    return {
      min: pos.length ? Math.min(...pos) : 0,
      max: pos.length ? Math.max(...pos) : 0,
      taxa: avgTaxaPct(taxaItems),
      gratuito: pos.length === 0,
    }
  } catch (e) {
    console.error('[pensa] detalhe falhou', url, String(e))
    return { min: null, max: null, taxa: null, gratuito: false }
  }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%pensanoevento.com.br%')
      .limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) { console.error('[pensa] getKnown falhou', String(e)) }
  return set
}

async function getSource() {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'pensanoevento').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const pensaNoEventoScraper: Scraper = async (ctx) => {
  try {
    const db = adminClient()
    const src = await getSource()
    const cfg = src?.cfg ?? {}
    const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)

    // Fase 1: descobre eventos novos pela API (cursor salvo na config).
    let cursor: string | null = (cfg.cursor as string) || null
    const candidatos: BuscaItem[] = []
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const qs = new URLSearchParams()
      qs.set('date', DATE_RANGE)
      if (cursor) qs.set('cursor', cursor)
      let payload: { data?: BuscaItem[]; meta?: { next_cursor?: string | null } }
      try {
        const res = await fetch(`${BUSCA}?${qs.toString()}`, { headers: HEADERS_API, signal: AbortSignal.timeout(12000) })
        if (!res.ok) { console.error('[pensa] busca HTTP', res.status); break }
        payload = await res.json()
      } catch (e) { console.error('[pensa] busca falhou', String(e)); break }

      for (const it of payload.data ?? []) {
        if (!it.url || !it.evento) continue
        if (known.has(it.url)) continue
        candidatos.push(it)
        known.add(it.url)
      }
      cursor = payload.meta?.next_cursor ?? null
      if (!cursor) break // fim -> recomeça do início na próxima
      if (candidatos.length >= MAX_NOVOS) break
    }

    if (src) await db.from('crawler_sources').update({ config: { ...cfg, cursor } }).eq('id', src.id)
    const aProcessar = candidatos.slice(0, MAX_NOVOS)
    console.log(`[pensa] candidatos=${candidatos.length} processando=${aProcessar.length} proxCursor=${cursor ? 'sim' : 'fim'}`)

    // Fase 2: detalhe (preço/taxa) em paralelo.
    const out: RawEvent[] = []
    const BATCH = 8
    for (let i = 0; i < aProcessar.length; i += BATCH) {
      const slice = aProcessar.slice(i, i + BATCH)
      const mapped = await Promise.all(slice.map(async (it) => {
        const det = await fetchDetalhe(it.url)
        return {
          url_evento: it.url,
          nome: it.evento,
          data_inicio: isoData(it.data),
          data_fim: null,
          organizador_raw: null,
          organizador_url: null,
          local_raw: it.local ?? null,
          cidade: it.cidade ?? null,
          uf: it.estado ?? null,
          pais: 'Brasil',
          preco_min: det.min,
          preco_max: det.max,
          taxa_pct: det.taxa,
          gratuito: det.gratuito,
          online: false,
          categoria: null,
          imagem_url: it.capaURL ?? null,
          descricao: null,
          raw: { url: it.url },
        } as RawEvent
      }))
      out.push(...mapped)
    }
    return out
  } catch (e) {
    console.error('[pensa] ERRO', String(e))
    return []
  }
}
