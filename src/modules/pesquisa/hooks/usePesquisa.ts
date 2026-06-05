import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from '@/modules/crm/hooks/useFunnelStages'

export { useCrmOrgId as usePesquisaOrgId } from '@/modules/crm/hooks/useFunnelStages'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface CrawlerSource {
  id: string
  org_id: string
  nome: string
  slug: string
  tipo: string
  metodo: string
  ativo: boolean
  config: { cidades?: { cidade: string; uf: string }[]; janela_dias?: number }
  ultima_execucao: string | null
}

export interface CrawledEventRow {
  id: string
  source_id: string
  source_slug: string | null
  source_nome: string | null
  url_evento: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  organizador_raw: string | null
  organizador_url: string | null
  local_raw: string | null
  cidade: string | null
  uf: string | null
  pais: string | null
  preco_min: number | null
  preco_max: number | null
  taxa_pct: number | null
  gratuito: boolean
  online: boolean
  segmento: string | null
  categoria: string | null
  capacidade_total: number | null
  vendidos: number | null
  imagem_url: string | null
  ignorado: boolean
  ignorado_motivo: string | null
  promovido_crm_event_id: string | null
  promovido_em: string | null
  primeira_vez_visto: string
  ultima_vez_visto: string
}

export type IgnoreTipoRow = 'nome_evento' | 'local' | 'organizador'
export interface IgnoreRuleRow {
  id: string
  org_id: string
  tipo: IgnoreTipoRow
  keyword: string
  ativo: boolean
}

export interface CrawlerRunRow {
  id: string
  source_id: string | null
  source_slug: string | null
  source_nome: string | null
  status: string
  disparado_por: string
  iniciado_em: string
  finalizado_em: string | null
  eventos_vistos: number
  eventos_novos: number
  eventos_ignorados: number
  erros: number
  erro_msg: string | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useCrawlerSources(): UseQueryResult<CrawlerSource[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'sources', orgId],
    queryFn: async (): Promise<CrawlerSource[]> => {
      const { data, error } = await supabase
        .from('crawler_sources')
        .select('*')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as CrawlerSource[]
    },
  })
}

export function useCrawledEvents(): UseQueryResult<CrawledEventRow[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'events', orgId],
    queryFn: async (): Promise<CrawledEventRow[]> => {
      const { data, error } = await supabase
        .from('crawled_events')
        .select('*, crawler_sources(slug, nome)')
        .eq('org_id', orgId!)
        .order('primeira_vez_visto', { ascending: false })
        .limit(2000)
      if (error) throw new Error(error.message)
      return (data ?? []).map((e: Record<string, unknown>) => ({
        ...(e as object),
        source_slug: (e.crawler_sources as { slug?: string } | null)?.slug ?? null,
        source_nome: (e.crawler_sources as { nome?: string } | null)?.nome ?? null,
      })) as CrawledEventRow[]
    },
  })
}

// ---------------------------------------------------------------------------
// Listagem paginada + filtros no backend (a tabela tem mais de 1000 linhas)
// ---------------------------------------------------------------------------
export type EventStatusFiltro = 'ativos' | 'promovidos' | 'ignorados' | 'todos'

export type PaisFiltro = 'todos' | 'brasil' | 'exterior'

export interface EventFilters {
  search: string
  fonte: string // slug | 'todas'
  cidade: string // nome | 'todas'
  categoria: string // valor | 'todas'
  status: EventStatusFiltro
  pais: PaisFiltro
}

export const EVENTS_PAGE_SIZE = 100

function mapEventRow(e: Record<string, unknown>): CrawledEventRow {
  return {
    ...(e as object),
    source_slug: (e.crawler_sources as { slug?: string } | null)?.slug ?? null,
    source_nome: (e.crawler_sources as { nome?: string } | null)?.nome ?? null,
  } as CrawledEventRow
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyEventFilters(q: any, f: EventFilters, sourceIdBySlug: Record<string, string>): any {
  let qq = q
  const s = f.search.trim().replace(/[,()*%]/g, ' ').trim()
  if (s) qq = qq.or(`nome.ilike.*${s}*,local_raw.ilike.*${s}*,organizador_raw.ilike.*${s}*`)
  if (f.fonte !== 'todas') qq = qq.eq('source_id', sourceIdBySlug[f.fonte] ?? '00000000-0000-0000-0000-000000000000')
  if (f.cidade !== 'todas') qq = qq.eq('cidade', f.cidade)
  if (f.categoria !== 'todas') qq = qq.eq('categoria', f.categoria)
  if (f.status === 'ativos') qq = qq.eq('ignorado', false).is('promovido_crm_event_id', null)
  else if (f.status === 'promovidos') qq = qq.not('promovido_crm_event_id', 'is', null)
  else if (f.status === 'ignorados') qq = qq.eq('ignorado', true)
  if (f.pais === 'brasil') qq = qq.eq('pais', 'Brasil')
  else if (f.pais === 'exterior') qq = qq.not('pais', 'is', null).neq('pais', 'Brasil')
  return qq
}

export function useSourceMap(): Record<string, string> {
  const sources = useCrawlerSources()
  return useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of sources.data ?? []) m[s.slug] = s.id
    return m
  }, [sources.data])
}

export function useCrawledEventsPaged(
  filters: EventFilters,
  page: number,
  pageSize = EVENTS_PAGE_SIZE,
): UseQueryResult<{ rows: CrawledEventRow[]; total: number }> {
  const orgId = useCrmOrgId()
  const sources = useCrawlerSources()
  const sourceMap = useSourceMap()
  return useQuery({
    enabled: !!orgId && !!sources.data,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'events-paged', orgId, filters, page, pageSize],
    queryFn: async (): Promise<{ rows: CrawledEventRow[]; total: number }> => {
      let q = supabase
        .from('crawled_events')
        .select('*, crawler_sources(slug, nome)', { count: 'exact' })
        .eq('org_id', orgId!)
      q = applyEventFilters(q, filters, sourceMap)
      const from = page * pageSize
      const { data, error, count } = await q
        .order('primeira_vez_visto', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw new Error(error.message)
      return { rows: (data ?? []).map(mapEventRow), total: count ?? 0 }
    },
  })
}

export interface SourceReport {
  total: number
  por_estado: { uf: string; qtd: number }[]
  por_cidade: { cidade: string; uf: string | null; qtd: number }[]
  por_local: { local: string; cidade: string | null; uf: string | null; qtd: number }[]
  por_organizador: { organizador: string; qtd: number }[]
}

export function useSourceReport(sourceId: string | null): UseQueryResult<SourceReport> {
  return useQuery({
    enabled: !!sourceId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'report', sourceId],
    queryFn: async (): Promise<SourceReport> => {
      const { data, error } = await supabase.rpc('crawler_source_report', { p_source: sourceId })
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as Partial<SourceReport>
      return {
        total: d.total ?? 0,
        por_estado: d.por_estado ?? [],
        por_cidade: d.por_cidade ?? [],
        por_local: d.por_local ?? [],
        por_organizador: d.por_organizador ?? [],
      }
    },
  })
}

export function useEventFacets(): UseQueryResult<{ cidades: string[]; categorias: string[] }> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60_000,
    queryKey: ['pesquisa', 'facets', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crawled_event_facets')
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as { cidades?: string[]; categorias?: string[] }
      return { cidades: d.cidades ?? [], categorias: d.categorias ?? [] }
    },
  })
}

/** Busca TODOS os eventos que batem nos filtros (paginando) — p/ exportar. */
export async function fetchAllCrawledEvents(
  orgId: string,
  filters: EventFilters,
  sourceIdBySlug: Record<string, string>,
): Promise<CrawledEventRow[]> {
  const all: CrawledEventRow[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('crawled_events').select('*, crawler_sources(slug, nome)').eq('org_id', orgId)
    q = applyEventFilters(q, filters, sourceIdBySlug)
    const { data, error } = await q
      .order('primeira_vez_visto', { ascending: false })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []).map(mapEventRow))
    if (!data || data.length < 1000) break
  }
  return all
}

export function useIgnoreRules(): UseQueryResult<IgnoreRuleRow[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'ignore-rules', orgId],
    queryFn: async (): Promise<IgnoreRuleRow[]> => {
      const { data, error } = await supabase
        .from('crawler_ignore_rules')
        .select('*')
        .eq('org_id', orgId!)
        .order('tipo')
        .order('keyword')
      if (error) throw new Error(error.message)
      return (data ?? []) as IgnoreRuleRow[]
    },
  })
}

export function useCrawlerRuns(): UseQueryResult<CrawlerRunRow[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'runs', orgId],
    queryFn: async (): Promise<CrawlerRunRow[]> => {
      const { data, error } = await supabase
        .from('crawler_runs')
        .select('*, crawler_sources(slug, nome)')
        .eq('org_id', orgId!)
        .order('iniciado_em', { ascending: false })
        .limit(100)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as object),
        source_slug: (r.crawler_sources as { slug?: string } | null)?.slug ?? null,
        source_nome: (r.crawler_sources as { nome?: string } | null)?.nome ?? null,
      })) as CrawlerRunRow[]
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Marca/desmarca um evento como ignorado manualmente. */
export async function setEventoIgnorado(id: string, ignorado: boolean): Promise<void> {
  const { error } = await supabase
    .from('crawled_events')
    .update({
      ignorado,
      ignorado_motivo: ignorado ? 'ignorado manualmente' : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Promove um evento capturado para o Comercial: cria um crm_event e registra
 * o vínculo no crawled_event. Nada é movido — a Pesquisa mantém o registro.
 */
export async function promoverEvento(
  orgId: string,
  ev: CrawledEventRow,
  profileId: string | null,
): Promise<string> {
  if (ev.promovido_crm_event_id) return ev.promovido_crm_event_id

  const dataPrevista = ev.data_inicio ? ev.data_inicio.slice(0, 10) : null
  const obs = [
    `Promovido da Pesquisa (${ev.source_nome ?? ev.source_slug ?? 'fonte'}).`,
    ev.local_raw ? `Local: ${ev.local_raw}` : null,
    ev.organizador_raw ? `Organizador: ${ev.organizador_raw}` : null,
    ev.cidade ? `Cidade: ${ev.cidade}${ev.uf ? `/${ev.uf}` : ''}` : null,
    `URL: ${ev.url_evento}`,
  ].filter(Boolean).join('\n')

  const { data: created, error } = await supabase
    .from('crm_events')
    .insert({
      org_id: orgId,
      nome: ev.nome,
      data_prevista: dataPrevista,
      site: ev.url_evento,
      observacoes: obs,
      status: 'Planejado',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const crmId = created.id as string
  const { error: linkErr } = await supabase
    .from('crawled_events')
    .update({
      promovido_crm_event_id: crmId,
      promovido_em: new Date().toISOString(),
      promovido_por: profileId,
    })
    .eq('id', ev.id)
  if (linkErr) throw new Error(linkErr.message)

  return crmId
}

/** Liga/desliga uma fonte (Gestor). */
export async function setSourceAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('crawler_sources').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Atualiza config (cidades / janela) de uma fonte (Gestor). */
export async function saveSourceConfig(
  id: string,
  config: CrawlerSource['config'],
): Promise<void> {
  const { error } = await supabase.from('crawler_sources').update({ config }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Cria uma regra de ignorar (Gestor). */
export async function addIgnoreRule(
  orgId: string,
  tipo: IgnoreTipoRow,
  keyword: string,
): Promise<void> {
  const { error } = await supabase
    .from('crawler_ignore_rules')
    .insert({ org_id: orgId, tipo, keyword: keyword.trim() })
  if (error) throw new Error(error.message)
}

export async function deleteIgnoreRule(id: string): Promise<void> {
  const { error } = await supabase.from('crawler_ignore_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function toggleIgnoreRule(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('crawler_ignore_rules').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Dispara a coleta manualmente (Edge Function crawler-run). */
export async function runCrawler(
  sourceSlug?: string,
  opts?: { reprocessar?: boolean },
): Promise<unknown> {
  const body: Record<string, unknown> = {}
  if (sourceSlug) body.source_slug = sourceSlug
  if (opts?.reprocessar) body.reprocessar = true
  const { data, error } = await supabase.functions.invoke('crawler-run', { body })
  if (error) throw new Error(error.message)
  return data
}
