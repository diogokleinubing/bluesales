// Fonte: BaladaApp — API JSON de anúncios + HTML do evento (Instagram da produção).
//   Listagem: GET https://api.baladapp.com.br/api/v3/anuncios -> { anuncios[] }
//     Retorna o catálogo ativo (~150 eventos; sem paginação). O skip-forever
//     cobre os já coletados; novos entram quando o BaladaApp publica.
//     anuncio: { id, uri, comprar_url, data_inicio, data_fim,
//       evento: { titulo, foto_url, ocultar_local,
//         local: { nome, ficticio, nome_sem_cidade, cidade_estado "Cidade/UF" } } }
//   Detalhe (HTML, não-API): https://baladapp.com.br/pt-BR/eventos/<uri>/<id>
//     -> "Contato da produção": Instagram (vira organizador). Preços não expostos.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const LISTA = 'https://api.baladapp.com.br/api/v3/anuncios'
const SITE = 'https://baladapp.com.br'
const MAX_DET = 40 // teto de detalhes (Instagram) por execução
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

interface Anuncio {
  id: number
  uri: string
  data_inicio?: string | null
  data_fim?: string | null
  evento?: {
    titulo?: string
    foto_url?: string | null
    ocultar_local?: boolean
    local?: {
      nome?: string
      ficticio?: boolean
      nome_sem_cidade?: string
      cidade_estado?: string
    } | null
  }
}

function parseCidadeUf(cidadeEstado?: string): { cidade: string | null; uf: string | null } {
  if (!cidadeEstado) return { cidade: null, uf: null }
  const parts = cidadeEstado.split('/').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const uf = parts[parts.length - 1].toUpperCase()
    const cidade = parts.slice(0, -1).join('/')
    return { cidade: cidade || null, uf: uf.length === 2 ? uf : null }
  }
  return { cidade: cidadeEstado.trim() || null, uf: null }
}

const eventoUrl = (a: Anuncio) => `${SITE}/pt-BR/eventos/${a.uri}/${a.id}`

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%baladapp.com.br%')
      .limit(100000)
    for (const r of data ?? []) set.add(String(r.url_evento))
  } catch (e) {
    console.error('[baladapp] getKnown falhou', String(e))
  }
  return set
}

/** Instagram da produção a partir do HTML do detalhe (bloco "Contato da produção"). */
async function fetchInstagram(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(/instagram\.com\/([A-Za-z0-9_.]+)/i)
    return m ? m[1].replace(/\.$/, '') : null
  } catch {
    return null
  }
}

/** Preços do ingresso via API da vitrine (valor_venda; taxa é à parte). */
async function fetchPrecos(
  anuncioId: number,
): Promise<{ min: number | null; max: number | null; taxaPct: number | null }> {
  try {
    const res = await fetch(
      `https://vitrine.baladapp.com.br/api/v1/anuncios/${anuncioId}/vitrine?modo=evento`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
    )
    if (!res.ok) return { min: null, max: null, taxaPct: null }
    const json = await res.json()
    const opcoes = (json?.anuncio_opcoes ?? []) as Array<{
      valor_venda?: string; valor?: string; taxa?: number; tipo?: string
    }>
    const vals: number[] = []
    const taxas: number[] = []
    for (const o of opcoes) {
      if (o?.tipo === 'agrupador') continue // combos/mesas (ex.: bistrô) não são ingresso unitário
      const v = Number(o?.valor_venda ?? o?.valor)
      if (!Number.isFinite(v) || v <= 0) continue
      vals.push(v)
      const t = Number(o?.taxa ?? 0)
      if (Number.isFinite(t) && t > 0) taxas.push((t / v) * 100)
    }
    if (vals.length) {
      const taxaPct = taxas.length ? taxas.reduce((a, b) => a + b, 0) / taxas.length : null
      return { min: Math.min(...vals), max: Math.max(...vals), taxaPct }
    }

    // Fallback: alguns anúncios expõem os preços só em tipo_opcoes (faixas).
    const tipos = (json?.tipo_opcoes ?? []) as Array<{
      menor_valor_venda?: string; maior_valor_venda?: string; menor_valor?: string; maior_valor?: string
    }>
    const mins: number[] = []
    const maxs: number[] = []
    for (const t of tipos) {
      const lo = Number(t?.menor_valor_venda ?? t?.menor_valor)
      const hi = Number(t?.maior_valor_venda ?? t?.maior_valor)
      if (Number.isFinite(lo) && lo > 0) mins.push(lo)
      if (Number.isFinite(hi) && hi > 0) maxs.push(hi)
    }
    const todos = [...mins, ...maxs]
    if (todos.length) return { min: Math.min(...todos), max: Math.max(...todos), taxaPct: null }

    return { min: null, max: null, taxaPct: null }
  } catch {
    return { min: null, max: null, taxaPct: null }
  }
}

async function getCfg(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('config').eq('slug', 'baladapp').maybeSingle()
  return (data?.config ?? {}) as Record<string, unknown>
}
async function saveCfg(db: ReturnType<typeof adminClient>, patch: Record<string, unknown>) {
  const cur = await getCfg(db)
  await db.from('crawler_sources').update({ config: { ...cur, ...patch } }).eq('slug', 'baladapp')
}

export const baladAppScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const cfg = await getCfg(db)
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DET))
  const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)

  let anuncios: Anuncio[] = []
  try {
    const res = await fetch(LISTA, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      console.error('[baladapp] lista HTTP', res.status)
      return []
    }
    const json = await res.json()
    anuncios = (json?.anuncios ?? []) as Anuncio[]
  } catch (e) {
    console.error('[baladapp] lista falhou', String(e))
    return []
  }

  // Novos (skip-forever): id + uri + título e ainda não coletados.
  const novos = anuncios.filter((a) => a?.id && a?.uri && a.evento?.titulo && !known.has(eventoUrl(a)))

  // Reprocessar CAMINHA por um offset (recoleta os já existentes, em pedaços de
  // `cap`, até o fim → volta a 0) e emite só o pedaço (preços frescos). Coleta
  // normal pega todos os novos e detalha só os primeiros `cap`.
  let alvo: Anuncio[]
  let emitir: Anuncio[]
  if (ctx.reprocessar) {
    const off = Math.max(0, Number(cfg.reproc_offset ?? 0))
    alvo = novos.slice(off, off + cap)
    const novoOff = off + alvo.length
    const fim = novoOff >= novos.length || alvo.length === 0
    await saveCfg(db, { reproc_offset: fim ? 0 : novoOff })
    ctx.notas?.push(`BaladaApp: reprocessando ${off}–${novoOff} de ${novos.length}${fim ? ' (fim → reinicia)' : ''}`)
    emitir = alvo
  } else {
    alvo = novos.slice(0, cap)
    emitir = novos
  }
  console.log(`[baladapp] anuncios=${anuncios.length} novos=${novos.length} alvo=${alvo.length} reproc=${ctx.reprocessar}`)

  // Instagram (HTML) + preços (API vitrine) só para o `alvo`.
  const instaByUrl = new Map<string, string | null>()
  const precoByUrl = new Map<string, { min: number | null; max: number | null; taxaPct: number | null }>()
  const aDetalhar = alvo
  const BATCH = 6
  for (let i = 0; i < aDetalhar.length; i += BATCH) {
    const slice = aDetalhar.slice(i, i + BATCH)
    await Promise.all(slice.map(async (a) => {
      const url = eventoUrl(a)
      const [insta, precos] = await Promise.all([fetchInstagram(url), fetchPrecos(a.id)])
      instaByUrl.set(url, insta)
      precoByUrl.set(url, precos)
    }))
  }

  const out: RawEvent[] = []
  for (const a of emitir) {
    const url = eventoUrl(a)
    const ev = a.evento ?? {}
    const loc = ev.local ?? {}
    const { cidade, uf } = parseCidadeUf(loc?.cidade_estado)
    const ocultarLocal = ev.ocultar_local || loc?.ficticio
    const ig = instaByUrl.get(url) ?? null
    const precos = precoByUrl.get(url) ?? { min: null, max: null, taxaPct: null }
    out.push({
      url_evento: url,
      nome: ev.titulo!,
      data_inicio: a.data_inicio ?? null,
      data_fim: a.data_fim ?? null,
      organizador_raw: ig,
      organizador_url: ig ? `https://instagram.com/${ig}` : null,
      local_raw: ocultarLocal ? null : (loc?.nome_sem_cidade || loc?.nome || null),
      cidade,
      uf,
      pais: 'Brasil',
      preco_min: precos.min,
      preco_max: precos.max,
      taxa_pct: precos.taxaPct,
      gratuito: false,
      online: false,
      categoria: null,
      imagem_url: ev.foto_url ?? null,
      descricao: null,
      raw: { id: a.id, uri: a.uri },
    } as RawEvent)
  }
  return out
}
