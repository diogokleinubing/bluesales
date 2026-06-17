// Fonte: Clube do Ingresso (clubedoingresso.com) — SSR Bootstrap4/jQuery.
//   Listagem: GET /todoseventos  (HTML SSR) -> cards .ItemCarrousel com
//     href="/evento/<slug>". Renderiza todos os eventos inline (sem paginação).
//   Detalhe: GET /evento/<slug>  (HTML SSR) com:
//     - <meta property="og:*"> (título, imagem, descrição curta).
//     - .PageEvent__nameEvent .nome[data-nome] -> nome.
//     - .PageEvent__select .PageEvent__desc -> data por extenso
//         ("Sábado, 13 de Junho de 2026 - Abertura: 21:00").
//     - .PageEvent__local -> venue (subTitle) + endereço (desc, com cidade/UF).
//     - .PageEvent__organizer .PageEvent__desc -> organizador.
//     - .PageEvent__class .PageEvent__desc -> classificação etária (vai no raw).
//     - var lotesEventos = {...} (script no rodapé) -> lotes {id,nome,preco}.
//   cidade/UF saem do fim do endereço ("… - <cidade>, <UF>").
//   Taxa de serviço não é exposta no detalhe (só calculada no checkout) -> null.
//
// "Eventos Mestre" (cards recorrentes que agrupam várias datas) são pulados na
// listagem: a div de data vem com a classe renderizada `visibility-hidden` e o
// texto "Evento Mestre" (nos cards normais o token fica como `[#…#]` literal).
//
// Sem paginação: a cada execução coletamos os slugs novos (skip-known) em
// blocos de MAX_DETALHES; os já coletados viram "known" e o backlog é varrido
// run após run. O site usa fila CrowdHandler, que normalmente passa direto.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.clubedoingresso.com'
const LISTAGEM = `${HOST}/todoseventos`
const MAX_DETALHES = 80 // teto de páginas de detalhe por execução
const BATCH = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Referer: `${HOST}/`,
}

const urlDe = (slug: string) => `${HOST}/evento/${slug}`

/** GET com 1 retry em 429/503 (fila CrowdHandler / rate-limit). */
async function get(url: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 503) {
        if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1500)); continue }
        console.error('[clubedoingresso] fila/HTTP', res.status, url)
        return null
      }
      if (!res.ok) { console.error('[clubedoingresso] HTTP', res.status, url); return null }
      return await res.text()
    } catch (e) {
      if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[clubedoingresso] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

/** Decodifica entidades HTML comuns (&amp; &#039; &#xNN; etc.). */
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

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04', maio: '05',
  junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

/** "Sábado, 13 de Junho de 2026 - Abertura: 21:00" -> ISO (offset -03:00). */
function parseData(txt: string): string | null {
  const m = txt.match(/(\d{1,2})\s+de\s+([A-Za-zçÇãÃéêíóôú]+)\s+de\s+(\d{4})/i)
  if (!m) return null
  const mes = MESES[m[2].toLowerCase()]
  if (!mes) return null
  const dia = m[1].padStart(2, '0')
  const h = txt.match(/(\d{1,2})\s*:\s*(\d{2})/)
  const hora = h ? `${h[1].padStart(2, '0')}:${h[2]}:00` : '00:00:00'
  return `${m[3]}-${mes}-${dia}T${hora}-03:00`
}

/** Cidade/UF do fim do endereço: "… - Moóca - São Paulo, SP". */
function cidadeUf(end: string | null): { cidade: string | null; uf: string | null } {
  if (!end) return { cidade: null, uf: null }
  const partes = end.split(' - ').map((p) => p.trim()).filter(Boolean)
  const ultima = partes[partes.length - 1] ?? ''
  const m = ultima.match(/^(.+?),\s*([A-Za-z]{2})$/)
  if (m) return { cidade: decode(m[1]).trim(), uf: m[2].toUpperCase() }
  return { cidade: null, uf: null }
}

/** Lotes do script `var lotesEventos = {...}` -> faixa de preço. */
function parseLotes(html: string): { min: number | null; max: number | null; gratuito: boolean } {
  const m = html.match(/var\s+lotesEventos\s*=\s*(\{[\s\S]*?\});/)
  if (!m) return { min: null, max: null, gratuito: false }
  try {
    const obj = JSON.parse(m[1]) as { lotesEventos?: { preco?: number }[] }
    const precos = (obj.lotesEventos ?? []).map((l) => Number(l.preco)).filter((p) => Number.isFinite(p))
    if (!precos.length) return { min: null, max: null, gratuito: false }
    const pos = precos.filter((p) => p > 0)
    if (!pos.length) return { min: 0, max: 0, gratuito: true }
    return { min: Math.min(...pos), max: Math.max(...pos), gratuito: false }
  } catch { return { min: null, max: null, gratuito: false } }
}

/** Texto da descrição (.EventDescricao), tags removidas e truncado. */
function descricaoDe(html: string): string | null {
  const i = html.indexOf('class="EventDescricao"')
  if (i < 0) return null
  const fim = html.indexOf('</section>', i)
  const bloco = html.slice(i, fim > 0 ? fim : i + 8000)
  const txt = decode(bloco.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return txt ? txt.slice(0, 2000) : null
}

/** Slugs de evento da listagem (cada card é um <a href="/evento/…">…</a>).
 *  Pula os "Eventos Mestre" (classe `visibility-hidden` na div de data ou
 *  texto "Evento Mestre"). */
function eventSlugs(html: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<a[^>]+href="\/evento\/([a-z0-9][a-z0-9_-]*)"[\s\S]*?<\/a>/gi)) {
    const slug = m[1]
    if (seen.has(slug)) continue
    if (/Evento Mestre/i.test(m[0])) continue
    if (/\bvisibility-hidden\b[^"]*ItemCarrousel__data/.test(m[0])) continue
    seen.add(slug)
    out.push(slug)
  }
  return out
}

async function fetchDetalhe(slug: string): Promise<RawEvent | null> {
  const url = urlDe(slug)
  const html = await get(url)
  if (!html) return null

  const nomeRaw = html.match(/<div class="nome"[^>]*data-nome="([^"]*)"/)?.[1]
  const nome = nomeRaw ? decode(nomeRaw) : (meta(html, 'og:title') ?? '')
  if (!nome) return null

  const dataTxt = html.match(/PageEvent__select"[\s\S]*?PageEvent__desc">([^<]+)</)?.[1] ?? ''
  const data_inicio = parseData(decode(dataTxt))

  const localM = html.match(
    /PageEvent__local[^"]*"[\s\S]*?PageEvent__subTitle">([^<]+)<[\s\S]*?PageEvent__desc">([^<]+)</,
  )
  const venue = localM ? decode(localM[1]) : null
  const endereco = localM ? decode(localM[2]) : null
  const { cidade, uf } = cidadeUf(endereco)

  const orgRaw = html.match(/PageEvent__organizer[^"]*"[\s\S]*?PageEvent__desc">([^<]+)</)?.[1]
  const organizador_raw = orgRaw ? decode(orgRaw) : null

  const classificacao = html.match(/PageEvent__class[^"]*"[\s\S]*?PageEvent__desc">([^<]+)</)?.[1]?.trim() ?? null

  const { min, max, gratuito } = parseLotes(html)
  let preco_min = min, preco_max = max
  if (preco_min === null) {
    const p = Number(meta(html, 'product:price:amount'))
    if (Number.isFinite(p) && p > 0) { preco_min = p; preco_max = p }
  }

  return {
    url_evento: url,
    nome,
    data_inicio,
    data_fim: null,
    organizador_raw,
    organizador_url: null,
    local_raw: venue ?? endereco,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min,
    preco_max,
    taxa_pct: null, // não exposta no detalhe (só calculada no checkout)
    gratuito,
    online: false,
    categoria: null, // Clube do Ingresso não expõe gênero/categoria no detalhe
    imagem_url: meta(html, 'og:image'),
    descricao: descricaoDe(html) ?? meta(html, 'og:description'),
    raw: { slug, endereco, classificacao },
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'clubedoingresso').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

/** URLs já coletadas (skip-known no detalhe). */
async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%clubedoingresso%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[clubedoingresso] getKnown falhou', String(e)) }
  return s
}

export const clubeDoIngressoScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))

  const lista = await get(LISTAGEM)
  if (!lista) {
    ctx.notas?.push('Clube do Ingresso: listagem vazia (fila/HTTP?)')
    return []
  }

  const slugs = eventSlugs(lista)
  if (!slugs.length) {
    ctx.notas?.push('Clube do Ingresso: nenhum card na listagem')
    return []
  }

  // Reprocessar CAMINHA por um offset (recoleta os já existentes, em pedaços de
  // `cap`, até o fim → volta a 0). Coleta normal pega só os ainda-novos.
  let alvo: string[]
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = slugs.slice(off, off + cap)
    const novoOff = off + alvo.length
    const fim = novoOff >= slugs.length || alvo.length === 0
    if (src) await db.from('crawler_sources').update({ config: { ...cfg, reproc_offset: fim ? 0 : novoOff } }).eq('id', src.id)
    ctx.notas?.push(`Clube do Ingresso: reprocessando ${off}–${novoOff} de ${slugs.length}${fim ? ' (fim → reinicia)' : ''}`)
  } else {
    const known = await getKnown(db)
    alvo = slugs.filter((s) => !known.has(urlDe(s))).slice(0, cap)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((s) => fetchDetalhe(s)))
    for (const ev of mapped) if (ev) out.push(ev)
  }

  ctx.notas?.push(
    `Clube do Ingresso: cards=${slugs.length}, novos=${alvo.length}, coletados=${out.length}`,
  )
  console.log(`[clubedoingresso] cards=${slugs.length} alvo=${alvo.length} novos=${out.length}`)
  return out
}
