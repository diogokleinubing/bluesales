// Fonte: Ingresso Digital — HTML server-side (sem API). Listagem paginada:
//   https://ingressodigital.com/pesquisa.php?busca=S&pg=N&txt_genero=
// Cards .card-evento (link /evento/<id>/<slug>, título, categoria, data pt-BR,
// "Cidade, UF"). Preço não vem na listagem (fica nulo). Poucas páginas: varre
// pg=1.. até esvaziar. Pula os já coletados (dedupe por URL).

import { load } from 'https://esm.sh/cheerio@1.0.0'
import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://ingressodigital.com'
const MAX_PG = 6 // teto de segurança (o site tem ~3 páginas)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const MESES: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
}

/** "04 de Jun às 20:00" / "06 de Jun a 07 de Jun" -> ISO (ano inferido). */
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

export const ingressoDigitalScraper: Scraper = async () => {
  const db = adminClient()
  const known = await getKnown(db)
  const agora = new Date()
  const out: RawEvent[] = []

  for (let pg = 1; pg <= MAX_PG; pg++) {
    let html: string
    try {
      const res = await fetch(`${HOST}/pesquisa.php?busca=S&pg=${pg}&txt_genero=`, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR' },
        signal: AbortSignal.timeout(15000),
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

      const categoria = card.find('.genero-evento-card').first().text().trim() || null
      const dataTxt = card.find('.data-evento').first().text().trim()
      const loc = card.find('.area-cont-card p').last().text().replace(/\s+/g, ' ').trim()
      let cidade: string | null = null
      let uf: string | null = null
      const parts = loc.split(',')
      if (parts.length >= 2) {
        uf = parts.pop()!.trim().toUpperCase()
        cidade = parts.join(',').trim()
      } else if (loc) {
        cidade = loc
      }
      const img = card.find('img.card-evento-img').first().attr('data-src') || null

      out.push({
        url_evento: url,
        nome,
        data_inicio: parseDataBR(dataTxt, agora),
        data_fim: null,
        organizador_raw: null,
        organizador_url: null,
        local_raw: null,
        cidade,
        uf: uf && uf.length === 2 ? uf : null,
        pais: 'Brasil',
        preco_min: null,
        preco_max: null,
        taxa_pct: null,
        gratuito: false,
        online: false,
        categoria,
        imagem_url: img,
        descricao: null,
        raw: { href },
      })
      known.add(url)
      novos++
    })
    console.log(`[idigital] pg=${pg} cards=${cards.length} novos=${novos}`)
  }

  return out
}
