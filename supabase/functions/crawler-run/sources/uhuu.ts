// Fonte: Uhuu (uhuu.com) — descoberta pelo SITEMAP + API JSON pública.
//   Lista: GET https://uhuu.com/sitemap.xml  -> URLs /evento/<uf>/<cidade>/<slug>-<sku>
//     (lista oficial e completa do catálogo; o id no fim da URL é o <sku>).
//   Detalhe: GET https://api.uhuu.com/apresentacoes/<sku>  -> nome, data, categoria,
//     local/cidade/uf, produtor (cliente_nome_fantasia), imagem, flags, faixa.
//   Preço/Taxa: GET https://api.uhuu.com/apresentacoes/<sku>/agendamentos/setores
//     -> [{ valor, valor_taxa }] (sem auth).
//   Datas da API estão em UTC (ex.: 14:00Z = 11:00 BRT) -> convertidas p/ +00:00.
//
// Coberto por janela (config.offset) sobre a lista do sitemap; como o catálogo
// é pequeno (~100), cada execução varre todo o catálogo (EVENTS_PER_RUN alto).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const SITE = 'https://uhuu.com'
const API = 'https://api.uhuu.com'
const SITEMAP = `${SITE}/sitemap.xml`
const EVENTS_PER_RUN = 300 // catálogo cabe inteiro; janela só protege contra explosão
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }

/** "YYYY-MM-DD HH:MM:SS" (UTC) -> ISO +00:00. */
function dataIso(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00`
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Extrai (sku, url) de cada URL de evento no sitemap. */
async function fetchSitemapEventos(): Promise<{ sku: string; url: string }[]> {
  try {
    const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error('[uhuu] sitemap HTTP', res.status); return [] }
    const xml = await res.text()
    const out: { sku: string; url: string }[] = []
    const seen = new Set<string>()
    for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]*\/evento\/[^<\s]+?)\s*<\/loc>/g)) {
      const url = m[1]
      const sku = url.match(/-(\d+)\/?$/)?.[1]
      if (!sku || seen.has(sku)) continue
      seen.add(sku)
      out.push({ sku, url })
    }
    return out
  } catch (e) { console.error('[uhuu] sitemap falhou', String(e)); return [] }
}

// deno-lint-ignore no-explicit-any
async function fetchApresentacao(sku: string): Promise<any | null> {
  try {
    const res = await fetch(`${API}/apresentacoes/${sku}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** Preço mín/máx + taxa média via API de setores. */
async function fetchSetores(
  sku: string,
): Promise<{ min: number | null; max: number | null; taxa: number | null } | null> {
  try {
    const res = await fetch(`${API}/apresentacoes/${sku}/agendamentos/setores`, {
      headers: HEADERS, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    const setores: any[] = await res.json()
    if (!Array.isArray(setores) || setores.length === 0) return null
    const precos = setores.map((s) => Number(s?.valor)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = setores
      .map((s) => ({ price: Number(s?.valor), tax: Number(s?.valor_taxa) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    return {
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
    }
  } catch { return null }
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

  const lista = await fetchSitemapEventos()
  if (lista.length === 0) { console.error('[uhuu] sitemap sem eventos'); return [] }

  // Janela sobre a lista (cursor). Com ~100 eventos, pega tudo a cada execução.
  const offset = Math.max(0, Number(cfg.offset ?? 0)) % lista.length
  const janela = lista.slice(offset, offset + EVENTS_PER_RUN)
  if (janela.length < EVENTS_PER_RUN && lista.length > EVENTS_PER_RUN) {
    janela.push(...lista.slice(0, EVENTS_PER_RUN - janela.length))
  }
  const novoOffset = (offset + EVENTS_PER_RUN) % lista.length
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[uhuu] sitemap=${lista.length} offset=${offset} janela=${janela.length} prox=${novoOffset}`)

  const out: RawEvent[] = []
  const BATCH = 8
  for (let i = 0; i < janela.length; i += BATCH) {
    const slice = janela.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async ({ sku, url }) => {
      const a = await fetchApresentacao(sku)
      if (!a || !a.evento_nome || a.b_cancelado) return null
      const setores = await fetchSetores(sku)
      const gratuito = !!a.b_gratuito
      const min = gratuito ? 0 : (setores?.min ?? num(a.setor_menor_valor) ?? num(a.ingresso_inicial))
      const max = gratuito ? 0 : (setores?.max ?? num(a.setor_maior_valor) ?? num(a.maior_valor_ingresso))
      const dtIni = a.dt_primeira_apresentacao || a.data
      const dtFim = a.dt_ultima_apresentacao
      return {
        url_evento: a.url_landing_page || a.url_portal || url,
        nome: String(a.evento_nome),
        data_inicio: dataIso(dtIni),
        data_fim: dtFim && dtFim !== dtIni ? dataIso(dtFim) : null,
        organizador_raw: a.cliente_nome_fantasia ?? null,
        organizador_url: null,
        local_raw: a.local_nome ?? null,
        cidade: a.local_cidade ?? null,
        uf: (String(a.local_uf || '').toUpperCase().slice(0, 2)) || null,
        pais: 'Brasil',
        preco_min: min,
        preco_max: max,
        taxa_pct: setores?.taxa ?? null,
        gratuito: gratuito || min === 0,
        online: false,
        categoria: a.categoria_nome ?? null,
        imagem_url: a.imagem_wide || a.imagem_box || a.imagem_mobile || null,
        descricao: null,
        raw: { sku, evento_id: a.evento_id },
      } as RawEvent
    }))
    out.push(...mapped.filter((x): x is RawEvent => x !== null))
  }
  return out
}
