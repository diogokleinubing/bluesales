// Fonte: Bilheteria Digital — HTML server-side (sem API).
//   Listagem: https://www.bilheteriadigital.com/busca/aa/as/<pg>
//   Cards .box-li-evento (link, .titulo-evento-thumb, .data-evento-thumb,
//   .cidade-box-evento "Cidade - UF", .local-box-evento, img).
//   Detalhe (página do evento): preço/taxa em data-ingresso-valor /
//   data-ingresso-taxa; data em input[name=dataInicio]; local em
//   input[name=local]; organizador no gtag ('brand': "...").

import { load } from 'https://esm.sh/cheerio@1.0.0'
import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const HOST = 'https://www.bilheteriadigital.com'
const MAX_PG_UF = 15 // teto de páginas por estado
const MAX_NOVOS = 150 // teto de eventos novos por execução (restante na próxima)
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR' }

interface Candidato {
  url: string
  nome: string
  cidade: string | null
  uf: string | null
  local: string | null
  img: string | null
}

interface Detalhe {
  min: number | null
  max: number | null
  taxa: number | null
  dataInicio: string | null
  local: string | null
  organizador: string | null
}

async function fetchDetalhe(url: string): Promise<Detalhe> {
  const vazio: Detalhe = { min: null, max: null, taxa: null, dataInicio: null, local: null, organizador: null }
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return vazio
    const html = await res.text()
    const $ = load(html)

    const precos: number[] = []
    const taxaItems: { price: number; tax: number }[] = []
    $('[data-ingresso-valor]').each((_i: number, el: unknown) => {
      const v = Number($(el as never).attr('data-ingresso-valor'))
      const t = Number($(el as never).attr('data-ingresso-taxa'))
      if (Number.isFinite(v)) {
        precos.push(v)
        if (Number.isFinite(t)) taxaItems.push({ price: v, tax: t })
      }
    })
    const pos = precos.filter((p) => p > 0)

    const dataInicio = $('input[name=dataInicio]').attr('value') || null
    const local = $('input[name=local]').attr('value') || null
    const organizador = html.match(/['"]brand['"]\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? null

    return {
      min: pos.length ? Math.min(...pos) : null,
      max: pos.length ? Math.max(...pos) : null,
      taxa: avgTaxaPct(taxaItems),
      dataInicio,
      local,
      organizador,
    }
  } catch (e) {
    console.error('[bdigital] detalhe falhou', url, String(e))
    return vazio
  }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%bilheteriadigital.com%')
      .limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) {
    console.error('[bdigital] getKnown falhou', String(e))
  }
  return set
}

async function getSource() {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'bilheteriadigital').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

const ESTADOS_POR_RUN = 5 // varre poucos estados por execução (gira o cursor)

export const bilheteriaDigitalScraper: Scraper = async (ctx) => {
  try {
    const db = adminClient()
    const src = await getSource()
    const cfg = src?.cfg ?? {}
    const cursor = Number(cfg.uf_cursor ?? 0) % UFS.length
    const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)

    // Fase 1: descobre eventos novos varrendo alguns estados (/<UF>/as/<pg>).
    const ufsRun = Array.from({ length: ESTADOS_POR_RUN }, (_, k) => UFS[(cursor + k) % UFS.length])
    const candidatos: Candidato[] = []
    for (const uf of ufsRun) {
      for (let pg = 1; pg <= MAX_PG_UF; pg++) {
        let html: string
        try {
          const res = await fetch(`${HOST}/${uf}/as/${pg}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
          if (!res.ok) break
          html = await res.text()
        } catch { break }
        const $ = load(html)
        const cards = $('.box-li-evento')
        if (cards.length === 0) break
        cards.each((_i: number, el: unknown) => {
          const card = $(el as never)
          const href = card.find('a').first().attr('href')
          if (!href) return
          const url = href.startsWith('http') ? href : `${HOST}${href}`
          if (known.has(url)) return
          const nome = card.find('.titulo-evento-thumb').first().text().trim()
          if (!nome) return
          const cidadeUf = card.find('.cidade-box-evento').first().text().replace(/\s+/g, ' ').trim()
          let cidade: string | null = null
          let estadoUf: string | null = uf
          const m = cidadeUf.match(/^(.*?)\s*-\s*([A-Za-z]{2})$/)
          if (m) { cidade = m[1].trim(); estadoUf = m[2].toUpperCase() } else if (cidadeUf) cidade = cidadeUf
          candidatos.push({
            url, nome, cidade, uf: estadoUf,
            local: card.find('.local-box-evento').first().text().replace(/\s+/g, ' ').trim() || null,
            img: card.find('img').first().attr('src') || null,
          })
          known.add(url)
        })
      }
    }

    const novoCursor = (cursor + ESTADOS_POR_RUN) % UFS.length
    if (src) await db.from('crawler_sources').update({ config: { ...cfg, uf_cursor: novoCursor } }).eq('id', src.id)
    console.log(`[bdigital] estados=${ufsRun.join(',')} cursor ${cursor}->${novoCursor} candidatos=${candidatos.length}`)

    // Fase 2: detalhe (preço/taxa/data/organizador) em paralelo.
    const out: RawEvent[] = []
    const BATCH = 6
    for (let i = 0; i < candidatos.length; i += BATCH) {
      const slice = candidatos.slice(i, i + BATCH)
      const mapped = await Promise.all(slice.map(async (c) => {
        const det = await fetchDetalhe(c.url)
        return {
          url_evento: c.url, nome: c.nome, data_inicio: det.dataInicio, data_fim: null,
          organizador_raw: det.organizador, organizador_url: null,
          local_raw: det.local ?? c.local, cidade: c.cidade, uf: c.uf, pais: 'Brasil',
          preco_min: det.min, preco_max: det.max, taxa_pct: det.taxa,
          gratuito: det.min === 0, online: false, categoria: null,
          imagem_url: c.img, descricao: null, raw: { url: c.url },
        } as RawEvent
      }))
      out.push(...mapped)
    }
    return out
  } catch (e) {
    console.error('[bdigital] ERRO', String(e))
    return []
  }
}
