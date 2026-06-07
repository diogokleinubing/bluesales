// Edge Function: artist-agenda-run — captura a agenda oficial dos artistas.
//
// Para cada artista com agenda_url, busca o JSON (formato CMS "artists_api":
// array de itens com name/date/time/local/street/site/link_sale/city_name/
// state_uf/uuid) e faz upsert em artist_agenda_events (dedupe por uuid/id).
//
// Body: { artist_id?: string } — sem id roda todos os artistas com agenda_url.
// Auth: service_role (cron) ou JWT de Gestor (manual).
//
// Deploy: supabase functions deploy artist-agenda-run

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { load } from 'https://esm.sh/cheerio@1.0.0'
import { cors, json } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return false
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false
  const { data: profile } = await adminClient()
    .from('profiles').select('is_gestor').eq('id', user.id).maybeSingle()
  return !!profile?.is_gestor
}

interface AgendaItem {
  id?: number
  uuid?: string
  name?: string
  date?: string | null
  time?: string | null
  local?: string | null
  street?: string | null
  site?: string | null
  link_sale?: string | null
  city_name?: string | null
  state_uf?: string | null
}

function horaFmt(t?: string | null): string | null {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

// Dispatcher: escolhe o parser conforme o host do site oficial do artista.
//  - henriqueejuliano.com.br -> WordPress/Elementor (HTML paginado)
//  - demais -> CMS l8.digital (artists_api com CSRF)
async function fetchAgenda(baseUrl: string): Promise<AgendaItem[]> {
  let host = ''
  try { host = new URL(baseUrl.trim()).host } catch { /* ignora */ }
  if (/henriqueejuliano\.com\.br/i.test(host)) return fetchAgendaHEJ(baseUrl)
  return fetchAgendaL8(baseUrl)
}

const MESES_PT: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function splitCityUf(s: string): { city: string | null; uf: string | null } {
  if (!s) return { city: null, uf: null }
  const parts = s.split('/')
  if (parts.length < 2) return { city: s.trim() || null, uf: null }
  const uf = (parts.pop() ?? '').trim().toUpperCase()
  return { city: parts.join('/').trim() || null, uf: /^[A-Z]{2}$/.test(uf) ? uf : null }
}

// Henrique e Juliano — agenda HTML (Elementor loop-grid), paginada por
// /agenda/page/N/. Cada .e-loop-item tem 5 headings em ordem: [dia, mês, cidade/
// UF, nome, local]; e dois botões: COMPRAR INGRESSO (link de vendas, externo) e
// + INFO (página oficial em henriqueejuliano.com.br/agenda/<slug>). O ano não
// aparece no HTML: inferido pela ordem cronológica (vira o ano quando o mês cai).
async function fetchAgendaHEJ(baseUrl: string): Promise<AgendaItem[]> {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const now = new Date()
  const curYear = now.getUTCFullYear()
  const curMonth = now.getUTCMonth() + 1
  const items: AgendaItem[] = []
  const seen = new Set<string>()
  let lastMonth = 0
  let year = curYear
  let pageUrl: string | null = `${root}/`
  const MAX_PAGES = 12
  for (let p = 0; p < MAX_PAGES && pageUrl; p++) {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) break
    const $ = load(await res.text())
    const loopItems = $('.e-loop-item')
    if (loopItems.length === 0) break
    loopItems.each((_i: number, el: unknown) => {
      const $el = $(el as never)
      const cls = String($el.attr('class') || '')
      const postId = cls.match(/\bpost-(\d+)/)?.[1] || cls.match(/e-loop-item-(\d+)/)?.[1] || ''
      if (postId && seen.has(postId)) return
      const headings = $el.find('.elementor-heading-title')
        .map((_j: number, h: unknown) => $(h as never).text().trim()).get() as string[]
      if (headings.length < 5) return
      const [dayStr, monthStr, cityUf, name, local] = headings
      const day = parseInt(dayStr, 10)
      const mon = MESES_PT[(monthStr || '').toUpperCase().slice(0, 3)]
      if (!day || !mon || !name) return
      // Inferência do ano pela ordem cronológica do HTML.
      if (lastMonth === 0) year = mon < curMonth ? curYear + 1 : curYear
      else if (mon < lastMonth) year++
      lastMonth = mon
      const date = `${year}-${pad2(mon)}-${pad2(day)}`
      const ext = postId || `${date}|${name}`
      if (seen.has(ext)) return
      seen.add(ext)
      let linkSale: string | null = null
      let site: string | null = null
      $el.find('a.elementor-button-link').each((_k: number, a: unknown) => {
        const href = String($(a as never).attr('href') || '')
        if (!href) return
        if (/henriqueejuliano\.com\.br\/agenda\//i.test(href)) { if (!site) site = href }
        else if (!linkSale) linkSale = href
      })
      const { city, uf } = splitCityUf(cityUf)
      items.push({
        uuid: ext,
        name,
        date,
        time: null,
        local: local || null,
        site,
        link_sale: linkSale,
        city_name: city,
        state_uf: uf,
      })
    })
    const next = $('link[rel="next"]').attr('href') || null
    pageUrl = next && next !== pageUrl ? next : null
  }
  return items
}

// Busca a agenda no CMS de site oficial (l8.digital): GET na home p/ obter o
// cookie de sessão + o token <meta csrf-token>, depois POST /artists_api com
// { method:'GET', path:'calendar', _token } — que devolve o array de shows.
async function fetchAgendaL8(baseUrl: string): Promise<AgendaItem[]> {
  const root = baseUrl.trim().replace(/\/+$/, '').replace(/\/artists_api$/, '')
  const home = await fetch(`${root}/`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  })
  if (!home.ok) throw new Error(`home HTTP ${home.status}`)
  const html = await home.text()
  const token = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1]
  if (!token) throw new Error('csrf-token não encontrado (site não suportado)')
  const cookies = (home.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0]).join('; ')
  const res = await fetch(`${root}/artists_api`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Referer: `${root}/`,
      Cookie: cookies,
    },
    body: JSON.stringify({ method: 'GET', path: 'calendar', data: '', _token: token }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`artists_api HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data?.data ?? data?.events ?? [])
}

async function capturaArtista(
  db: ReturnType<typeof adminClient>,
  artist: { id: string; org_id: string; agenda_url: string },
): Promise<{ vistos: number; novos: number; erro?: string }> {
  let itens: AgendaItem[] = []
  try {
    itens = await fetchAgenda(artist.agenda_url)
  } catch (e) {
    return { vistos: 0, novos: 0, erro: String(e) }
  }

  let novos = 0
  for (const it of itens) {
    const external_id = String(it.uuid ?? it.id ?? '').trim()
    const nome = (it.name ?? '').trim()
    if (!external_id || !nome) continue
    const row = {
      org_id: artist.org_id,
      artist_id: artist.id,
      external_id,
      nome,
      data: it.date || null,
      hora: horaFmt(it.time),
      local_raw: it.local || it.street || null,
      cidade: it.city_name || null,
      uf: (it.state_uf || '').toUpperCase() || null,
      site_url: it.site || null,
      link_sale: it.link_sale || null,
      raw: it,
      updated_at: new Date().toISOString(),
    }
    // Mantém a marcação de promovido se já existir (não sobrescreve via upsert).
    const { data: up, error } = await db
      .from('artist_agenda_events')
      .upsert(row, { onConflict: 'artist_id,external_id', ignoreDuplicates: false })
      .select('created_at, promovido_crm_event_id')
      .single()
    if (!error && up && up.created_at && (Date.now() - new Date(up.created_at).getTime()) < 15000) novos++
  }
  return { vistos: itens.length, novos }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  if (!(await isAuthorized(req))) return json({ error: 'Não autorizado' }, 403)

  let body: { artist_id?: string } = {}
  try { body = await req.json() } catch { /* roda todos */ }

  const db = adminClient()
  let q = db.from('artists').select('id, org_id, agenda_url')
    .not('agenda_url', 'is', null).is('deleted_at', null)
  if (body.artist_id) q = q.eq('id', body.artist_id)
  const { data: artists, error } = await q
  if (error) return json({ error: error.message }, 500)

  const work = (async () => {
    for (const a of (artists ?? []) as { id: string; org_id: string; agenda_url: string }[]) {
      if (!a.agenda_url?.trim()) continue
      try {
        const r = await capturaArtista(db, a)
        console.log(`[agenda] artista=${a.id} vistos=${r.vistos} novos=${r.novos}${r.erro ? ' erro=' + r.erro : ''}`)
      } catch (e) { console.error('[agenda] falhou', a.id, String(e)) }
    }
  })()

  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(work)
  else await work

  return json({ ok: true, artistas: (artists ?? []).length })
})
