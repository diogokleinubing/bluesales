// Fonte: Bilheteria Express (Magento — teatro, stand-up, shows, infantil).
//   Lista: GET /eventos-por-data/todos-os-eventos.html?p=<N>  (HTML completo;
//     server-side não retorna o JSON do scroll, mas a página já traz os cards).
//     Links de produto: .../ingressos-para-<slug>-<sku>.html. Paginação por p=.
//     Páginas fora do range são "clampadas" pra última — detectamos pelo número
//     da página corrente no paginador (se != p pedido, passamos do fim).
//   Detalhe (HTML do produto), dados estruturados embutidos em <script>:
//     - spConfig = new Product.Config({...})  -> datas reais COM ano
//         (attributes.<id>.options[].label = "20/06/2026 às 19h00")
//     - bexProductConfig = {...}              -> preço (priceValue) + taxa (R$)
//     - JSON-LD "@type":"Event"              -> local, cidade, UF
//     - og:title / og:image / organizer_name
//   Janela deslizante por página (config.pagina); o "Rodar em lote" cobre tudo.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct, decodeEscapes } from '../../_shared/classify.ts'

const HOST = 'https://www.bilheteriaexpress.com.br'
const LISTA = `${HOST}/eventos-por-data/todos-os-eventos.html?is_ajax=1&is_scroll=1&p=`
const PAGES_PER_RUN = 5 // ~10 eventos/página → ~50 detalhes por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' }

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').trim()
}

/** Extrai o objeto JSON `{...}` que vem logo após `marker` (chaves balanceadas). */
function jsonAfter(html: string, marker: string): unknown | null {
  const i = html.indexOf(marker)
  if (i < 0) return null
  const start = html.indexOf('{', i)
  if (start < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let j = start; j < html.length; j++) {
    const ch = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(html.slice(start, j + 1)) } catch { return null } } }
  }
  return null
}

/** "20/06/2026 às 19h00" -> ISO -03:00 (hora opcional). */
function labelISO(label: string): string | null {
  const m = label.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{1,2})h(\d{2}))?/)
  if (!m) return null
  const hh = (m[4] ?? '00').padStart(2, '0')
  return `${m[3]}-${m[2]}-${m[1]}T${hh}:${m[5] ?? '00'}:00-03:00`
}

/** Calendário em São Paulo (para inferir ano quando a data não traz o ano). */
function hojeSP(): { y: number; t: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [y, mo, d] = f.split('-').map(Number)
  return { y, t: Date.UTC(y, mo - 1, d) }
}

/** Fallback: "25 até 27/06 - Sáb. 19h00" / "03/06 | Qua. 21h00" -> ISO, inferindo ano. */
function horarioISO(txt: string): string | null {
  const m = txt.match(/(\d{1,2})(?:\s*at[ée]\s*\d{1,2})?\/(\d{2})(?:\D+(\d{1,2})h(\d{2}))?/i)
  if (!m) return null
  const dia = m[1].padStart(2, '0'), mes = m[2]
  const hh = (m[3] ?? '00').padStart(2, '0'), mm = m[4] ?? '00'
  const { y, t } = hojeSP()
  let ano = y
  if (Date.UTC(y, Number(mes) - 1, Number(dia)) < t - 31 * 86_400_000) ano = y + 1
  return `${ano}-${mes}-${dia}T${hh}:${mm}:00-03:00`
}

interface Detalhe {
  nome: string | null
  categoria: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  organizador: string | null
  imagem: string | null
  dataIni: string | null
  dataFim: string | null
  precoMin: number | null
  precoMax: number | null
  taxa: number | null
}

async function fetchDetalhe(url: string): Promise<Detalhe | null> {
  let html = ''
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    html = await res.text()
  } catch { return null }

  // Nome
  let nome: string | null = null
  const ogt = html.match(/<meta property="og:title" content="([^"]*)"/)
  if (ogt) nome = decode(ogt[1])

  // Categoria (gênero) — primeiro <td> após o ícone de gênero
  let categoria: string | null = null
  const gen = html.match(/ico_genero\.png[\s\S]*?<td>\s*([^<]+?)\s*<\/td>/)
  if (gen) categoria = decode(gen[1])

  // JSON-LD Event -> local / cidade / uf
  let local: string | null = null, cidade: string | null = null, uf: string | null = null
  for (const b of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    if (!b[1].includes('"Event"')) continue
    try {
      const ld = JSON.parse(b[1]) as {
        name?: string
        location?: { name?: string; address?: { addressLocality?: string; addressRegion?: string } }
      }
      local = ld.location?.name ? decode(ld.location.name) : null
      cidade = ld.location?.address?.addressLocality ? decode(ld.location.address.addressLocality) : null
      const r = ld.location?.address?.addressRegion
      uf = r ? r.trim().toUpperCase().slice(0, 2) : null
      if (!nome && ld.name) nome = decode(ld.name)
    } catch { /* ignora */ }
    break
  }
  // Fallback de cidade/uf pelo endereço textual do local
  if (!cidade) {
    const addr = html.match(/ico_local\.png[\s\S]*?<p>\s*([^<]+?)\s*<\/p>/)
    if (addr) {
      const mm = addr[1].match(/,\s*([^,-]+?)\s*-\s*([A-Z]{2})\s*,/)
      if (mm) { cidade = decode(mm[1]); uf = mm[2] }
    }
  }

  // Organizador (presente no eventData do pixel)
  let organizador: string | null = null
  const org = html.match(/"organizer_name":"([^"]+)"/)
  if (org) organizador = decode(decodeEscapes(org[1]))

  // Imagem
  let imagem: string | null = null
  const ogi = html.match(/<meta property="og:image" content="([^"]*)"/)
  if (ogi) imagem = ogi[1]

  // Datas: spConfig (com ano) -> fallback horário (infere ano)
  let dataIni: string | null = null, dataFim: string | null = null
  const sp = jsonAfter(html, 'new Product.Config(') as
    { attributes?: Record<string, { options?: { label?: string }[] }> } | null
  const datas: string[] = []
  for (const a of Object.values(sp?.attributes ?? {})) {
    for (const o of a.options ?? []) {
      const iso = o.label ? labelISO(o.label) : null
      if (iso) datas.push(iso)
    }
  }
  if (datas.length) {
    datas.sort()
    dataIni = datas[0]
    if (datas.length > 1) dataFim = datas[datas.length - 1]
  } else {
    const hor = html.match(/ico_horario\.png[\s\S]*?<td>\s*([^<]+?)\s*<\/td>/)
    if (hor) dataIni = horarioISO(decode(hor[1]))
  }

  // Preços: bexProductConfig (priceValue + tax) -> fallback opConfig (price + includeTax)
  const items: { price: number; tax: number }[] = []
  const bex = jsonAfter(html, 'bexProductConfig =') as
    { options?: Record<string, { priceValue?: number; tax?: number }> } | null
  for (const o of Object.values(bex?.options ?? {})) {
    const p = Number(o.priceValue)
    if (Number.isFinite(p)) items.push({ price: p, tax: Number.isFinite(Number(o.tax)) ? Number(o.tax) : 0 })
  }
  if (!items.length) {
    const oc = jsonAfter(html, 'new Product.Options(') as
      Record<string, Record<string, { price?: number; includeTax?: number }>> | null
    for (const grupo of Object.values(oc ?? {})) {
      for (const o of Object.values(grupo ?? {})) {
        const p = Number(o.price)
        if (Number.isFinite(p)) items.push({ price: p, tax: Math.max(0, Number(o.includeTax ?? p) - p) })
      }
    }
  }
  const pos = items.map((i) => i.price).filter((p) => p > 0)
  const precoMin = pos.length ? Math.min(...pos) : null
  const precoMax = pos.length ? Math.max(...pos) : null
  const taxa = avgTaxaPct(items)

  if (!nome) return null
  return { nome, categoria, local, cidade, uf, organizador, imagem, dataIni, dataFim, precoMin, precoMax, taxa }
}

/** URLs de produto de uma página. `clamped` = pedimos página além do fim
 *  (o paginador devolveu outra página corrente → fim do catálogo). */
async function fetchPagina(p: number): Promise<{ urls: string[]; clamped: boolean }> {
  try {
    const res = await fetch(LISTA + p, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return { urls: [], clamped: true }
    const html = await res.text()
    const cur = html.match(/<li class="current"><span class="button button-dark">(\d+)<\/span>/)
    const clamped = !!cur && Number(cur[1]) !== p
    if (clamped) return { urls: [], clamped: true }
    const urls = [...html.matchAll(/href="(https:\/\/www\.bilheteriaexpress\.com\.br\/ingressos-para-[^"/?]+-\d{6,}\.html)"/g)]
      .map((m) => m[1])
    return { urls: [...new Set(urls)], clamped: false }
  } catch { return { urls: [], clamped: false } }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'bilheteriaexpress').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const bilheteriaExpressScraper: Scraper = async () => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const pagina = Math.max(1, Number(cfg.pagina ?? 1))

  // Coleta os links das próximas PAGES_PER_RUN páginas (para no fim do catálogo).
  const urls: string[] = []
  let fim = false
  let prox = pagina
  for (let k = 0; k < PAGES_PER_RUN; k++) {
    const p = pagina + k
    const { urls: pageUrls, clamped } = await fetchPagina(p)
    if (clamped) { fim = true; break }
    urls.push(...pageUrls)
    prox = p + 1
  }
  const uniq = [...new Set(urls)]
  const novaPagina = fim ? 1 : prox
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, pagina: novaPagina } }).eq('id', src.id)
  console.log(`[bilheteriaexpress] pagina ${pagina}->${novaPagina} urls=${uniq.length} fim=${fim}`)

  // Enriquecimento via página de detalhe (em lotes).
  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < uniq.length; i += BATCH) {
    const slice = uniq.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (url) => {
      const d = await fetchDetalhe(url)
      if (!d) return null
      return {
        url_evento: url,
        nome: d.nome!,
        data_inicio: d.dataIni,
        data_fim: d.dataFim,
        organizador_raw: d.organizador,
        organizador_url: null,
        local_raw: d.local,
        cidade: d.cidade,
        uf: d.uf,
        pais: 'Brasil',
        preco_min: d.precoMin,
        preco_max: d.precoMax,
        taxa_pct: d.taxa,
        gratuito: false,
        online: false,
        categoria: d.categoria,
        imagem_url: d.imagem,
        descricao: null,
        raw: { sku: url.match(/-(\d{6,})\.html$/)?.[1] ?? null },
      } as RawEvent
    }))
    out.push(...mapped.filter((e): e is RawEvent => !!e))
  }
  return out
}
