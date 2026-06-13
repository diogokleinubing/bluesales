// Fonte: Sampa Ingressos (sampaingressos.com.br) — teatro/stand-up/shows em SP.
//   Descoberta + base (POST): /espetaculos/<categoria>&<pagina>?idPartner=
//     JSON TRIPLO-encodado: body.retorno -> .espetaculo -> .espetaculos[].
//     Categorias: adulto (teatro), standUp, infantil, shows. Fim = página vazia.
//     Já traz preço cheio, gênero, local, endereço, município, bairro, duração,
//     classificação, temporada, lotação, sinopse, imagem e a URL do evento.
//   Enriquecimento (GET): /processoDeCompra/data?idEspetaculo=<id>
//     Tem <input id='sessoes' value='[{mes,sessoes:[{data,horaSessao,
//     sessaoAtiva,msgValorIngresso,taxaConveniencia}]}]'> com as SESSÕES reais
//     futuras. Daí saem data_inicio (próxima sessão + hora), data_fim (última)
//     e taxa_pct (taxaConveniencia / valor). A listagem traz só estreia/fim e
//     não tem taxa — por isso abrimos a página de sessões por evento.
//
// Incremental: descobre todos pela listagem, pula os já coletados (skip-known)
// e enriquece um teto por execução; o backlog é coberto run após run.
// ⚠️ Cloudflare pode devolver 403 esporádico — resolve com retry/backoff.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://www.sampaingressos.com.br'
const CATEGORIAS = ['adulto', 'standUp', 'infantil', 'shows']
const MAX_PAGINAS = 20 // trava de segurança por categoria
const MAX_DETALHES = 60 // teto de páginas de sessão por execução
const BATCH = 6
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/html, */*',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: HOST,
  Referer: `${HOST}/`,
}

interface Espetaculo {
  idEspetaculo?: number
  nome?: string
  sinopse?: string
  genero?: string
  local?: string
  endereco?: string
  municipio?: string
  bairro?: string
  latitude?: string
  longitude?: string
  duracao?: string
  recomendacaoEtaria?: string
  horario?: string
  temporada?: string
  dataEstreia?: string
  dataFinalizacao?: string
  precoMinimoInteira?: number
  precoMaximoInteira?: number
  valorSampaIngressos?: string
  desconto?: number
  lotacao?: number | null
  imagem?: string
  urlPaginaSampaIngressos?: string
  ingressosEsgotados?: number
  naoDivulgar?: number
  idLocal?: number
}

/** GET/POST com retry em 403/429/503 (Cloudflare). Retorna texto cru. */
async function fetchTexto(url: string, method: 'GET' | 'POST'): Promise<string | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, { method, headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        if (tentativa < 2) { await new Promise((r) => setTimeout(r, 1200 * (tentativa + 1))); continue }
        console.error('[sampaingressos] bloqueio HTTP', res.status, url)
        return null
      }
      if (!res.ok) { console.error('[sampaingressos] HTTP', res.status, url); return null }
      return await res.text()
    } catch (e) {
      if (tentativa < 2) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[sampaingressos] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

/** Página da listagem (POST): desfaz o JSON triplo-encodado. */
async function fetchPagina(categoria: string, pagina: number): Promise<Espetaculo[] | null> {
  const body = await fetchTexto(`${HOST}/espetaculos/${categoria}&${pagina}?idPartner=`, 'POST')
  if (body === null) return null
  try {
    const a = JSON.parse(body) as { retorno?: string }
    if (!a.retorno) return []
    const b = JSON.parse(a.retorno) as { espetaculo?: string }
    if (!b.espetaculo) return []
    const c = JSON.parse(b.espetaculo) as { espetaculos?: Espetaculo[] }
    return c.espetaculos ?? []
  } catch (e) {
    console.error('[sampaingressos] parse listagem falhou', String(e))
    return null
  }
}

const brMoney = (s?: string) => {
  const m = String(s ?? '').match(/([\d.]*\d,\d{2})/)
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : NaN
}

/** Preço Sampa (líquido) do texto da listagem: "R$ 64,90" | "A partir de R$ 75,00". */
function precoSampaListagem(txt?: string): { min: number | null; max: number | null } {
  const nums = [...String(txt ?? '').matchAll(/([\d.]*\d,\d{2})/g)]
    .map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!nums.length) return { min: null, max: null }
  const min = Math.min(...nums)
  // "A partir de" indica só o piso (teto desconhecido).
  const max = nums.length > 1 ? Math.max(...nums) : (/a partir de/i.test(String(txt)) ? null : min)
  return { min, max }
}

/** "20260620" + "2100" -> "2026-06-20T21:00:00-03:00". */
function isoSessao(data: number | string, hora?: string): string | null {
  const m = String(data).match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  const h = String(hora ?? '').padStart(4, '0')
  return `${m[1]}-${m[2]}-${m[3]}T${h.slice(0, 2)}:${h.slice(2, 4)}:00-03:00`
}

interface Sessao { data: number; horaSessao?: string; sessaoAtiva?: number; msgValorIngresso?: string; taxaConveniencia?: string }

/** Sessões reais (GET): próxima/última data + taxa de conveniência. */
async function fetchSessoes(
  id: number,
): Promise<
  { data_inicio: string | null; data_fim: string | null; taxa_pct: number | null; preco_min: number | null; preco_max: number | null } | null
> {
  const html = await fetchTexto(`${HOST}/processoDeCompra/data?idEspetaculo=${id}`, 'GET')
  if (!html) return null
  const m = html.match(/id=['"]sessoes['"]\s+value='([^']*)'/)
  if (!m) return null
  let meses: { sessoes?: Sessao[] }[]
  try { meses = JSON.parse(m[1]) } catch { return null }

  const seen = new Set<string>()
  const ativas: Sessao[] = []
  for (const mes of meses) {
    for (const s of mes.sessoes ?? []) {
      if (s.sessaoAtiva === 0) continue
      const k = `${s.data}_${s.horaSessao}`
      if (seen.has(k)) continue
      seen.add(k)
      ativas.push(s)
    }
  }
  if (!ativas.length) return null
  ativas.sort((a, b) => (a.data - b.data) || String(a.horaSessao).localeCompare(String(b.horaSessao)))
  const primeira = ativas[0], ultima = ativas[ativas.length - 1]
  const preco = brMoney(primeira.msgValorIngresso), taxa = brMoney(primeira.taxaConveniencia)
  const taxa_pct = Number.isFinite(preco) && preco > 0 && Number.isFinite(taxa)
    ? Math.round((taxa / preco) * 10000) / 100
    : null
  // Preço Sampa praticado (líquido), faixa entre as sessões.
  const precos = ativas.map((s) => brMoney(s.msgValorIngresso)).filter((n) => Number.isFinite(n) && n > 0)
  return {
    data_inicio: isoSessao(primeira.data, primeira.horaSessao),
    data_fim: isoSessao(ultima.data, ultima.horaSessao),
    taxa_pct,
    preco_min: precos.length ? Math.min(...precos) : null,
    preco_max: precos.length ? Math.max(...precos) : null,
  }
}

/** "20241102" -> "2024-11-02T00:00:00-03:00" (fallback quando não há sessões). */
function isoData(s?: string): string | null {
  const m = String(s ?? '').match(/^(\d{4})(\d{2})(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T00:00:00-03:00` : null
}

const urlDe = (e: Espetaculo) => HOST + (e.urlPaginaSampaIngressos ?? `/?id=${e.idEspetaculo}`)

function mapEvento(
  e: Espetaculo,
  categoria: string,
  sess: { data_inicio: string | null; data_fim: string | null; taxa_pct: number | null; preco_min: number | null; preco_max: number | null } | null,
): RawEvent {
  // Preço = Sampa praticado (líquido): das sessões; senão do texto da listagem.
  const sampaList = precoSampaListagem(e.valorSampaIngressos)
  const preco_min = sess?.preco_min ?? sampaList.min
  const preco_max = sess?.preco_max ?? sampaList.max
  // Cheio/bilheteria (referência) vai para o raw.
  const cheioMin = Number(e.precoMinimoInteira)
  const cheioMax = Number(e.precoMaximoInteira)
  return {
    url_evento: urlDe(e),
    nome: e.nome ?? '',
    data_inicio: sess?.data_inicio ?? isoData(e.dataEstreia), // próxima sessão; senão estreia
    data_fim: sess?.data_fim ?? isoData(e.dataFinalizacao),
    organizador_raw: null, // a listagem não expõe produtor/organizador
    organizador_url: null,
    local_raw: e.local?.trim() || null,
    cidade: e.municipio?.trim() || null,
    uf: e.municipio ? 'SP' : null, // Sampa Ingressos é São Paulo capital
    pais: 'Brasil',
    preco_min,
    preco_max,
    taxa_pct: sess?.taxa_pct ?? null, // taxa de conveniência (taxaConveniencia / valor)
    gratuito: false,
    online: false,
    categoria: e.genero?.trim() || null,
    capacidade_total: typeof e.lotacao === 'number' ? e.lotacao : null,
    imagem_url: e.imagem ? `${HOST}/${e.imagem}` : null,
    descricao: e.sinopse?.trim() || null,
    raw: {
      idEspetaculo: e.idEspetaculo,
      idLocal: e.idLocal,
      categoria_lista: categoria,
      bairro: e.bairro,
      endereco: e.endereco,
      horario: e.horario,
      temporada: e.temporada,
      recomendacaoEtaria: e.recomendacaoEtaria,
      duracao: e.duracao,
      valorSampaIngressos: e.valorSampaIngressos,
      precoCheioMin: Number.isFinite(cheioMin) && cheioMin > 0 ? cheioMin : null, // bilheteria (referência)
      precoCheioMax: Number.isFinite(cheioMax) && cheioMax > 0 ? cheioMax : null,
      desconto: e.desconto,
      ingressosEsgotados: e.ingressosEsgotados,
      dataEstreia: e.dataEstreia,
      dataFinalizacao: e.dataFinalizacao,
      latitude: e.latitude,
      longitude: e.longitude,
    },
  }
}

async function getSource(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('config').eq('slug', 'sampaingressos').maybeSingle()
  return (data?.config ?? {}) as Record<string, unknown>
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db
      .from('crawled_events')
      .select('url_evento')
      .ilike('url_evento', '%sampaingressos%')
      .limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[sampaingressos] getKnown falhou', String(e)) }
  return s
}

export const sampaIngressosScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const cfg = await getSource(db)
  const categorias = Array.isArray(cfg.categorias) && cfg.categorias.length
    ? (cfg.categorias as string[])
    : CATEGORIAS
  const maxPaginas = Math.max(1, Number(cfg.max_paginas ?? MAX_PAGINAS))
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))

  // 1) Descoberta: todos os espetáculos (base) das categorias, deduplicados.
  const candidatos: { e: Espetaculo; cat: string }[] = []
  const vistos = new Set<string>()
  const porCat: string[] = []
  for (const cat of categorias) {
    let n = 0
    for (let pag = 1; pag <= maxPaginas; pag++) {
      const arr = await fetchPagina(cat, pag)
      if (arr === null) break // erro/bloqueio
      if (!arr.length) break // fim
      for (const e of arr) {
        if (e.naoDivulgar === 1) continue
        if (!e.urlPaginaSampaIngressos && !e.idEspetaculo) continue
        const url = urlDe(e)
        if (vistos.has(url)) continue
        vistos.add(url)
        candidatos.push({ e, cat })
        n++
      }
    }
    porCat.push(`${cat}=${n}`)
  }

  // 2) Skip-known (salvo reprocessar) e teto de enriquecimento por execução.
  const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)
  const alvo = candidatos.filter((c) => !known.has(urlDe(c.e))).slice(0, cap)

  // 3) Enriquece com as sessões reais (data/taxa) em lotes.
  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(
      slice.map(async (c) => mapEvento(c.e, c.cat, c.e.idEspetaculo ? await fetchSessoes(c.e.idEspetaculo) : null)),
    )
    out.push(...mapped)
  }

  ctx.notas?.push(
    `Sampa Ingressos: descobertos ${candidatos.length} (${porCat.join(', ')}); ` +
    `novos=${alvo.length}, coletados=${out.length}`,
  )
  console.log(`[sampaingressos] descobertos=${candidatos.length} alvo=${alvo.length} coletados=${out.length}`)
  return out
}
