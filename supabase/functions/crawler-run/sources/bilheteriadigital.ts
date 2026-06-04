// Fonte: Bilheteria Digital — HTML renderizado no servidor (fetch + cheerio).
//   Listagem por cidade em https://www.bilheteriadigital.com/...
//
// VALIDAR com HTML real: confirmar URL de listagem e seletores dos cards.
// Estrutura igual à do Guichê Web; ajustar após inspecionar o HTML cru.

import { load } from 'https://esm.sh/cheerio@1.0.0'
import type { RawEvent, Scraper } from '../../_shared/types.ts'

const BASE = 'https://www.bilheteriadigital.com'

function parsePreco(txt: string): { min: number | null; gratuito: boolean } {
  const t = txt.toLowerCase()
  if (t.includes('grátis') || t.includes('gratuito')) return { min: 0, gratuito: true }
  const m = txt.replace(/\./g, '').match(/(\d+),(\d{2})/)
  if (!m) return { min: null, gratuito: false }
  return { min: Number(`${m[1]}.${m[2]}`), gratuito: false }
}

export const bilheteriaDigitalScraper: Scraper = async ({ cidade, uf }) => {
  const slug = cidade.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
  const url = `${BASE}/eventos/${slug}`

  let html: string
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    console.error('[bilheteriadigital] fetch falhou', cidade, String(e))
    return []
  }

  const out: RawEvent[] = []
  try {
    const $ = load(html)
    $('.event-card, .card-evento, [data-event]').each((_i: number, el: unknown) => {
      const card = $(el as never)
      const a = card.find('a').first()
      const href = a.attr('href')
      const nome = (card.find('.event-title, .titulo, h3').first().text() || a.attr('title') || '').trim()
      if (!href || !nome) return
      const link = href.startsWith('http') ? href : `${BASE}${href}`
      const local = card.find('.event-venue, .local, .venue').first().text().trim() || null
      const precoTxt = card.find('.event-price, .preco, .price').first().text().trim()
      const { min, gratuito } = parsePreco(precoTxt)
      out.push({
        url_evento: link,
        nome,
        data_inicio: null, // VALIDAR: extrair data do card/atributo
        organizador_raw: null,
        local_raw: local,
        cidade,
        uf,
        preco_min: min,
        preco_max: null,
        gratuito,
        online: false,
        imagem_url: card.find('img').first().attr('src') ?? null,
        raw: { html: card.html() },
      })
    })
  } catch (e) {
    console.error('[bilheteriadigital] parse falhou', cidade, String(e))
  }
  return out
}
