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
const MAX_PAGINAS = 14 // páginas por execução
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

/**
 * Página HTML do evento: faixa de preço + taxa média (div.lotes). Por lote:
 *  - remove o preço riscado (`text-decoration-line-through`) p/ pegar o preço
 *    de VENDA (com desconto), não o original;
 *  - a taxa ("(+ R$ X taxa)") é OPCIONAL — captura o preço mesmo sem ela;
 *  - reconhece lotes grátis e ignora lotes esgotados.
 */
async function fetchDetalhe(url: string): Promise<{ min: number | null; max: number | null; taxa: number | null; gratuito: boolean; temVenda: boolean }> {
  try {
    // Tenta 2x (timeout 15s) — reduz nulos por timeout sob concorrência.
    let html: string | null = null
    for (let attempt = 0; attempt < 2 && html === null; attempt++) {
      try {
        const res = await fetch(url, { headers: HEADERS_HTML, signal: AbortSignal.timeout(15000) })
        if (res.ok) html = await res.text()
      } catch { /* retry */ }
    }
    // Falha transitória: assume que vende (temVenda=true) p/ não descartar evento.
    if (html === null) return { min: null, max: null, taxa: null, gratuito: false, temVenda: true }
    const $ = load(html)
    // Sem nenhum div.lotes = página só de agenda/divulgação (não vende ingresso).
    const temVenda = $('div.lotes').length > 0
    const precos: number[] = []
    const taxaItems: { price: number; tax: number }[] = []
    $('div.lotes').each((_i: number, el: unknown) => {
      const $lote = $(el as never)
      if (/esgotad/i.test($lote.text())) return // lote indisponível
      // Remove o preço original riscado para não confundir com o de venda.
      $lote.find('.text-decoration-line-through').remove()
      const texto = $lote.text()
      const mt = texto.match(/\+\s*R\$\s*([\d.,]+)\s*taxa/i)
      const taxa = mt ? paraFloat(mt[1]) : null
      // Preço de venda: 1º "R$ X" fora do trecho da taxa.
      const semTaxa = texto.replace(/\(\s*\+\s*R\$\s*[\d.,]+\s*taxa\s*\)/gi, ' ')
      const mp = semTaxa.match(/R\$\s*([\d.,]+)/i)
      if (mp) {
        const preco = paraFloat(mp[1])
        if (Number.isFinite(preco)) {
          precos.push(preco)
          if (preco > 0 && taxa != null && Number.isFinite(taxa)) taxaItems.push({ price: preco, tax: taxa })
        }
      } else if (/gr[áa]tis|gratuito/i.test(texto)) {
        precos.push(0)
      }
    })
    if (!precos.length) return { min: null, max: null, taxa: null, gratuito: false, temVenda }
    const pos = precos.filter((p) => p > 0)
    return {
      min: pos.length ? Math.min(...pos) : 0,
      max: pos.length ? Math.max(...pos) : 0,
      taxa: avgTaxaPct(taxaItems),
      gratuito: pos.length === 0,
      temVenda,
    }
  } catch (e) {
    console.error('[pensa] detalhe falhou', url, String(e))
    return { min: null, max: null, taxa: null, gratuito: false, temVenda: true }
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
        // Eventos "só agenda" (sem venda de ingresso) não são importados.
        if (!det.temVenda) return null
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
      out.push(...mapped.filter((x): x is RawEvent => x !== null))
    }

    // Fase 3: cura o backlog de eventos PNE já capturados SEM preço. Rotaciona
    // pelos mais antigos (ultima_vez_visto): re-precifica os que vendem e marca
    // como ignorado os que são "só agenda" (sem venda). Só toca preço/ignorado.
    if (src && !ctx.reprocessar) {
      try {
        const nowIso = new Date().toISOString()
        const REPRICE = 150
        const { data: semPreco } = await db
          .from('crawled_events')
          .select('id, url_evento')
          .eq('source_id', src.id)
          .is('preco_min', null)
          .is('preco_max', null)
          .eq('gratuito', false)
          .eq('ignorado', false)
          .gte('data_inicio', nowIso) // só futuros
          .order('ultima_vez_visto', { ascending: true, nullsFirst: true })
          .limit(REPRICE)
        const lista = (semPreco ?? []) as { id: string; url_evento: string }[]
        let curados = 0
        let semVenda = 0
        const RB = 10
        for (let i = 0; i < lista.length; i += RB) {
          const slice = lista.slice(i, i + RB)
          await Promise.all(slice.map(async (r) => {
            const det = await fetchDetalhe(r.url_evento)
            const patch: Record<string, unknown> = { ultima_vez_visto: new Date().toISOString() }
            if (!det.temVenda) {
              patch.ignorado = true
              patch.ignorado_motivo = 'agenda sem venda de ingresso'
              semVenda++
            } else if (det.min != null || det.max != null || det.gratuito) {
              patch.preco_min = det.min
              patch.preco_max = det.max
              patch.taxa_pct = det.taxa
              patch.gratuito = det.gratuito
              curados++
            }
            await db.from('crawled_events').update(patch).eq('id', r.id)
          }))
        }
        console.log(`[pensa] reprice tentados=${lista.length} curados=${curados} semVenda=${semVenda}`)
      } catch (e) { console.error('[pensa] reprice falhou', String(e)) }
    }

    return out
  } catch (e) {
    console.error('[pensa] ERRO', String(e))
    return []
  }
}
