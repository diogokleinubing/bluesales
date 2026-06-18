// Edge Function: crawler-run — orquestrador de coleta do módulo Pesquisa.
//
// Disparo:
//   - cron (pg_cron semanal): chama com a service_role no Authorization.
//   - manual (botão "Executar agora"): chama com o JWT de um Gestor.
//
// Fluxo por fonte ativa:
//   1. cria crawler_run (status=running)
//   2. para cada cidade do config: cria crawler_job, roda o scraper da fonte,
//      filtra (online/gratuito descartados; regras de ignorar marcam
//      ignorado=true), faz upsert deduplicando por url_evento.
//   3. fecha run com contadores; atualiza ultima_execucao da fonte.
//
// Body JSON: { source_slug?: string }  — sem slug roda todas as fontes ativas.
//
// Deploy: supabase functions deploy crawler-run
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas pelo runtime)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'
import { adminClient, upsertCrawledEvent } from '../_shared/db.ts'
import { shouldIgnore, type IgnoreRule } from '../_shared/classify.ts'
import type { RawEvent, Scraper, ScrapeContext } from '../_shared/types.ts'
import { symplaScraper } from './sources/sympla.ts'
import { biletoScraper } from './sources/bileto.ts'
import { ingresseScraper } from './sources/ingresse.ts'
import { diskIngressosScraper } from './sources/diskingressos.ts'
import { ingressoDigitalScraper } from './sources/ingressodigital.ts'
import { pensaNoEventoScraper } from './sources/pensanoevento.ts'
import { guichewebScraper } from './sources/guicheweb.ts'
import { bilheteriaDigitalScraper } from './sources/bilheteriadigital.ts'
import { baladAppScraper } from './sources/baladapp.ts'
import { ingressoNacionalScraper } from './sources/ingressonacional.ts'
import { q2IngressosScraper } from './sources/q2ingressos.ts'
import { zigTicketsScraper } from './sources/zigtickets.ts'
import { uhuuScraper } from './sources/uhuu.ts'
import { ticketSportsScraper } from './sources/ticketsports.ts'
import { bilheteriaExpressScraper } from './sources/bilheteriaexpress.ts'
import { shotgunScraper } from './sources/shotgun.ts'
import { clubeDoIngressoScraper } from './sources/clubedoingresso.ts'
import { ticketCenterScraper } from './sources/ticketcenter.ts'
import { megaBilheteriaScraper } from './sources/megabilheteria.ts'
import { sampaIngressosScraper } from './sources/sampaingressos.ts'
import { minhaEntradaScraper } from './sources/minhaentrada.ts'

const SCRAPERS: Record<string, Scraper> = {
  sympla: symplaScraper,
  bileto: biletoScraper,
  ingresse: ingresseScraper,
  diskingressos: diskIngressosScraper,
  ingressodigital: ingressoDigitalScraper,
  pensanoevento: pensaNoEventoScraper,
  guicheweb: guichewebScraper,
  bilheteriadigital: bilheteriaDigitalScraper,
  baladapp: baladAppScraper,
  ingressonacional: ingressoNacionalScraper,
  q2ingressos: q2IngressosScraper,
  zigtickets: zigTicketsScraper,
  uhuu: uhuuScraper,
  ticketsports: ticketSportsScraper,
  bilheteriaexpress: bilheteriaExpressScraper,
  shotgun: shotgunScraper,
  clubedoingresso: clubeDoIngressoScraper,
  ticketcenter: ticketCenterScraper,
  megabilheteria: megaBilheteriaScraper,
  sampaingressos: sampaIngressosScraper,
  minhaentrada: minhaEntradaScraper,
}

interface SourceRow {
  id: string
  org_id: string
  slug: string
  nome: string
  ativo: boolean
  config: { cidades?: { cidade: string; uf: string }[]; janela_dias?: number }
}

/** Identifica o chamador: gestor (manual) ou service_role (cron). */
async function authorize(
  req: Request,
): Promise<{ ok: boolean; disparadoPor: 'manual' | 'cron' }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return { ok: false, disparadoPor: 'cron' }

  // service_role token (cron) → autoriza como cron.
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { ok: true, disparadoPor: 'cron' }
  }

  // Caso contrário, JWT de usuário → precisa ser Gestor.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, disparadoPor: 'manual' }

  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_gestor')
    .eq('id', user.id)
    .maybeSingle()
  return { ok: !!profile?.is_gestor, disparadoPor: 'manual' }
}

/**
 * Monta a observação legível da execução: cidades varridas, reprocessar, o
 * movimento dos campos de paginação (offset/cursor) lendo o config depois da
 * run e comparando com o snapshot de antes, e as notas que o scraper deu push.
 */
async function montarObservacao(
  source: SourceRow,
  cidadesCfg: { cidade: string; uf: string }[],
  reprocessar: boolean,
  cfgAntes: Record<string, unknown>,
  cfgDepois: Record<string, unknown>,
  notas: string[],
): Promise<string | null> {
  const linhas: string[] = []

  if (cidadesCfg.length) {
    const cs = cidadesCfg.map((c) => (c.uf ? `${c.cidade}/${c.uf}` : c.cidade)).filter(Boolean)
    if (cs.length) linhas.push(`Cidades: ${cs.join(', ')}`)
  }
  if (reprocessar) linhas.push('Reprocessar: sim (ignora skip-forever)')

  // Diff dos campos de paginação no config (offset/cursor/etc.).
  const IGNORAR = new Set(['cidades', 'janela_dias', 'progresso'])
  const chaves = new Set([...Object.keys(cfgAntes), ...Object.keys(cfgDepois)])
  for (const k of [...chaves].sort()) {
    if (IGNORAR.has(k)) continue
    const a = cfgAntes[k]
    const d = cfgDepois[k]
    if (typeof a === 'object' || typeof d === 'object') continue // só escalares
    if (a === d) linhas.push(`${k}: ${fmtVal(d)}`)
    else linhas.push(`${k}: ${fmtVal(a)} → ${fmtVal(d)}`)
  }

  for (const n of notas) if (n) linhas.push(n)

  return linhas.length ? linhas.join('\n') : null
}

function fmtVal(v: unknown): string {
  if (v === undefined || v === null) return '—'
  return String(v)
}

// ── Progresso de varredura (foco: capturar novos) ───────────────────────────
// Modelo único pra todas as fontes: uma "volta" é uma passada pelo catálogo/faixa.
// `pos` cresce ao longo da volta e CAI quando recomeça (wrap) → detecta `voltou`.
// `total` só quando dá pra inferir do config. `catalogo`: fontes que enxergam o
// catálogo inteiro por execução — a volta termina quando não há mais novos.
type Cfg = Record<string, unknown>
type ProgDesc = { pos?: (c: Cfg) => number; total?: (c: Cfg) => number; token?: string; catalogo?: boolean }
const N = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const PROGRESSO: Record<string, ProgDesc> = {
  bileto: {
    pos: (c) => N(c.id_topo, 122500) - N(c.id_baixo, N(c.id_topo, 122500)),
    total: (c) => N(c.id_topo, 122500) - N(c.id_min, 1),
  },
  bilheteriadigital: { pos: (c) => N(c.uf_cursor), total: () => 27 },
  shotgun: { pos: (c) => N(c.city_cursor) },
  guicheweb: { pos: (c) => N(c.offset) },
  diskingressos: { pos: (c) => N(c.offset) },
  ingresse: { pos: (c) => N(c.offset) },
  sympla: { pos: (c) => N(c.sitemap_offset), total: (c) => N(c.sitemap_total) || 0 },
  ingressonacional: { pos: (c) => N(c.offset) },
  q2ingressos: { pos: (c) => N(c.offset) },
  ticketsports: { pos: (c) => N(c.offset) },
  uhuu: { pos: (c) => N(c.offset) },
  zigtickets: { catalogo: true }, // emite TODOS os eventos por run → novos em 1 ciclo
  bilheteriaexpress: { pos: (c) => N(c.pagina) },
  ticketcenter: { pos: (c) => N(c.pagina) },
  pensanoevento: { token: 'cursor' },
  baladapp: { catalogo: true },
  clubedoingresso: { catalogo: true },
  megabilheteria: { catalogo: true },
  sampaingressos: { catalogo: true },
  ingressodigital: { catalogo: true },
  minhaentrada: { catalogo: true },
}

type Progresso = {
  pos: number | null; total: number | null; passo: number | null
  voltou: boolean; voltas: number; novos: number; em: string
}
function calcProgresso(slug: string, antes: Cfg, depois: Cfg, novos: number): Progresso | null {
  const d = PROGRESSO[slug]
  if (!d) return null
  const prev = (antes.progresso ?? {}) as Partial<Progresso>
  let pos: number | null = null
  let total: number | null = null
  let voltou = false
  if (d.catalogo) {
    voltou = novos === 0 // catálogo inteiro por run: caught up quando 0 novos
  } else if (d.token) {
    voltou = !!antes[d.token] && !depois[d.token] // token esvaziou = deu a volta
  } else if (d.pos) {
    const pa = d.pos(antes)
    pos = d.pos(depois)
    total = d.total ? d.total(depois) : null
    voltou = pos < pa // cursor recuou = recomeçou a volta
  }
  const passo = (!voltou && pos != null && prev.pos != null) ? Math.max(0, pos - prev.pos) : (prev.passo ?? null)
  return {
    pos, total, passo,
    voltou,
    voltas: N(prev.voltas) + (voltou ? 1 : 0),
    novos,
    em: new Date().toISOString(),
  }
}

async function runSource(
  db: ReturnType<typeof adminClient>,
  source: SourceRow,
  ignoreRules: IgnoreRule[],
  disparadoPor: 'manual' | 'cron',
  reprocessar: boolean,
): Promise<{ vistos: number; novos: number; ignorados: number; erros: number }> {
  const scraper = SCRAPERS[source.slug]
  const cidadesCfg = source.config?.cidades ?? []
  // Sem cidades cadastradas: roda uma única vez sem filtro de cidade.
  const cidades = cidadesCfg.length ? cidadesCfg : [{ cidade: '', uf: '' }]
  const janelaDias = source.config?.janela_dias ?? 90
  // Snapshot do config antes da run (para diff de offset/cursor na observação).
  const cfgAntes = { ...(source.config ?? {}) } as Record<string, unknown>
  const notas: string[] = []

  const { data: run } = await db
    .from('crawler_runs')
    .insert({
      org_id: source.org_id,
      source_id: source.id,
      status: 'running',
      disparado_por: disparadoPor,
    })
    .select('id')
    .single()
  const runId = run?.id as string

  let vistos = 0, novos = 0, ignorados = 0, erros = 0
  let erroMsg: string | null = null

  if (!scraper) {
    erros++
    erroMsg = `Scraper não encontrado para slug "${source.slug}"`
  }

  for (const c of scraper ? cidades : []) {
    const ctx: ScrapeContext = { cidade: c.cidade, uf: c.uf, janelaDias, reprocessar, notas }
    const { data: job } = await db
      .from('crawler_jobs')
      .insert({
        org_id: source.org_id,
        run_id: runId,
        source_id: source.id,
        status: 'running',
        payload: ctx,
        iniciado_em: new Date().toISOString(),
      })
      .select('id')
      .single()
    const jobId = job?.id as string

    let events: RawEvent[] = []
    try {
      events = await scraper!(ctx)
    } catch (e) {
      erros++
      erroMsg = String(e)
      await db.from('crawler_jobs').update({
        status: 'error', erro_msg: String(e), finalizado_em: new Date().toISOString(),
      }).eq('id', jobId)
      continue
    }

    let jVistos = 0, jNovos = 0, jIgnorados = 0
    for (const ev of events) {
      // Regra absoluta: online e gratuito são descartados antes de inserir.
      if (ev.online || ev.gratuito) continue
      if (!ev.url_evento || !ev.nome) continue
      jVistos++
      // Ticket Sports é uma fonte 100% esportiva (corridas/provas) — todos os
      // eventos são desejados, então as regras de palavra-chave não se aplicam.
      const ig = source.slug === 'ticketsports'
        ? { ignore: false, motivo: null }
        : shouldIgnore(
            { nome: ev.nome, local: ev.local_raw, organizador: ev.organizador_raw },
            ignoreRules,
          )
      if (ig.ignore) jIgnorados++
      try {
        const r = await upsertCrawledEvent(db, source.org_id, source.id, ev, ig)
        if (r.novo) jNovos++
      } catch (e) {
        erros++
        erroMsg = String(e)
      }
    }
    vistos += jVistos; novos += jNovos; ignorados += jIgnorados

    await db.from('crawler_jobs').update({
      status: 'done',
      resultado: { vistos: jVistos, novos: jNovos, ignorados: jIgnorados },
      finalizado_em: new Date().toISOString(),
    }).eq('id', jobId)
  }

  // Lê o config DEPOIS da run (scraper moveu offset/cursor) p/ observação + progresso.
  let cfgDepois: Record<string, unknown> = cfgAntes
  try {
    const { data } = await db.from('crawler_sources').select('config').eq('id', source.id).maybeSingle()
    cfgDepois = (data?.config ?? {}) as Record<string, unknown>
  } catch { /* mantém cfgAntes */ }

  // Observação: cidades, reprocessar, diff de config (offset/cursor) e notas.
  const observacao = await montarObservacao(source, cidadesCfg, reprocessar, cfgAntes, cfgDepois, notas)

  await db.from('crawler_runs').update({
    status: erros > 0 && vistos === 0 ? 'error' : 'done',
    eventos_vistos: vistos,
    eventos_novos: novos,
    eventos_ignorados: ignorados,
    erros,
    erro_msg: erroMsg,
    observacao,
    finalizado_em: new Date().toISOString(),
  }).eq('id', runId)

  // Progresso de varredura: só no modo normal (capturar novos); reproc não mexe.
  const srcPatch: Record<string, unknown> = { ultima_execucao: new Date().toISOString() }
  if (!reprocessar) {
    const prog = calcProgresso(source.slug, cfgAntes, cfgDepois, novos)
    if (prog) srcPatch.config = { ...cfgDepois, progresso: prog }
  }
  await db.from('crawler_sources').update(srcPatch).eq('id', source.id)

  return { vistos, novos, ignorados, erros }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const auth = await authorize(req)
  if (!auth.ok) return json({ error: 'Não autorizado' }, 403)

  let body: { source_slug?: string; reprocessar?: boolean } = {}
  try { body = await req.json() } catch { /* sem body = todas as fontes */ }

  const db = adminClient()

  const { data: org } = await db.from('orgs').select('id').order('created_at').limit(1).maybeSingle()
  if (!org) return json({ error: 'Nenhuma org' }, 400)

  // Run específico (slug) ignora o "ativo": o switch só gateia o "rodar todas"
  // (Executar tudo / cron); manual/varredura sempre roda a fonte escolhida.
  let q = db.from('crawler_sources').select('*').eq('org_id', org.id)
  if (body.source_slug) q = q.eq('slug', body.source_slug)
  else q = q.eq('ativo', true)
  const { data: sources, error: srcErr } = await q
  if (srcErr) return json({ error: srcErr.message }, 500)

  const { data: rules } = await db
    .from('crawler_ignore_rules')
    .select('tipo, keyword, ativo')
    .eq('org_id', org.id)
    .eq('ativo', true)
  const ignoreRules = (rules ?? []) as IgnoreRule[]

  // Marca como erro runs antigas presas em "running" (timeout/CPU excedido).
  const limiteAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  await db.from('crawler_runs')
    .update({ status: 'error', erro_msg: 'interrompida (timeout)', finalizado_em: new Date().toISOString() })
    .eq('org_id', org.id).eq('status', 'running').lt('iniciado_em', limiteAtras)

  // Coleta em segundo plano: responde já e processa depois (evita timeout do
  // invoke). A run/UI refletem o resultado quando termina (tela Execuções).
  const work = (async () => {
    for (const s of (sources ?? []) as SourceRow[]) {
      try { await runSource(db, s, ignoreRules, auth.disparadoPor, !!body.reprocessar) }
      catch (e) { console.error('[crawler-run] fonte', s.slug, String(e)) }
    }
    // Detecta artistas nos títulos dos eventos capturados (vínculo evento<>artista).
    try { await db.rpc('detect_event_artists') }
    catch (e) { console.error('[crawler-run] detect_event_artists', String(e)) }
  })()

  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(work)
  else await work // fallback local

  return json({ ok: true, disparado_por: auth.disparadoPor, iniciado: true })
})
