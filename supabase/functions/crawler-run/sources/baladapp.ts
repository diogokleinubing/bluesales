// Fonte: BaladaApp — API JSON de anúncios + HTML do evento (Instagram da produção).
//   Listagem: GET https://api.baladapp.com.br/api/v3/anuncios -> { anuncios[] }
//     Retorna ~150 mais recentes (sem paginação); o skip-forever cobre os novos.
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

export const baladAppScraper: Scraper = async (ctx) => {
  const db = adminClient()
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
  console.log(`[baladapp] anuncios=${anuncios.length} novos=${novos.length}`)

  // Instagram só para os primeiros MAX_DET (CPU/educação com a fonte).
  const instaByUrl = new Map<string, string | null>()
  const aDetalhar = novos.slice(0, MAX_DET)
  const BATCH = 6
  for (let i = 0; i < aDetalhar.length; i += BATCH) {
    const slice = aDetalhar.slice(i, i + BATCH)
    await Promise.all(slice.map(async (a) => {
      instaByUrl.set(eventoUrl(a), await fetchInstagram(eventoUrl(a)))
    }))
  }

  const out: RawEvent[] = []
  for (const a of novos) {
    const url = eventoUrl(a)
    const ev = a.evento ?? {}
    const loc = ev.local ?? {}
    const { cidade, uf } = parseCidadeUf(loc?.cidade_estado)
    const ocultarLocal = ev.ocultar_local || loc?.ficticio
    const ig = instaByUrl.get(url) ?? null
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
      preco_min: null,
      preco_max: null,
      taxa_pct: null,
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
