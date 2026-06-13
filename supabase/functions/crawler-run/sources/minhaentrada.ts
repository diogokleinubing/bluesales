// Fonte: Minha Entrada (minhaentrada.com.br) — agenda multi-estado (SC, RS, PR,
// SP, RJ, MG, MS, BA). HTML server-rendered (swoole), SEM Cloudflare challenge.
//
//   Descoberta:
//     GET /agenda-geral  -> cookies + token CSRF (XSRF-TOKEN) + 1ª página (20 cards)
//     POST /ajax/agenda-geral/mostrar-mais-eventos {pag:N,...}  -> +20 cards/página
//       (Laravel exige CSRF: cookie XSRF-TOKEN + header X-XSRF-TOKEN). Fim quando
//       a página não traz slug novo. Cada card só dá o slug (/evento/<slug>).
//   Por evento (slug):
//     GET /evento/<slug>  -> schema.org: startDate (ISO c/ hora), nome, cidade/UF,
//       lat/long, descrição, local, imagem. NÃO traz preço (é carregado por JS).
//     POST /ajax/evento/<slug>/render-tickets/ (CSRF) -> {view: HTML} com os
//       preços por lote/classe (ex.: "VIP R$ 33,00", "A partir de R$ 23,00").
//
// Incremental: skip-known + teto de eventos por execução. CSRF pego 1x e reusado.

import type { RawEvent, Scraper } from '../../_shared/types.ts'
import { adminClient } from '../../_shared/db.ts'

const HOST = 'https://minhaentrada.com.br'
const MAX_PAGINAS = 40 // trava de segurança na varredura da agenda
const MAX_DETALHES = 40 // teto de eventos enriquecidos por execução
const BATCH = 5
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const BASE = { 'User-Agent': UA, Accept: 'text/html, application/json, */*' }

interface Sessao { cookies: string; xsrf: string }

async function fetchTexto(
  url: string,
  init: RequestInit & { retries?: number } = {},
): Promise<{ status: number; text: string; res: Response } | null> {
  const { retries = 3, ...rest } = init
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 503) {
        if (i < retries - 1) { await new Promise((r) => setTimeout(r, 1200 * (i + 1))); continue }
      }
      return { status: res.status, text: await res.text(), res }
    } catch (e) {
      if (i < retries - 1) { await new Promise((r) => setTimeout(r, 1000)); continue }
      console.error('[minhaentrada] fetch falhou', url, String(e))
      return null
    }
  }
  return null
}

/** GET inicial: captura cookies de sessão + token CSRF e devolve o HTML da 1ª página. */
async function abrirSessao(): Promise<{ sessao: Sessao; html: string } | null> {
  const r = await fetchTexto(`${HOST}/agenda-geral`, { headers: BASE })
  if (!r || r.status !== 200) { console.error('[minhaentrada] agenda-geral', r?.status); return null }
  const arr = typeof r.res.headers.getSetCookie === 'function'
    ? r.res.headers.getSetCookie()
    : (r.res.headers.get('set-cookie') ? [r.res.headers.get('set-cookie') as string] : [])
  const cookies = arr.map((c) => c.split(';')[0]).join('; ')
  const m = cookies.match(/XSRF-TOKEN=([^;]+)/)
  if (!m) { console.error('[minhaentrada] sem XSRF-TOKEN'); return null }
  return { sessao: { cookies, xsrf: decodeURIComponent(m[1]) }, html: r.text }
}

const slugsDe = (html: string) => [...html.matchAll(/href="\/evento\/([^"#?]+)"/g)].map((m) => m[1])

/** Varre a agenda inteira (1ª página do GET + paginação POST com CSRF). */
async function descobrirSlugs(s: Sessao, primeiraPagina: string, maxPaginas: number): Promise<string[]> {
  const vistos = new Set<string>(slugsDe(primeiraPagina))
  for (let pag = 1; pag < maxPaginas; pag++) {
    const r = await fetchTexto(`${HOST}/ajax/agenda-geral/mostrar-mais-eventos`, {
      method: 'POST',
      headers: {
        ...BASE,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': s.xsrf,
        Cookie: s.cookies,
        Referer: `${HOST}/agenda-geral`,
      },
      body: JSON.stringify({
        pag, maxByConsulta: 20, 'mais-visitados': 0,
        'data-inicio': '', 'data-fim': '', estado: '', cidade: '', local: '', 'evento-nome': '',
      }),
    })
    if (!r || r.status !== 200) break
    const novos = slugsDe(r.text).filter((sl) => !vistos.has(sl))
    if (!novos.length) break // fim da agenda
    novos.forEach((sl) => vistos.add(sl))
  }
  return [...vistos]
}

const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&aacute;/g, 'á')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const brMoney = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

/** Preços (líquido praticado) do HTML de render-tickets: faixa min/max dos R$. */
async function fetchPrecos(slug: string, s: Sessao): Promise<{ min: number | null; max: number | null }> {
  const r = await fetchTexto(`${HOST}/ajax/evento/${slug}/render-tickets/`, {
    method: 'POST',
    headers: {
      ...BASE, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': s.xsrf, Cookie: s.cookies, Referer: `${HOST}/evento/${slug}`,
    },
    body: '{}',
  })
  if (!r || r.status !== 200) return { min: null, max: null }
  let view = ''
  try { view = (JSON.parse(r.text) as { view?: string }).view ?? '' } catch { return { min: null, max: null } }
  const nums = [...view.matchAll(/R\$\s*([\d.]*\d,\d{2})/g)].map((m) => brMoney(m[1])).filter((n) => n > 0)
  if (!nums.length) return { min: null, max: null }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

/** Detalhe (schema.org) + preços -> RawEvent. null se o detalhe falhar. */
async function montarEvento(slug: string, s: Sessao): Promise<RawEvent | null> {
  const d = await fetchTexto(`${HOST}/evento/${slug}`, { headers: BASE })
  if (!d || d.status !== 200) return null
  const h = d.text
  const nome = h.match(/itemprop="name">([^<]+)</)?.[1]?.trim()
  if (!nome) return null
  const data_inicio = h.match(/itemprop="startDate" content="([^"]+)"/)?.[1] ?? null
  const locBlock = h.match(/itemprop="location"[\s\S]{0,600}?<\/a>/)?.[0] ?? ''
  const local_raw = locBlock.match(/itemprop="name"\s+content="([^"]*)"/)?.[1]?.trim() ||
    locBlock.match(/itemprop="name">([^<]+)</)?.[1]?.trim() || null
  const cidade = locBlock.match(/addressLocality">([^<]+)</)?.[1]?.trim() || null
  const uf = locBlock.match(/addressRegion">([^<]+)</)?.[1]?.trim() || null
  const geo = h.match(/maps\/search\/(-?[\d.]+),(-?[\d.]+)/)
  const imagem_url = h.match(/name="og:image" content="([^"]+)"/)?.[1] || null
  const descRaw = h.match(/id="texto-informacao"[^>]*>([\s\S]*?)<\/div>/)?.[1]
  const descricao = descRaw ? decode(descRaw) || null : null
  const abertura = h.match(/class="horarios-evento[^"]*">\s*([\d:]+)/)?.[1] || null

  const precos = await fetchPrecos(slug, s)
  return {
    url_evento: `${HOST}/evento/${slug}`,
    nome,
    data_inicio,
    data_fim: null,
    organizador_raw: null,
    organizador_url: null,
    local_raw,
    cidade,
    uf,
    pais: 'Brasil',
    preco_min: precos.min,
    preco_max: precos.max,
    taxa_pct: null, // taxa de conveniência não exposta de forma estruturada
    gratuito: false,
    online: false,
    categoria: null, // a página do evento não expõe a categoria do filtro
    capacidade_total: null,
    imagem_url,
    descricao,
    raw: {
      slug,
      abertura,
      latitude: geo?.[1] ?? null,
      longitude: geo?.[2] ?? null,
    },
  }
}

async function getKnown(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const { data } = await db.from('crawled_events').select('url_evento')
      .ilike('url_evento', '%minhaentrada%').limit(100000)
    for (const r of data ?? []) s.add(String(r.url_evento))
  } catch (e) { console.error('[minhaentrada] getKnown falhou', String(e)) }
  return s
}

async function getCfg(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('crawler_sources').select('config').eq('slug', 'minhaentrada').maybeSingle()
  return (data?.config ?? {}) as Record<string, unknown>
}

export const minhaEntradaScraper: Scraper = async (ctx) => {
  const db = adminClient()
  const cfg = await getCfg(db)
  const maxPaginas = Math.max(1, Number(cfg.max_paginas ?? MAX_PAGINAS))
  const cap = Math.max(1, Number(cfg.detalhes_por_run ?? MAX_DETALHES))

  const sess = await abrirSessao()
  if (!sess) { ctx.notas?.push('Minha Entrada: falha ao abrir sessão/CSRF'); return [] }

  const todos = await descobrirSlugs(sess.sessao, sess.html, maxPaginas)
  const known = ctx.reprocessar ? new Set<string>() : await getKnown(db)
  const alvo = todos.filter((slug) => !known.has(`${HOST}/evento/${slug}`)).slice(0, cap)

  const out: RawEvent[] = []
  for (let i = 0; i < alvo.length; i += BATCH) {
    const slice = alvo.slice(i, i + BATCH)
    const mapped = await Promise.all(slice.map((slug) => montarEvento(slug, sess.sessao)))
    out.push(...mapped.filter((e): e is RawEvent => e !== null))
  }

  ctx.notas?.push(`Minha Entrada: descobertos ${todos.length}, novos ${alvo.length}, coletados ${out.length}`)
  console.log(`[minhaentrada] descobertos=${todos.length} alvo=${alvo.length} coletados=${out.length}`)
  return out
}
