// Fonte: Mega Bilheteria (megabilheteria.com) — site PHP, UTF-8.
//   Listagem (JSON): GET /evento/lista-todos-index -> array com todos os
//     eventos: { id, imagem, nome, linha1 (local), linha2 ("Cidade, UF" OU
//     "CONFIRA A PROGRAMAÇÃO"), linha3 ("dd/mm/aaaa" às vezes), data_resumida
//     ("dd/mm"), hora, tipo }. tipo: 'e' = evento (sessão única), 't' =
//     temporada (várias sessões no mesmo local), 'g' = grupo/programação
//     multi-cidade (sem cidade/data concreta) -> IGNORADO.
//   URLs:
//     - 'e' -> /evento?id=<id>            (página de compra; tem preços)
//     - 't' -> /evento/temporada?id=<id>  (lista botões de sessão /evento?id=)
//   Preço/taxa só existem na página de compra /evento?id=. Para 't' abrimos a
//   temporada e seguimos a 1ª sessão (as sessões da temporada têm o mesmo
//   preço) — uma página de preço por evento, não por sessão.
//   Página de compra: tabelas .setores com colunas Tipo | Preço | Tx Admin;
//     usamos as linhas "Inteira" para a faixa de preço e todas as pagas para a
//     taxa média. Categoria/duração/classificação saem dos <h5>.
//   cidade/UF vêm da listagem (linha2); a página de compra traz cidade sem UF.
//
// Um crawled_event por item da listagem (dedupe pela URL canônica). Sem
// paginação (a listagem é completa): skip-known + teto por execução cobrem o
// backlog run após run.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const HOST = 'https://megabilheteria.com'
const LISTA = `${HOST}/evento/lista-todos-index`
const MAX_DETALHES = 50 // teto de eventos detalhados por execução
const BATCH = 5
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Referer: `${HOST}/`,
}

interface Item {
  id: number | string
  imagem?: string
  nome?: string
  linha1?: string
  linha2?: string
  linha3?: string
  data_resumida?: string
  hora?: string
  tipo?: string
}

/** GET (UTF-8) com 1 retry em 429/503. */
async function get(url: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 503) {
        if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1500)); continue }
        console.error('[megabilheteria] HTTP', res.status, url)
        return null
      }
      if (!res.ok) { console.error('[megabilheteria] HTTP', res.status, url); return null }
      return await res.text()
    } catch (e) {
      if (tentativa === 0) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[megabilheteria] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

/** Decodifica entidades HTML (&ccedil; &aacute; &#039; etc.). */
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&acirc;/g, 'â')
    .replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô').replace(/&atilde;/g, 'ã')
    .replace(/&otilde;/g, 'õ').replace(/&ccedil;/g, 'ç').replace(/&agrave;/g, 'à')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Ccedil;/g, 'Ç').replace(/&Atilde;/g, 'Ã')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim()
}

const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1] ?? null

const precoBR = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

const urlCanonica = (it: Item) =>
  it.tipo === 't' ? `${HOST}/evento/temporada?id=${it.id}` : `${HOST}/evento?id=${it.id}`

function cidadeUf(linha2?: string): { cidade: string | null; uf: string | null } {
  const m = (linha2 ?? '').match(/^(.*),\s*([A-Z]{2})\s*$/)
  return m ? { cidade: m[1].trim(), uf: m[2] } : { cidade: null, uf: null }
}

/** Ano provável para "dd/mm" sem ano: o que deixa a data >= hoje-60d. */
function inferAno(dd: string, mm: string): number {
  const now = new Date()
  const cand = new Date(`${now.getFullYear()}-${mm}-${dd}T00:00:00-03:00`).getTime()
  return cand < now.getTime() - 60 * 86_400_000 ? now.getFullYear() + 1 : now.getFullYear()
}

/** Data da listagem: prefere linha3 (dd/mm/aaaa); senão data_resumida + ano inferido. */
function dataListagem(it: Item): string | null {
  const hora = it.hora && /^\d{2}:\d{2}$/.test(it.hora) && it.hora !== '00:00' ? it.hora : '00:00'
  const l3 = it.linha3?.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (l3) return `${l3[3]}-${l3[2]}-${l3[1]}T${hora}:00-03:00`
  const dr = it.data_resumida?.match(/(\d{2})\/(\d{2})/)
  if (!dr) return null
  return `${inferAno(dr[1], dr[2])}-${dr[2]}-${dr[1]}T${hora}:00-03:00`
}

/** Data da página de compra (h5: "dd/mm/aaaa ... HH:MM h"). */
function dataPagina(h5: string): string | null {
  const dm = h5.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!dm) return null
  const t = h5.match(/(\d{2}):(\d{2})/)
  return `${dm[3]}-${dm[2]}-${dm[1]}T${t ? `${t[1]}:${t[2]}` : '00:00'}:00-03:00`
}

function baseEvent(it: Item, url: string): RawEvent {
  const { cidade, uf } = cidadeUf(it.linha2)
  return {
    url_evento: url,
    nome: it.nome ?? '',
    data_inicio: dataListagem(it),
    data_fim: null,
    organizador_raw: null,
    organizador_url: null,
    local_raw: it.linha1?.trim() || null,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min: null,
    preco_max: null,
    taxa_pct: null,
    gratuito: false,
    online: false,
    categoria: null,
    imagem_url: it.imagem ? `${HOST}${it.imagem}` : null,
    descricao: null,
    raw: { id: String(it.id), tipo: it.tipo },
  }
}

async function fetchEvento(it: Item): Promise<RawEvent | null> {
  const url = urlCanonica(it)

  // Descobre a página de compra (tem os preços).
  let priceUrl = `${HOST}/evento?id=${it.id}`
  if (it.tipo === 't') {
    const tHtml = await get(url)
    const sid = tHtml?.match(/href="\/evento\?id=(\d+)"/)?.[1]
    if (!sid) return baseEvent(it, url) // temporada sem sessões disponíveis
    priceUrl = `${HOST}/evento?id=${sid}`
  }

  const html = await get(priceUrl)
  if (!html) return baseEvent(it, url)

  // Preços por setor: Tipo | Preço | Tx Admin.
  const linhas: { tipo: string; price: number; tax: number }[] = []
  for (
    const m of html.matchAll(
      /<td>\s*([^<]+?)\s*<\/td>\s*<td>\s*R\$\s*([\d.]*\d,\d{2})\s*<\/td>\s*<td>\s*R\$\s*([\d.]*\d,\d{2})\s*<\/td>/g,
    )
  ) {
    linhas.push({ tipo: m[1].trim().replace(/\.+$/, ''), price: precoBR(m[2]), tax: precoBR(m[3]) })
  }
  const pagas = linhas.filter((l) => l.price > 0)
  const inteiras = pagas.filter((l) => /^inteira/i.test(l.tipo)).map((l) => l.price)
  const faces = inteiras.length ? inteiras : pagas.map((l) => l.price)
  const preco_min = faces.length ? Math.min(...faces) : null
  const preco_max = faces.length ? Math.max(...faces) : null
  const taxa_pct = pagas.length ? avgTaxaPct(pagas) : null
  const gratuito = linhas.length > 0 && pagas.length === 0

  // <h5> #0: data/dia/categoria/duração/classificação ; #1: cidade/local/endereço.
  const h5s = [...html.matchAll(/<h5>([\s\S]*?)<\/h5>/g)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
  let categoria: string | null = null, duracao: string | null = null, classificacao: string | null = null
  if (h5s[0]) {
    // h5[0] = "dd/mm/aaaa - <Dia> às HH:MM h - <Categoria> - NN min. - NN anos".
    // Pula data e o trecho de dia/horário pelo HORÁRIO (\d:\d) e nome do dia —
    // não dá pra usar \bàs\b: o "à" acentuado não casa com \b (não é \w).
    const DIA = /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i
    for (const p of h5s[0].split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean)) {
      if (/\d{2}\/\d{2}\/\d{4}/.test(p)) continue // data
      if (/\d{1,2}:\d{2}/.test(p) || DIA.test(p)) continue // "Sábado às 16:30 h"
      if (/\d+\s*min/i.test(p)) { duracao = p; continue }
      if (/\d+\s*anos/i.test(p) || /^livre$/i.test(p)) { classificacao = p; continue }
      if (!categoria) categoria = p
    }
  }
  let venueDet: string | null = null, endereco: string | null = null
  if (h5s[1]) {
    const ps = h5s[1].split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean)
    venueDet = ps[1] ?? null
    endereco = ps.slice(2).join(' - ') || null
  }

  const { cidade, uf } = cidadeUf(it.linha2)
  const data_inicio = (h5s[0] ? dataPagina(h5s[0]) : null) ?? dataListagem(it)

  return {
    url_evento: url,
    nome: it.nome ?? decode(meta(html, 'og:title') ?? ''),
    data_inicio,
    data_fim: null,
    organizador_raw: null,
    organizador_url: null,
    local_raw: it.linha1?.trim() || venueDet,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min,
    preco_max,
    taxa_pct,
    gratuito,
    online: false,
    categoria,
    imagem_url: it.imagem ? `${HOST}${it.imagem}` : (meta(html, 'og:image')),
    descricao: null, // a "sinopse" do site é texto-padrão (jurídico), não por evento
    raw: { id: String(it.id), tipo: it.tipo, endereco, duracao, classificacao, priceUrl },
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'megabilheteria').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%megabilheteria%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[megabilheteria] getKnown falhou', String(e)) }
  return s
}

export const megaBilheteriaScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))

  const txt = await get(LISTA)
  if (!txt) { ctx.notas?.push('Mega Bilheteria: listagem vazia (HTTP?)'); return [] }
  let itens: Item[] = []
  try { itens = JSON.parse(txt) } catch { ctx.notas?.push('Mega Bilheteria: JSON da listagem inválido'); return [] }

  // Só 'e' e 't' (os 'g' são aglutinadores multi-cidade sem cidade/data concreta).
  const elegiveis = itens.filter((it) => it && (it.tipo === 'e' || it.tipo === 't'))

  // Reprocessar CAMINHA por um offset (recoleta os já existentes, em pedaços de
  // `cap`, até o fim → volta a 0). Coleta normal pega só os ainda-novos.
  let alvo: Item[]
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = elegiveis.slice(off, off + cap)
    const novoOff = off + alvo.length
    const fim = novoOff >= elegiveis.length || alvo.length === 0
    if (src) await db.from('crawler_sources').update({ config: { ...cfg, reproc_offset: fim ? 0 : novoOff } }).eq('id', src.id)
    ctx.notas?.push(`Mega Bilheteria: reprocessando ${off}–${novoOff} de ${elegiveis.length}${fim ? ' (fim → reinicia)' : ''}`)
  } else {
    const known = await getKnown(db)
    alvo = elegiveis.filter((it) => !known.has(urlCanonica(it))).slice(0, cap)
  }

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((it) => fetchEvento(it)))
    for (const ev of mapped) if (ev) out.push(ev)
  }

  const ignoradosG = itens.length - elegiveis.length
  ctx.notas?.push(
    `Mega Bilheteria: itens=${itens.length} (e/t=${elegiveis.length}, 'g' ignorados=${ignoradosG}), ` +
    `novos=${alvo.length}, coletados=${out.length}`,
  )
  console.log(`[megabilheteria] itens=${itens.length} elegiveis=${elegiveis.length} alvo=${alvo.length} novos=${out.length}`)
  return out
}
