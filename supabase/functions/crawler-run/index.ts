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
import { guichewebScraper } from './sources/guicheweb.ts'
import { bilheteriaDigitalScraper } from './sources/bilheteriadigital.ts'

const SCRAPERS: Record<string, Scraper> = {
  sympla: symplaScraper,
  bileto: biletoScraper,
  ingresse: ingresseScraper,
  diskingressos: diskIngressosScraper,
  ingressodigital: ingressoDigitalScraper,
  guicheweb: guichewebScraper,
  bilheteriadigital: bilheteriaDigitalScraper,
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

async function runSource(
  db: ReturnType<typeof adminClient>,
  source: SourceRow,
  ignoreRules: IgnoreRule[],
  disparadoPor: 'manual' | 'cron',
): Promise<{ vistos: number; novos: number; ignorados: number; erros: number }> {
  const scraper = SCRAPERS[source.slug]
  const cidadesCfg = source.config?.cidades ?? []
  // Sem cidades cadastradas: roda uma única vez sem filtro de cidade.
  const cidades = cidadesCfg.length ? cidadesCfg : [{ cidade: '', uf: '' }]
  const janelaDias = source.config?.janela_dias ?? 90

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
    const ctx: ScrapeContext = { cidade: c.cidade, uf: c.uf, janelaDias }
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
      const ig = shouldIgnore(
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

  await db.from('crawler_runs').update({
    status: erros > 0 && vistos === 0 ? 'error' : 'done',
    eventos_vistos: vistos,
    eventos_novos: novos,
    eventos_ignorados: ignorados,
    erros,
    erro_msg: erroMsg,
    finalizado_em: new Date().toISOString(),
  }).eq('id', runId)

  await db.from('crawler_sources')
    .update({ ultima_execucao: new Date().toISOString() })
    .eq('id', source.id)

  return { vistos, novos, ignorados, erros }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const auth = await authorize(req)
  if (!auth.ok) return json({ error: 'Não autorizado' }, 403)

  let body: { source_slug?: string } = {}
  try { body = await req.json() } catch { /* sem body = todas as fontes */ }

  const db = adminClient()

  const { data: org } = await db.from('orgs').select('id').order('created_at').limit(1).maybeSingle()
  if (!org) return json({ error: 'Nenhuma org' }, 400)

  let q = db.from('crawler_sources').select('*').eq('org_id', org.id).eq('ativo', true)
  if (body.source_slug) q = q.eq('slug', body.source_slug)
  const { data: sources, error: srcErr } = await q
  if (srcErr) return json({ error: srcErr.message }, 500)

  const { data: rules } = await db
    .from('crawler_ignore_rules')
    .select('tipo, keyword, ativo')
    .eq('org_id', org.id)
    .eq('ativo', true)
  const ignoreRules = (rules ?? []) as IgnoreRule[]

  // Marca como erro runs antigas presas em "running" (timeout anterior).
  const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await db.from('crawler_runs')
    .update({ status: 'error', erro_msg: 'interrompida (timeout)', finalizado_em: new Date().toISOString() })
    .eq('org_id', org.id).eq('status', 'running').lt('iniciado_em', dezMinAtras)

  // Coleta em segundo plano: responde já e processa depois (evita timeout do
  // invoke). A run/UI refletem o resultado quando termina (tela Execuções).
  const work = (async () => {
    for (const s of (sources ?? []) as SourceRow[]) {
      try { await runSource(db, s, ignoreRules, auth.disparadoPor) }
      catch (e) { console.error('[crawler-run] fonte', s.slug, String(e)) }
    }
  })()

  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(work)
  else await work // fallback local

  return json({ ok: true, disparado_por: auth.disparadoPor, iniciado: true })
})
