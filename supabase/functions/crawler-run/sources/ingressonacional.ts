// Fonte: Ingresso Nacional — APIs JSON (exigem Referer + X-Requested-With).
//   Lista:   GET  /api/paginas/eventos.php?v316 -> { sucesso: { eventos[] } }
//     A lista mistura "casas" (recorrentes, ids baixos, sem detalhe) e eventos
//     datados (ids altos, com detalhe). Campos: IDEvento, Nome, Cidade, Estado,
//     urlEvento, UrlCasa, ImagemEvento.
//   Detalhe: POST /api/paginas/evento.php  body {"evento":"<IDEvento>"}
//     -> sucesso.evento[0] { EventoData, EventoInicioShow, DataFinal, EventoLocal,
//        CidadeNome, CidadeUf } e sucesso.ingressos[][] { Valor, Taxa }.
//   Skip-forever por url_evento; detalhe só p/ os mais recentes (teto por run).

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'
import { avgTaxaPct } from '../../_shared/classify.ts'

const SITE = 'https://www.ingressonacional.com.br'
const LISTA = `${SITE}/api/paginas/eventos.php?v316`
const DETALHE = `${SITE}/api/paginas/evento.php`
const CASA = `${SITE}/api/paginas/casa.php`
const MAX_DET = 120 // janela de enriquecimento (preço/data) por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: `${SITE}/`,
  Origin: SITE,
}

interface ListaEvento {
  IDEvento: string
  Nome?: string
  SubNome?: string | null
  Cidade?: string | null
  Estado?: string | null
  ImagemEvento?: string | null
  urlEvento?: string | null
  UrlCasa?: string | null
  Cancelado?: string | null
}

interface Detalhe {
  dataInicio: string | null
  dataFim: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  min: number | null
  max: number | null
  taxa: number | null
  organizador: string | null
}

const eventoUrl = (e: ListaEvento) => `${SITE}/${e.urlEvento || e.UrlCasa || e.IDEvento}`

function dataIso(data?: string | null, hora?: string | null): string | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const h = hora && /^\d{1,2}:\d{2}/.test(hora) ? hora.slice(0, 5) : '00:00'
  return `${data}T${h}:00-03:00`
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'ingressonacional').maybeSingle()
  if (!data) return null
  return { id: data.id as string, cfg: (data.config ?? {}) as Record<string, unknown> }
}

// deno-lint-ignore no-explicit-any
async function fetchDetalhe(id: string): Promise<Detalhe | null> {
  try {
    const res = await fetch(DETALHE, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: id }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    let json: any
    try { json = await res.json() } catch { return null }
    const ev = json?.sucesso?.evento?.[0]
    if (!ev) return null
    // deno-lint-ignore no-explicit-any
    const ings: any[] = (json?.sucesso?.ingressos ?? []).flat()
    const precos = ings.map((i) => Number(i?.Valor)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = ings
      .map((i) => ({ price: Number(i?.Valor), tax: Number(i?.Taxa) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    return {
      dataInicio: dataIso(ev.EventoData, ev.EventoInicioShow),
      dataFim: dataIso(ev.DataFinal),
      local: ev.EventoLocal || null,
      cidade: ev.CidadeNome || null,
      uf: ev.CidadeUf || null,
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
      organizador: null,
    }
  } catch {
    return null
  }
}

// Fallback para "casas" (recorrentes): evento.php falha, mas casa.php traz
// endereço, cidade e os ingressos (com datas das sessões) -> preço/taxa/data.
async function fetchCasa(urlCasa: string): Promise<Detalhe | null> {
  try {
    const res = await fetch(CASA, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeCasa: urlCasa }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    // deno-lint-ignore no-explicit-any
    let json: any
    try { json = await res.json() } catch { return null }
    const casa = json?.sucesso?.casa?.[0]
    if (!casa) return null
    // deno-lint-ignore no-explicit-any
    const ings: any[] = (json?.sucesso?.ingressos ?? []).flat()
    const precos = ings.map((i) => Number(i?.Valor)).filter((v) => Number.isFinite(v) && v > 0)
    const taxaItems = ings
      .map((i) => ({ price: Number(i?.Valor), tax: Number(i?.Taxa) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
    // Próxima sessão: menor DataOrdem ("2026-06-06 22:00:00.000").
    const datas = ings
      .map((i) => String(i?.DataOrdem ?? ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
      .sort()
    const dataInicio = datas.length ? `${datas[0].slice(0, 10)}T${datas[0].slice(11, 16) || '00:00'}:00-03:00` : null
    return {
      dataInicio,
      dataFim: null,
      local: casa.Endereco || casa.Nome || null,
      cidade: casa.Cidade || null,
      uf: casa.Estado || null,
      min: precos.length ? Math.min(...precos) : null,
      max: precos.length ? Math.max(...precos) : null,
      taxa: avgTaxaPct(taxaItems),
      organizador: casa.Nome || null,
    }
  } catch {
    return null
  }
}

/** Enriquece: tenta evento datado; se falhar (casa), usa casa.php. */
async function enrich(e: ListaEvento): Promise<Detalhe | null> {
  const det = await fetchDetalhe(e.IDEvento)
  if (det) return det
  if (e.UrlCasa) return await fetchCasa(e.UrlCasa)
  return null
}

export const ingressoNacionalScraper: Scraper = async () => {
  const db = adminClient()

  let eventos: ListaEvento[] = []
  try {
    const res = await fetch(LISTA, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    if (!res.ok) {
      console.error('[innacional] lista HTTP', res.status)
      return []
    }
    const json = await res.json()
    eventos = (json?.sucesso?.eventos ?? []) as ListaEvento[]
  } catch (e) {
    console.error('[innacional] lista falhou', String(e))
    return []
  }

  // Lista fixa (~242): cobre por janela deslizante (cursor em config.offset),
  // enriquecendo TODOS com preço ao longo de algumas execuções e mantendo
  // atualizado — em vez de salvar a maioria sem preço (skip-forever).
  const ativos = eventos
    .filter((e) => e?.IDEvento && e?.Nome && e.Cancelado !== 'S')
    .sort((a, b) => Number(b.IDEvento) - Number(a.IDEvento))
  if (ativos.length === 0) return []

  // Cursor que avança a cada execução (independe de reprocessar), p/ o Lote
  // percorrer toda a lista e voltar atualizando os preços.
  const src = await getSource(db)
  const cfg = src?.cfg ?? {}
  const offset = Number(cfg.offset ?? 0) % ativos.length
  const janela = ativos.slice(offset, offset + MAX_DET)
  const novoOffset = offset + MAX_DET >= ativos.length ? 0 : offset + MAX_DET
  if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset: novoOffset } }).eq('id', src.id)
  console.log(`[innacional] lista=${ativos.length} janela=[${offset},${offset + janela.length}) offset ${offset}->${novoOffset}`)

  // Enriquece e mapeia a janela (detalhe datado ou casa).
  const out: RawEvent[] = []
  const BATCH = 6
  for (let i = 0; i < janela.length; i += BATCH) {
    const slice = janela.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map(async (e) => {
      const det = await enrich(e)
      const nome = [e.Nome, e.SubNome].filter(Boolean).join(' — ')
      const uf = (det?.uf || e.Estado || '').toUpperCase()
      return {
        url_evento: eventoUrl(e),
        nome,
        data_inicio: det?.dataInicio ?? null,
        data_fim: det?.dataFim ?? null,
        organizador_raw: det?.organizador ?? null,
        organizador_url: null,
        local_raw: det?.local ?? null,
        cidade: det?.cidade || e.Cidade || null,
        uf: uf.length === 2 ? uf : null,
        pais: 'Brasil',
        preco_min: det?.min ?? null,
        preco_max: det?.max ?? null,
        taxa_pct: det?.taxa ?? null,
        gratuito: det?.min === 0,
        online: false,
        categoria: null,
        imagem_url: null,
        descricao: null,
        raw: { id: e.IDEvento, uri: e.urlEvento },
      } as RawEvent
    }))
    out.push(...mapped)
  }
  return out
}
