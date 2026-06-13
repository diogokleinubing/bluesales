// Fonte: TicketCenter (eticketcenter.com.br) — site .NET, HTML SSR Latin-1.
//   ⚠️ Páginas servidas em ISO-8859-1 (charset no <head>): é OBRIGATÓRIO
//   decodificar o corpo como latin1, senão todo acento vira caractere inválido.
//
//   Listagem paginada: GET /eventos/?&Pagina=N -> cards .BoxGerInfo1 (id
//     RowEvento_K) com a âncora da imagem href="/eventos/<cat>/<slug>/<dd-mm>/<hh-mm>/".
//     Eventos com várias datas linkam a base (sem data) e trazem um dropdown
//     com um link datado por sessão -> usamos o 1º link datado.
//   Detalhe: GET <url datada> (HTML SSR) com:
//     - .SubInfo1 .ExtTitulo -> nome.
//     - .SemSelect -> data ("13/06/2026 - 16:00 - Sábado").
//     - .ExtGerText1 (fa-map-marker) -> "<b>Venue</b> - Endereço, Cidade/UF".
//     - .BoxIngressos .ExtText3 "INTEIRA: R$ 70,00" -> preços por setor.
//     - aba Produção: <h2 class="style3"> nome do produtor; .ExtSite a -> url.
//     - categoria vem do path /eventos/<cat>/ ; imagem/descrição via og:* / .TextoLivre1.
//   Taxa não é exposta de forma estruturada no detalhe -> taxa_pct = null.
//
// Varredura incremental por página: config.pagina avança um bloco
// (`paginas_por_run`) por execução, com wrap ao chegar na última página.
// Eventos já coletados são pulados no detalhe (skip-known), com teto por run.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.eticketcenter.com.br'
const LISTA = `${HOST}/eventos/`
const PAGINAS_POR_RUN = 3 // páginas de listagem varridas por execução
const MAX_DETALHES = 60 // teto de páginas de detalhe por execução
const BATCH = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Referer: `${HOST}/`,
}

const LATIN1 = new TextDecoder('iso-8859-1')

/** GET decodificando o corpo como ISO-8859-1; 1 retry em 429/503. */
async function get(url: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 503) {
        if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1500)); continue }
        console.error('[ticketcenter] HTTP', res.status, url)
        return null
      }
      if (!res.ok) { console.error('[ticketcenter] HTTP', res.status, url); return null }
      return LATIN1.decode(await res.arrayBuffer())
    } catch (e) {
      if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[ticketcenter] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

/** Decodifica entidades HTML residuais (&amp; &#039; etc.). */
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

function meta(html: string, prop: string): string | null {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))
  return m ? decode(m[1]) : null
}

const DATADA = /\/eventos\/[^/]+\/[^/]+\/\d{2}-\d{2}\//

/** URLs de detalhe (uma por card; resolve multi-data para o 1º link datado). */
function eventUrls(html: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const blocks = html.split('id="RowEvento_')
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    let href = b.match(/BoxImgPrincipal">\s*<a href="(\/eventos\/[^"]+)"/)?.[1] ?? null
    if (!href || !DATADA.test(href)) {
      const dd = b.match(/href="(\/eventos\/[^"]+\/\d{2}-\d{2}\/[^"]*)"/)?.[1]
      if (dd) href = dd
    }
    if (!href) continue
    const abs = HOST + href
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}

const CAT_MAP: Record<string, string> = {
  show: 'Show', teatro: 'Teatro', danca: 'Dança', musical: 'Musical', festival: 'Festival',
  festa: 'Festa', convencao: 'Convenção', palestra: 'Palestra', parque: 'Parque',
  'stand-up': 'Stand-up', exposicao: 'Exposição', esporte: 'Esporte',
}

function categoriaDe(url: string): string | null {
  const slug = url.match(/\/eventos\/([^/]+)\//)?.[1]
  if (!slug) return null
  return CAT_MAP[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1))
}

const precoBR = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

/** ISO da data do detalhe (offset -03:00); aceita "dd/mm/aaaa - hh:mm" ou só data. */
function parseData(html: string): string | null {
  const i = html.indexOf('SemSelect')
  const seg = i >= 0 ? html.slice(i, i + 200) : html
  const m = seg.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`
  const d = seg.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return d ? `${d[3]}-${d[2]}-${d[1]}T00:00:00-03:00` : null
}

async function fetchDetalhe(url: string): Promise<RawEvent | null> {
  const html = await get(url)
  if (!html) return null

  const nm = html.match(/<div class="ExtTitulo">([^<]+)<\/div>/)?.[1]
  const nome = nm ? decode(nm) : (meta(html, 'og:title')?.split('|')[0].trim() ?? '')
  if (!nome) return null

  const data_inicio = parseData(html)

  const lm = html.match(/fa-map-marker[\s\S]{0,40}?<b>([^<]+)<\/b>\s*-\s*([\s\S]*?)<\/div>/)
  const venue = lm ? decode(lm[1]) : null
  const endereco = lm ? decode(lm[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null
  const cu = endereco?.match(/,\s*([^,\/]+)\/([A-Z]{2})\b/)
  const cidade = cu ? cu[1].trim() : null
  const uf = cu ? cu[2] : null

  // Preços: usa as "INTEIRA" (faixa cheia); se não houver, cai p/ todos os R$.
  const inteiras: number[] = []
  for (const m of html.matchAll(/INTEIRA:\s*<span>\s*R\$\s*([\d.]*\d,\d{2})/g)) inteiras.push(precoBR(m[1]))
  let preco_min: number | null = null, preco_max: number | null = null
  if (inteiras.length) { preco_min = Math.min(...inteiras); preco_max = Math.max(...inteiras) }
  else {
    const todos: number[] = []
    for (const m of html.matchAll(/R\$\s*([\d.]*\d,\d{2})/g)) todos.push(precoBR(m[1]))
    const pos = todos.filter((p) => p > 0)
    if (pos.length) { preco_min = Math.min(...pos); preco_max = Math.max(...pos) }
  }

  // Produção (organizador) + site/instagram.
  const pi = html.indexOf('id="BlcTabsDesc_Producao"')
  const orgRaw = pi >= 0 ? html.slice(pi, pi + 400).match(/<h2 class="style3 mb20">([^<]+)<\/h2>/)?.[1] : undefined
  const organizador_raw = orgRaw ? decode(orgRaw) : null
  const organizador_url = html.match(/class="ExtSite"><a href="(https?:\/\/[^"]+)"/)?.[1] ?? null

  // Descrição (aba) com tags removidas; fallback og:description.
  let descricao: string | null = null
  const di = html.indexOf('id="BlcTabsDesc_Descricao"')
  if (di >= 0) {
    const tm = html.slice(di, di + 8000).match(/class="TextoLivre1">([\s\S]*?)<\/div>/)
    if (tm) {
      descricao = decode(tm[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 2000)
    }
  }
  if (!descricao) descricao = meta(html, 'og:description')

  const classificacao = html.match(/ExtClassificao[^>]*>([^<]+)<\/div>/)?.[1]?.trim() ?? null
  const codEvento = html.match(/CodigoEvento\s*=\s*"(\d+)"/)?.[1] ?? null
  const codApresentacao = html.match(/CodigoApresentacao\s*=\s*"(\d+)"/)?.[1] ?? null

  return {
    url_evento: url,
    nome,
    data_inicio,
    data_fim: null,
    organizador_raw,
    organizador_url,
    local_raw: venue ?? endereco,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min,
    preco_max,
    taxa_pct: null, // não exposta de forma estruturada no detalhe
    gratuito: false,
    online: false,
    categoria: categoriaDe(url),
    imagem_url: meta(html, 'og:image'),
    descricao,
    raw: { endereco, classificacao, codEvento, codApresentacao },
  }
}

function temProximaPagina(html: string, p: number): boolean {
  return html.includes(`?&Pagina=${p + 1}"`)
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ticketcenter').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%eticketcenter%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[ticketcenter] getKnown falhou', String(e)) }
  return s
}

export const ticketCenterScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const passo = Math.max(1, Number(cfg.paginas_por_run ?? PAGINAS_POR_RUN))
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))
  const pagina = Math.max(1, Number(cfg.pagina ?? 1))

  const urls: string[] = []
  const seen = new Set<string>()
  let fim = false
  for (let i = 0; i < passo; i++) {
    const p = pagina + i
    const html = await get(`${LISTA}?&Pagina=${p}`)
    if (!html) { fim = true; break }
    const us = eventUrls(html)
    if (!us.length) { fim = true; break }
    for (const u of us) if (!seen.has(u)) { seen.add(u); urls.push(u) }
    if (!temProximaPagina(html, p)) { fim = true; break }
  }
  const prox = fim ? 1 : pagina + passo

  const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)
  const alvo = urls.filter((u) => !known.has(u)).slice(0, cap)

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((u) => fetchDetalhe(u)))
    for (const ev of mapped) if (ev) out.push(ev)
  }

  if (src) await db.from('crawler_sources').update({ config: { ...cfg, pagina: prox } }).eq('id', src.id)
  ctx.notas?.push(
    `TicketCenter: páginas ${pagina}-${pagina + passo - 1}, urls=${urls.length}, ` +
    `novos=${alvo.length}, coletados=${out.length}; pagina ${pagina}->${prox}`,
  )
  console.log(`[ticketcenter] pagina ${pagina}->${prox} urls=${urls.length} alvo=${alvo.length} novos=${out.length}`)
  return out
}
