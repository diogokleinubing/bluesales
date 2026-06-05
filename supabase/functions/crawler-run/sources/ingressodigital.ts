// Fonte: Ingresso Digital — HTML server-side (sem API). Listagem paginada:
//   https://ingressodigital.com/pesquisa.php?busca=S&pg=N&txt_genero=
// Cards .card-evento (link /evento/<id>/<slug>, título, categoria, data pt-BR,
// "Cidade, UF"). Local e preço vêm na PÁGINA do evento (.dados-loca-detalhes e
// .valores-ing). Poucas páginas: varre pg=1.. até esvaziar; pula os já
// coletados (dedupe por URL). Taxa não é exposta -> nula.

import { load } from 'https://esm.sh/cheerio@1.0.0'
import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const HOST = 'https://ingressodigital.com'
const MAX_PG = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR' }

const MESES: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
}

function parseDataBR(txt: string, agora: Date): string | null {
  const m = txt.match(/(\d{1,2})\s+de\s+([A-Za-zçÇ]{3})/i)
  if (!m) return null
  const dia = Number(m[1])
  const mes = MESES[m[2].toLowerCase().slice(0, 3)]
  if (mes == null || !dia) return null
  const h = txt.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)
  const hh = h ? Number(h[1]) : 0
  const mm = h ? Number(h[2]) : 0
  const mesAtual = agora.getUTCMonth()
  const ano = mes >= mesAtual ? agora.getUTCFullYear() : agora.getUTCFullYear() + 1
  const p = (n: number) => String(n).padStart(2, '0')
  return `${ano}-${p(mes + 1)}-${p(dia)}T${p(hh)}:${p(mm)}:00-03:00`
}

interface Candidato {
  url: string
  nome: string
  dataIso: string | null
  categoria: string | null
  cidade: string | null
  uf: string | null
  img: string | null
}

interface Detalhe { local: string | null; min: number | null; max: number | null; taxa: number | null }

let diagDone = false // DIAG temporário: confere acesso à página /comprar

/**
 * Detalhe: página do evento (local + preço fallback) e página de compra
 * (preço base em valor<n> + taxa em taxa_adm<n>), buscadas em paralelo.
 */
async function fetchDetalhe(url: string): Promise<Detalhe> {
  const comprarUrl = url.replace('/evento/', '/comprar/')
  const get = (u: string) =>
    fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
  const [evHtml, cpHtml] = await Promise.all([get(url), get(comprarUrl)])

  let local: string | null = null
  if (evHtml) {
    const $ = load(evHtml)
    local = $('.dados-loca-detalhes p').first().text().replace(/\s+/g, ' ').trim() || null
  }

  let min: number | null = null
  let max: number | null = null
  let taxa: number | null = null
  if (cpHtml) {
    const $ = load(cpHtml)
    const valByKey: Record<string, number> = {}
    const taxByKey: Record<string, number> = {}
    $('input[name]').each((_i: number, el: unknown) => {
      const name = $(el as never).attr('name') || ''
      const v = Number($(el as never).attr('value'))
      let m: RegExpMatchArray | null
      if ((m = name.match(/^valor(\d+)$/))) { if (Number.isFinite(v)) valByKey[m[1]] = v } else if ((m = name.match(/^taxa_adm(\d+)$/))) { if (Number.isFinite(v)) taxByKey[m[1]] = v }
    })
    const precos = Object.values(valByKey).filter((p) => p > 0)
    if (precos.length) { min = Math.min(...precos); max = Math.max(...precos) }
    taxa = avgTaxaPct(Object.keys(valByKey).map((k) => ({ price: valByKey[k], tax: taxByKey[k] ?? NaN })))
  }

  if (!diagDone) {
    diagDone = true
    console.log('[idigital] DIAG', comprarUrl, 'comprarHtml?', !!cpHtml, 'len=', cpHtml?.length ?? 0, 'min=', min, 'taxa=', taxa)
  }

  // Fallback de preço pela página do evento se a de compra não veio.
  if (min == null && evHtml) {
    const $ = load(evHtml)
    const nums = [...$('.valores-ing').first().text().matchAll(/R\$\s*([\d.]+,\d{2})/g)]
      .map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
      .filter((n) => Number.isFinite(n))
    if (nums.length) { min = Math.min(...nums); max = Math.max(...nums) }
  }

  return { local, min, max, taxa }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%ingressodigital.com%')
      .limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) {
    console.error('[idigital] getKnown falhou', String(e))
  }
  return set
}

export const ingressoDigitalScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)
  const agora = new Date()

  // Fase 1: descobre os eventos novos pela listagem.
  const candidatos: Candidato[] = []
  for (let pg = 1; pg <= MAX_PG; pg++) {
    let html: string
    try {
      const res = await fetch(`${HOST}/pesquisa.php?busca=S&pg=${pg}&txt_genero=`, {
        headers: HEADERS, signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) { console.error('[idigital] pg', pg, 'HTTP', res.status); break }
      html = await res.text()
    } catch (e) {
      console.error('[idigital] pg', pg, 'falhou', String(e))
      break
    }
    const $ = load(html)
    const cards = $('.card-evento')
    if (cards.length === 0) break
    let novos = 0
    cards.each((_i: number, el: unknown) => {
      const card = $(el as never)
      const href = card.find('a').first().attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `${HOST}${href}`
      if (known.has(url)) return
      const nome = card.find('.titulo-card').first().text().trim()
      if (!nome) return
      const loc = card.find('.area-cont-card p').last().text().replace(/\s+/g, ' ').trim()
      let cidade: string | null = null
      let uf: string | null = null
      const parts = loc.split(',')
      if (parts.length >= 2) { uf = parts.pop()!.trim().toUpperCase(); cidade = parts.join(',').trim() } else if (loc) cidade = loc
      candidatos.push({
        url,
        nome,
        dataIso: parseDataBR(card.find('.data-evento').first().text().trim(), agora),
        categoria: card.find('.genero-evento-card').first().text().trim() || null,
        cidade,
        uf: uf && uf.length === 2 ? uf : null,
        img: card.find('img.card-evento-img').first().attr('data-src') || null,
      })
      known.add(url)
      novos++
    })
    console.log(`[idigital] pg=${pg} cards=${cards.length} novos=${novos}`)
  }

  // Fase 2: detalhe (local + preço) em paralelo.
  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < candidatos.length; i += BATCH) {
    const slice = candidatos.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (c) => {
      const det = await fetchDetalhe(c.url)
      return {
        url_evento: c.url,
        nome: c.nome,
        data_inicio: c.dataIso,
        data_fim: null,
        organizador_raw: null,
        organizador_url: null,
        local_raw: det.local,
        cidade: c.cidade,
        uf: c.uf,
        pais: 'Brasil',
        preco_min: det.min,
        preco_max: det.max,
        taxa_pct: det.taxa,
        gratuito: det.min === 0,
        online: false,
        categoria: c.categoria,
        imagem_url: c.img,
        descricao: null,
        raw: { url: c.url },
      } as RawEvent
    }))
    out.push(...mapped)
  }

  return out
}
