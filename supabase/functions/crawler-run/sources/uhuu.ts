// Fonte: Uhuu (uhuu.com) — busca HTML (SSR) + API de preços.
//   Discovery: GET https://uhuu.com/busca?page=N  (12 cards/página, ~40 páginas)
//     Cada card traz um bloco gtag('select_item', { items:[{ sku, item_name,
//     item_brand, price, event_date, event_hour, local_nome, local_cidade,
//     local_uf }] }) + o href do evento e a imagem (data-src).
//   Preço/Taxa: GET https://api.uhuu.com/apresentacoes/<sku>/agendamentos/setores
//     -> [{ valor, valor_taxa }]  (sem auth; <sku> = id do card)
//
// Paginação por cursor (config.pagina), em janela de páginas por execução;
// cada evento da janela é enriquecido com preço/taxa pela API (JSON leve).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const SITE = 'https://uhuu.com'
const API = 'https://api.uhuu.com'
const PAGES_PER_RUN = 5 // ~60 eventos por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA }

interface CardData {
  sku: string
  url: string
  nome: string
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  data: string | null
  hora: string | null
  precoCard: number | null
  imagem: string | null
}

const MES: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

/** Campo de um objeto JS literal: key: 'valor' (com escape de aspas). */
function campo(obj: string, key: string): string | null {
  const m = obj.match(new RegExp(`${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))
  return m ? m[1].replace(/\\'/g, "'").trim() : null
}

/** "DD/MM/YYYY" + "HH:MM" -> ISO -03:00. */
function dataIso(data: string | null, hora: string | null): string | null {
  if (!data) return null
  const m = data.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const h = hora && /^\d{1,2}:\d{2}/.test(hora) ? hora.padStart(5, '0').slice(0, 5) : '00:00'
  return `${m[3]}-${m[2]}-${m[1]}T${h}:00-03:00`
}

function precoBR(s: string | null): number | null {
  if (!s) return null
  const n = Number(s.replace(/[^\d,]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Quebra a página em cards e extrai os dados do bloco select_item. */
function parseCards(html: string): CardData[] {
  const out: CardData[] = []
  const re = /<div class="item card-evento"[\s\S]*?(?=<div class="item card-evento"|<ul class="pagination"|<div class="rodape)/g
  for (const chunk of html.match(re) ?? []) {
    const obj = chunk.match(/items:\s*\[\{([\s\S]*?)\}\]/)?.[1]
    if (!obj) continue
    const sku = campo(obj, 'sku')
    const nome = campo(obj, 'item_name')
    if (!sku || !nome) continue
    const url = chunk.match(/href="([^"]+)"/)?.[1] ?? `${SITE}/evento/${sku}`
    const img = chunk.match(/data-src="([^"]+)"/)?.[1] ?? null
    out.push({
      sku,
      url,
      nome,
      organizador: campo(obj, 'item_brand'),
      local: campo(obj, 'local_nome'),
      cidade: campo(obj, 'local_cidade'),
      uf: (campo(obj, 'local_uf') || '').toUpperCase() || null,
      data: campo(obj, 'event_date'),
      hora: campo(obj, 'event_hour'),
      precoCard: precoBR(campo(obj, 'price')),
      imagem: img,
    })
  }
  return out
}

/** Preço mín/máx + taxa média via API pública de setores. */
async function fetchPreco(
  sku: string,
): Promise<{ min: number | null; max: number | null; taxa: number | null } | null> {
  try {
    const res = await fetch(`${API}/apresentacoes/${sku}/agendamentos/setores`, {
      headers: { ...HEADERS, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    const setores: any[] = await res.json()
    if (!Array.isArray(setores)) return null
    const precos = setores.map((s) => Number(s?.valor)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = setores
      .map((s) => ({ price: Number(s?.valor), tax: Number(s?.valor_taxa) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    return {
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
    }
  } catch {
    return null
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'uhuu').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const uhuuScraper: Scraper = async () => {
  const db = adminClient()
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const pagInicial = Math.max(1, Number(cfg.pagina ?? 1))

  // Varre uma janela de páginas; para se uma página vier vazia (fim da lista).
  const cards: CardData[] = []
  let vazia = false
  let p = pagInicial
  for (; p < pagInicial + PAGES_PER_RUN; p++) {
    let html = ''
    try {
      const res = await fetch(`${SITE}/busca?page=${p}`, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
      if (!res.ok) { console.error('[uhuu] busca HTTP', res.status, 'page', p); break }
      html = await res.text()
    } catch (e) { console.error('[uhuu] busca falhou page', p, String(e)); break }
    const pageCards = parseCards(html)
    if (pageCards.length === 0) { vazia = true; break }
    cards.push(...pageCards)
  }

  // Avança o cursor; volta ao início quando chega ao fim.
  const novaPagina = vazia ? 1 : p
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, pagina: novaPagina } }).eq('id', src.id)
  console.log(`[uhuu] paginas=[${pagInicial},${p}) cards=${cards.length} proxima=${novaPagina}`)

  // Enriquece preço/taxa por evento (API leve), em lotes.
  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < cards.length; i += BATCH) {
    const slice = cards.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (c) => {
      const p = await fetchPreco(c.sku)
      const min = p?.min ?? c.precoCard ?? null
      return {
        url_evento: c.url,
        nome: c.nome,
        data_inicio: dataIso(c.data, c.hora),
        data_fim: null,
        organizador_raw: c.organizador,
        organizador_url: null,
        local_raw: c.local,
        cidade: c.cidade,
        uf: c.uf && c.uf.length === 2 ? c.uf : null,
        pais: 'Brasil',
        preco_min: min,
        preco_max: p?.max ?? null,
        taxa_pct: p?.taxa ?? null,
        gratuito: min === 0,
        online: false,
        categoria: null,
        imagem_url: c.imagem,
        descricao: null,
        raw: { sku: c.sku },
      } as RawEvent
    }))
    out.push(...mapped)
  }
  return out
}
