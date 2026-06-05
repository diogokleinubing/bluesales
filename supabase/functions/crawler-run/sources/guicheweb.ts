// Fonte: Guichê Web — APIs JSON (POST form-data).
//   Listagem: POST /webservices/api/api.php (a=carregar_eventos, offset=N, 20/pág)
//     -> item_eventos[] { id_evento, nome, cidade "CIDADE/UF", data, local, url_amigavel, img }
//   Detalhe:  POST /webservices/api/services/ingressos.php (a=ingressos_page2, id_evento)
//     -> info_evento { taxaconveniencia, tipoconveniencia(P=%), nome_produtor, data_inicio, hora_inicio, local }
//   Preços:   POST .../ingressos.php (a=setores, id_evento) -> item[].ings[].valor
// Paginação por offset (config); pula os já coletados.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const API = 'https://www.guicheweb.com.br/webservices/api/api.php'
const ING = 'https://www.guicheweb.com.br/webservices/api/services/ingressos.php'
const CDN_IMG = 'https://cdn.guicheweb.com.br/gw-bucket/imagenseventos/'
const POR_PAGINA = 20
const MAX_PAGINAS = 5
const MAX_NOVOS = 60
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const POST_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: 'https://www.guicheweb.com.br',
  Referer: 'https://www.guicheweb.com.br/',
}

// deno-lint-ignore no-explicit-any
async function post(url: string, fields: Record<string, string>): Promise<any | null> {
  try {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    const res = await fetch(url, { method: 'POST', body: fd, headers: POST_HEADERS, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

interface ListaItem {
  id_evento: string
  nome: string
  cidade?: string
  data?: string
  local?: string
  url_amigavel: string
  img?: string
}

function splitCidadeUf(s?: string): { cidade: string | null; uf: string | null } {
  if (!s) return { cidade: null, uf: null }
  const m = s.split('/')
  if (m.length >= 2) return { cidade: m[0].trim(), uf: m[1].trim().toUpperCase() }
  return { cidade: s.trim(), uf: null }
}

function isoData(ymd?: string, hora?: string): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const h = hora && /^\d{1,2}:\d{2}/.test(hora) ? hora.slice(0, 5) : '00:00'
  return `${ymd}T${h.padStart(5, '0')}:00-03:00`
}

async function fetchDetalhe(id: string): Promise<{
  taxa: number | null; organizador: string | null; data: string | null; local: string | null
  min: number | null; max: number | null; gratuito: boolean
}> {
  const [info, setores] = await Promise.all([
    post(ING, { a: 'ingressos_page2', id_evento: id, id_comissario: '' }),
    post(ING, { a: 'setores', id_evento: id, id_comissario: '' }),
  ])

  const ev = info?.info_evento ?? {}
  const taxa = ev.tipoconveniencia === 'P' && ev.taxaconveniencia != null
    ? Number(ev.taxaconveniencia)
    : null

  const precos: number[] = []
  for (const setor of setores?.item ?? []) {
    for (const ing of setor.ings ?? []) {
      const v = Number(ing.valor)
      if (Number.isFinite(v)) precos.push(v)
    }
  }
  const pos = precos.filter((p) => p > 0)

  return {
    taxa: Number.isFinite(taxa as number) ? (taxa as number) : null,
    organizador: ev.nome_produtor ?? null,
    data: isoData(ev.data_inicio, ev.hora_inicio),
    local: ev.local ?? null,
    min: pos.length ? Math.min(...pos) : (precos.length ? 0 : null),
    max: pos.length ? Math.max(...pos) : (precos.length ? 0 : null),
    gratuito: precos.length > 0 && pos.length === 0,
  }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await db.from('crawled_events').select('url_evento').ilike('url_evento', '%guicheweb.com.br%').limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) { console.error('[guiche] getKnown falhou', String(e)) }
  return set
}

async function getSource() {
  const db = adminClient()
  const { data } = await db.from('crawler_sources').select('id, config').eq('slug', 'guicheweb').maybeSingle()
  if (!data) return null
  return { id: data.id, cfg: (data.config ?? {}) as Record<string, unknown> }
}

export const guichewebScraper: Scraper = async (ctx) => {
  try {
    const db = adminClient()
    const src = await getSource()
    const cfg = src?.cfg ?? {}
    const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)

    // Fase 1: descobre eventos novos pela listagem (offset salvo na config).
    let offset = Number(cfg.offset ?? 0)
    const candidatos: ListaItem[] = []
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const resp = await post(API, { a: 'carregar_eventos', offset: String(offset) })
      const items: ListaItem[] = resp?.item ?? resp?.item_eventos ?? []
      if (!items.length) { offset = 0; break } // fim -> recomeça
      for (const it of items) {
        if (!it.url_amigavel || !it.id_evento) continue
        if (known.has(it.url_amigavel)) continue
        candidatos.push(it)
        known.add(it.url_amigavel)
      }
      offset += POR_PAGINA
      if (candidatos.length >= MAX_NOVOS) break
    }

    if (src) await db.from('crawler_sources').update({ config: { ...cfg, offset } }).eq('id', src.id)
    const aProcessar = candidatos.slice(0, MAX_NOVOS)
    console.log(`[guiche] offset->${offset} candidatos=${candidatos.length} processando=${aProcessar.length}`)

    // Fase 2: detalhe (taxa/organizador/data/preço) em paralelo.
    const out: RawEvent[] = []
    const BATCH = 6
    for (let i = 0; i < aProcessar.length; i += BATCH) {
      const slice = aProcessar.slice(i, i + BATCH)
      const mapped = await Promise.all(slice.map(async (it) => {
        const det = await fetchDetalhe(it.id_evento)
        const { cidade, uf } = splitCidadeUf(it.cidade)
        const img = it.img
          ? (it.img.startsWith('http') ? it.img : `${CDN_IMG}${it.img}`)
          : null
        return {
          url_evento: it.url_amigavel,
          nome: it.nome,
          data_inicio: det.data,
          data_fim: null,
          organizador_raw: det.organizador,
          organizador_url: null,
          local_raw: det.local ?? it.local ?? null,
          cidade,
          uf,
          pais: 'Brasil',
          preco_min: det.min,
          preco_max: det.max,
          taxa_pct: det.taxa,
          gratuito: det.gratuito,
          online: false,
          categoria: null,
          imagem_url: img,
          descricao: null,
          raw: { id: it.id_evento },
        } as RawEvent
      }))
      out.push(...mapped)
    }
    return out
  } catch (e) {
    console.error('[guiche] ERRO', String(e))
    return []
  }
}
