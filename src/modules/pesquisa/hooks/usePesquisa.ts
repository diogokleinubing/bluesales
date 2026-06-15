import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from '@/modules/crm/hooks/useFunnelStages'
import { faixaPreco, fmtTaxa } from '../lib/preco'

export { useCrmOrgId, useCrmOrgId as usePesquisaOrgId } from '@/modules/crm/hooks/useFunnelStages'

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
  favorito: boolean
  primeira_vez_visto: string
  ultima_vez_visto: string
  artistas: { id: string; nome: string }[]
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
  observacao: string | null
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
// Agregação de Organizadores / Locais (RPC sobre TODA a base, sem limite)
// ---------------------------------------------------------------------------
export interface OrganizerAgg {
  chave: string
  nome: string
  eventos: number
  preco_min: number | null
  preco_max: number | null
  taxa_media: number | null
  cidades: string[]
  fontes: string[]
  cidade_nome: string | null
  uf: string | null
  proximo: string | null
}

export interface LocalAgg {
  chave: string
  nome: string
  cidade: string | null
  cidade_nome: string | null
  uf: string | null
  eventos: number
  preco_min: number | null
  preco_max: number | null
  taxa_media: number | null
  fontes: string[]
  proximo: string | null
}

export interface OrganizerFilters {
  search: string
  valorMin: number | null
  fonte: string // slug | 'todas'
  cidade: string // 'cidade|uf' | 'todas'
  uf: string // UF | ''
}

/** Deriva (cidade, uf) para as RPCs: a UF vem do select ou do sufixo da cidade. */
function cidadeUfParams(cidade: string, uf: string): { p_cidade: string | null; p_uf: string | null } {
  const [c = '', u = ''] = cidade !== 'todas' ? cidade.split('|') : []
  return { p_cidade: c || null, p_uf: uf || u || null }
}

export function useCrawledOrganizers(filters: OrganizerFilters): UseQueryResult<OrganizerAgg[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'organizers', orgId, filters],
    queryFn: async (): Promise<OrganizerAgg[]> => {
      const { data, error } = await supabase.rpc('crawled_organizers', {
        p_search: filters.search.trim() || null,
        p_valor_min: filters.valorMin,
        p_fonte: filters.fonte !== 'todas' ? filters.fonte : null,
        ...cidadeUfParams(filters.cidade, filters.uf),
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as OrganizerAgg[]
    },
  })
}

export interface LocalAggFilters {
  search: string
  valorMin: number | null
  fonte: string
  cidade: string // 'cidade|uf' | 'todas'
  uf: string // UF | ''
}

export function useCrawledLocals(filters: LocalAggFilters): UseQueryResult<LocalAgg[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'locals', orgId, filters],
    queryFn: async (): Promise<LocalAgg[]> => {
      const { data, error } = await supabase.rpc('crawled_locals', {
        p_search: filters.search.trim() || null,
        p_valor_min: filters.valorMin,
        p_fonte: filters.fonte !== 'todas' ? filters.fonte : null,
        ...cidadeUfParams(filters.cidade, filters.uf),
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as LocalAgg[]
    },
  })
}

/** Eventos (não ignorados) de um organizador específico — para o dialog. */
export function useEventosDoOrganizador(
  nome: string | null,
  fonte?: string | null,
): UseQueryResult<CrawledEventRow[]> {
  const orgId = useCrmOrgId()
  const fonteSlug = fonte && fonte !== 'todas' ? fonte : null
  return useQuery({
    enabled: !!orgId && !!nome,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'org-eventos', orgId, nome, fonteSlug],
    queryFn: async (): Promise<CrawledEventRow[]> => {
      let q = supabase
        .from('crawled_events')
        .select(fonteSlug ? '*, crawler_sources!inner(slug, nome)' : '*, crawler_sources(slug, nome)')
        .eq('org_id', orgId!)
        .eq('ignorado', false)
        .ilike('organizador_raw', nome!)
      if (fonteSlug) q = q.eq('crawler_sources.slug', fonteSlug)
      const { data, error } = await q.order('data_inicio', { ascending: true }).limit(1000)
      if (error) throw new Error(error.message)
      return (data ?? []).map((e: Record<string, unknown>) => ({
        ...(e as object),
        source_slug: (e.crawler_sources as { slug?: string } | null)?.slug ?? null,
        source_nome: (e.crawler_sources as { nome?: string } | null)?.nome ?? null,
      })) as CrawledEventRow[]
    },
  })
}

/** Eventos (não ignorados) de um local específico (nome + cidade combinada). */
export function useEventosDoLocal(
  nome: string | null,
  cidade: string | null,
  fonte?: string | null,
): UseQueryResult<CrawledEventRow[]> {
  const orgId = useCrmOrgId()
  const fonteSlug = fonte && fonte !== 'todas' ? fonte : null
  return useQuery({
    enabled: !!orgId && !!nome,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'local-eventos', orgId, nome, cidade, fonteSlug],
    queryFn: async (): Promise<CrawledEventRow[]> => {
      let q = supabase
        .from('crawled_events')
        .select(fonteSlug ? '*, crawler_sources!inner(slug, nome)' : '*, crawler_sources(slug, nome)')
        .eq('org_id', orgId!)
        .eq('ignorado', false)
        .ilike('local_raw', nome!)
      if (fonteSlug) q = q.eq('crawler_sources.slug', fonteSlug)
      const { data, error } = await q.order('data_inicio', { ascending: true }).limit(1000)
      if (error) throw new Error(error.message)
      const rows = (data ?? []).map((e: Record<string, unknown>) => ({
        ...(e as object),
        source_slug: (e.crawler_sources as { slug?: string } | null)?.slug ?? null,
        source_nome: (e.crawler_sources as { nome?: string } | null)?.nome ?? null,
      })) as CrawledEventRow[]
      // Refina pela cidade combinada (mesma chave usada no agregado).
      return rows.filter((e) => {
        const c = e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : null
        return c === cidade
      })
    },
  })
}

/** Eventos (não ignorados) de um local pela(s) chave(s) agregada(s). */
export function useEventosDoLocalChaves(chaves: string[] | null): UseQueryResult<CrawledEventRow[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId && !!chaves && chaves.length > 0,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'local-eventos-chaves', orgId, chaves],
    queryFn: async (): Promise<CrawledEventRow[]> => {
      const { data, error } = await supabase
        .from('crawled_events')
        .select('*, crawler_sources(slug, nome)')
        .eq('org_id', orgId!)
        .eq('ignorado', false)
        .in('local_chave', chaves!)
        .order('data_inicio', { ascending: true })
        .limit(1000)
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
  cidade: string // 'todas' | 'cidade' (deep-link) | 'cidade|uf' (select)
  categoria: string // substring na categoria ('' = inativo)
  status: EventStatusFiltro
  pais: PaisFiltro
  /** Valor mínimo (R$): o ingresso mais barato (preco_min) deve ser >= valorMin. */
  valorMin?: number
  // Filtros exatos (deep-link a partir do relatório): '' = não aplica.
  uf?: string
  local?: string
  organizador?: string
  /**
   * Nomes de artistas (de classes selecionadas) para casar no nome do evento.
   * undefined = filtro inativo; [] = ativo sem nenhum nome (não retorna nada).
   */
  artistasNomes?: string[]
  /** Só eventos marcados (favoritos). */
  favoritos?: boolean
  /** Só eventos com pelo menos um artista vinculado (não removido). */
  comArtista?: boolean
  /** Eventos cuja data_inicio cai nos próximos N dias (a partir de agora). */
  proxDias?: number
  /** Só eventos com dado de vendas (vendidos não nulo — ex.: Bileto). */
  comVendas?: boolean
}

export const EVENTS_PAGE_SIZE = 100

function mapEventRow(e: Record<string, unknown>): CrawledEventRow {
  // deno-lint-ignore no-explicit-any
  const links = (e.crawled_event_artists as any[] | null) ?? []
  const artistas = links
    .filter((l) => l && l.removido === false && l.artists)
    .map((l) => ({ id: l.artist_id as string, nome: (l.artists?.nome as string) ?? '' }))
    .filter((a) => a.nome)
  return {
    ...(e as object),
    source_slug: (e.crawler_sources as { slug?: string } | null)?.slug ?? null,
    source_nome: (e.crawler_sources as { nome?: string } | null)?.nome ?? null,
    artistas,
  } as CrawledEventRow
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyEventFilters(
  q: any, f: EventFilters, sourceIdBySlug: Record<string, string>, excludeLocais: string[] = [],
): any {
  let qq = q
  // Oculta eventos de locais marcados como ignorados (crawled_ignored 'local').
  // Mantém eventos SEM local (local_chave null) — senão "NULL not in (...)" os
  // descartaria (ex.: Ticket Sports não tem local).
  if (excludeLocais.length > 0) {
    const quote = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    const list = excludeLocais.map(quote).join(',')
    qq = qq.or(`local_chave.is.null,local_chave.not.in.(${list})`)
  }
  const s = f.search.trim().replace(/[,()*%]/g, ' ').trim()
  if (s) qq = qq.or(`nome.ilike.*${s}*,local_raw.ilike.*${s}*,organizador_raw.ilike.*${s}*`)
  if (f.fonte !== 'todas') qq = qq.eq('source_id', sourceIdBySlug[f.fonte] ?? '00000000-0000-0000-0000-000000000000')
  if (f.cidade !== 'todas') {
    const [c, u] = f.cidade.split('|')
    qq = qq.eq('cidade', c)
    if (u) qq = qq.eq('uf', u)
  }
  if (f.categoria.trim()) qq = qq.ilike('categoria', `%${f.categoria.trim()}%`)
  if (f.valorMin != null && Number.isFinite(f.valorMin)) {
    // O ingresso mais barato (preco_min) deve ser >= valorMin. Quando preco_min
    // é nulo, usa o preco_max como menor preço conhecido.
    qq = qq.or(`preco_min.gte.${f.valorMin},and(preco_min.is.null,preco_max.gte.${f.valorMin})`)
  }
  if (f.status === 'ativos') qq = qq.eq('ignorado', false).is('promovido_crm_event_id', null)
  else if (f.status === 'promovidos') qq = qq.not('promovido_crm_event_id', 'is', null)
  else if (f.status === 'ignorados') qq = qq.eq('ignorado', true)
  if (f.pais === 'brasil') qq = qq.eq('pais', 'Brasil')
  else if (f.pais === 'exterior') qq = qq.not('pais', 'is', null).neq('pais', 'Brasil')
  if (f.uf) qq = qq.eq('uf', f.uf)
  if (f.local) qq = qq.eq('local_raw', f.local)
  if (f.organizador) qq = qq.eq('organizador_raw', f.organizador)
  if (f.favoritos) qq = qq.eq('favorito', true)
  if (f.comVendas) qq = qq.not('vendidos', 'is', null)
  if (f.proxDias != null && f.proxDias > 0) {
    const agora = new Date()
    const fim = new Date(agora.getTime() + f.proxDias * 86_400_000)
    qq = qq.gte('data_inicio', agora.toISOString()).lte('data_inicio', fim.toISOString())
  }
  // Filtro por nome de artista: evento cujo nome contenha algum dos nomes.
  if (f.artistasNomes !== undefined) {
    // Duplas: "Jorge e Mateus" também procura "Jorge & Mateus" (e vice-versa).
    const variantes = (n: string): string[] => {
      const s = new Set([n])
      if (/\se\s/i.test(n)) s.add(n.replace(/\se\s/gi, ' & '))
      if (n.includes('&')) s.add(n.replace(/\s*&\s*/g, ' e '))
      return [...s]
    }
    // Remove vírgulas/parênteses do termo (não estruturam o nome) e escapa os
    // metacaracteres de regex; o match é por palavra inteira via bordas POSIX,
    // então "Alok" casa em "(Alok)", "Alok/Outro", "Alok & X" — mas não "Aloka".
    const escRe = (s: string) => s.replace(/[.^$*+?[\]{}|\\]/g, '\\$&')
    const nomes = [...new Set(
      f.artistasNomes
        .flatMap(variantes)
        .map((n) => n.replace(/[(),%]/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((n) => n.length >= 2),
    )]
    if (nomes.length === 0) {
      qq = qq.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      qq = qq.or(nomes.map((n) => `nome.imatch.[[:<:]]${escRe(n)}[[:>:]]`).join(','))
      // Exclui shows de tributo/cover (não são o artista de fato).
      for (const ex of ['tributo', 'tribute', 'cover']) {
        qq = qq.not('nome', 'ilike', `%${ex}%`)
      }
    }
  }
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

/** Coluna do banco para ordenação da listagem (colunas reais de crawled_events). */
export type EventSortCol =
  | 'nome' | 'data_inicio' | 'local_raw' | 'cidade' | 'categoria'
  | 'preco_min' | 'taxa_pct' | 'vendidos'
export type EventSort = { col: EventSortCol; dir: 'asc' | 'desc' }

export function useCrawledEventsPaged(
  filters: EventFilters,
  page: number,
  pageSize = EVENTS_PAGE_SIZE,
  sort?: EventSort | null,
): UseQueryResult<{ rows: CrawledEventRow[]; total: number }> {
  const orgId = useCrmOrgId()
  const sources = useCrawlerSources()
  const sourceMap = useSourceMap()
  const ignoradosLocais = useIgnorados('local')
  const excludeLocais = useMemo(() => [...(ignoradosLocais.data ?? [])], [ignoradosLocais.data])
  return useQuery({
    enabled: !!orgId && !!sources.data && ignoradosLocais.isSuccess,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'events-paged', orgId, filters, page, pageSize, excludeLocais, sort],
    queryFn: async (): Promise<{ rows: CrawledEventRow[]; total: number }> => {
      const caEmbed = filters.comArtista
        ? 'crawled_event_artists!inner(artist_id, removido, artists(nome))'
        : 'crawled_event_artists(artist_id, removido, artists(nome))'
      let q = supabase
        .from('crawled_events')
        .select(`*, crawler_sources(slug, nome), ${caEmbed}`, { count: 'exact' })
        .eq('org_id', orgId!)
      q = applyEventFilters(q, filters, sourceMap, excludeLocais)
      if (filters.comArtista) q = q.eq('crawled_event_artists.removido', false)
      // Ordenação escolhida (nulos sempre por último) + desempate estável por recência.
      if (sort) q = q.order(sort.col, { ascending: sort.dir === 'asc', nullsFirst: false })
      q = q.order('primeira_vez_visto', { ascending: false })
      const from = page * pageSize
      const { data, error, count } = await q.range(from, from + pageSize - 1)
      if (error) throw new Error(error.message)
      return { rows: (data ?? []).map(mapEventRow), total: count ?? 0 }
    },
  })
}

/** Nomes de artistas do CRM com as classificações selecionadas (A+/A/B/C). */
export function useArtistNamesByClasse(classes: string[]): UseQueryResult<string[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId && classes.length > 0,
    staleTime: 60_000,
    queryKey: ['pesquisa', 'artist-names', orgId, [...classes].sort()],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('artists')
        .select('nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .in('classificacao', classes)
      if (error) throw new Error(error.message)
      return (data ?? []).map((a) => String(a.nome)).filter(Boolean)
    },
  })
}

export function useSourceCounts(): UseQueryResult<Record<string, number>> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'source-counts', orgId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('crawler_source_counts')
      if (error) throw new Error(error.message)
      return (data ?? {}) as Record<string, number>
    },
  })
}

export function useSourceFutureCounts(): UseQueryResult<Record<string, number>> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'source-future-counts', orgId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('crawler_source_future_counts')
      if (error) throw new Error(error.message)
      return (data ?? {}) as Record<string, number>
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

export interface CidadeFacet { cidade: string; uf: string | null }
export function useEventFacets(): UseQueryResult<{ cidades: CidadeFacet[]; ufs: string[] }> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60_000,
    queryKey: ['pesquisa', 'facets', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crawled_event_facets')
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as { cidades?: CidadeFacet[]; ufs?: string[] }
      return { cidades: d.cidades ?? [], ufs: d.ufs ?? [] }
    },
  })
}

/** Busca TODOS os eventos que batem nos filtros (paginando) — p/ exportar. */
export async function fetchAllCrawledEvents(
  orgId: string,
  filters: EventFilters,
  sourceIdBySlug: Record<string, string>,
  excludeLocais: string[] = [],
): Promise<CrawledEventRow[]> {
  const all: CrawledEventRow[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('crawled_events').select('*, crawler_sources(slug, nome)').eq('org_id', orgId)
    q = applyEventFilters(q, filters, sourceIdBySlug, excludeLocais)
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

/** Marca/desmarca um evento como favorito. */
export async function setEventoFavorito(id: string, favorito: boolean): Promise<void> {
  const { error } = await supabase.from('crawled_events').update({ favorito }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Conjunto de chaves marcadas (favoritos) de organizadores ou locais. */
export function useFavoritos(tipo: 'organizador' | 'local'): UseQueryResult<Set<string>> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'favoritos', tipo, orgId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('crawled_favorites')
        .select('chave')
        .eq('org_id', orgId!).eq('tipo', tipo)
      if (error) throw new Error(error.message)
      return new Set((data ?? []).map((r) => String(r.chave)))
    },
  })
}

/** Marca/desmarca um organizador ou local (agregado por chave) como favorito. */
export async function setFavoritoAgregado(
  orgId: string,
  tipo: 'organizador' | 'local',
  chave: string,
  favorito: boolean,
): Promise<void> {
  if (favorito) {
    const { error } = await supabase
      .from('crawled_favorites')
      .upsert({ org_id: orgId, tipo, chave }, { onConflict: 'org_id,tipo,chave' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('crawled_favorites')
      .delete().eq('org_id', orgId).eq('tipo', tipo).eq('chave', chave)
    if (error) throw new Error(error.message)
  }
}

/** Conjunto de chaves ignoradas (descartadas) de organizadores ou locais. */
export function useIgnorados(tipo: 'organizador' | 'local'): UseQueryResult<Set<string>> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'ignorados-agg', tipo, orgId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('crawled_ignored')
        .select('chave')
        .eq('org_id', orgId!).eq('tipo', tipo)
      if (error) throw new Error(error.message)
      return new Set((data ?? []).map((r) => String(r.chave)))
    },
  })
}

/** Ignora/reativa um organizador ou local (agregado por chave). */
export async function setIgnoradoAgregado(
  orgId: string,
  tipo: 'organizador' | 'local',
  chave: string,
  ignorado: boolean,
): Promise<void> {
  if (ignorado) {
    const { error } = await supabase
      .from('crawled_ignored')
      .upsert({ org_id: orgId, tipo, chave }, { onConflict: 'org_id,tipo,chave' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('crawled_ignored')
      .delete().eq('org_id', orgId).eq('tipo', tipo).eq('chave', chave)
    if (error) throw new Error(error.message)
  }
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

// ---------------------------------------------------------------------------
// Promoção de Organizadores e Locais para o CRM
// ---------------------------------------------------------------------------

/** Dados agregados de um organizador/local para promover ao CRM. */
export interface PromoverAggInput {
  /** Chave normalizada (dedupe) — ex.: nome em minúsculas (+ cidade). */
  chave: string
  nome: string
  cidade?: string | null
  uf?: string | null
  precoMin: number | null
  precoMax: number | null
  taxaMediaPct: number | null
  eventos: number
  cidades: string[]
  fontes: string[]
}

/** Registra a promoção (chave -> local_id) depois do local já criado pelo
 *  dialog. Usado pelo fluxo "adicionar ao CRM" que abre o dialog completo. */
export async function registerLocalPromotion(
  orgId: string, chave: string, rotulo: string, localId: string, profileId: string | null,
): Promise<void> {
  const { error } = await supabase.from('crawled_promotions').upsert(
    { org_id: orgId, tipo: 'local', chave, rotulo, local_id: localId, promovido_por: profileId },
    { onConflict: 'org_id,tipo,chave' },
  )
  if (error) throw new Error(error.message)
}

export interface PromocaoRef {
  chave: string
  organization_id: string | null
  local_id: string | null
}

/** Monta as observações com faixa de ingressos e taxa média (pedido do produto). */
function obsPromocao(input: PromoverAggInput): string {
  return [
    'Promovido da Pesquisa.',
    `Faixa de ingressos: ${faixaPreco(input.precoMin, input.precoMax)}`,
    `Taxa média: ${fmtTaxa(input.taxaMediaPct)}`,
    `Eventos capturados: ${input.eventos}`,
    input.cidades.length ? `Cidades: ${input.cidades.join(', ')}` : null,
    input.fontes.length ? `Fontes: ${input.fontes.join(', ')}` : null,
  ].filter(Boolean).join('\n')
}

/** Promove um organizador da Pesquisa para uma Organização do CRM. */
export async function promoverOrganizador(
  orgId: string,
  input: PromoverAggInput,
  profileId: string | null,
): Promise<string> {
  const { data: existente } = await supabase
    .from('crawled_promotions')
    .select('organization_id')
    .eq('org_id', orgId).eq('tipo', 'organizador').eq('chave', input.chave)
    .maybeSingle()
  if (existente?.organization_id) return existente.organization_id as string

  const { data: created, error } = await supabase
    .from('organizations')
    .insert({
      org_id: orgId,
      nome: input.nome,
      cidade: input.cidade ?? null,
      uf: input.uf ?? null,
      origem_lead: 'Pesquisa',
      observacoes: obsPromocao(input),
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  const organizationId = created.id as string

  const { error: linkErr } = await supabase.from('crawled_promotions').upsert(
    { org_id: orgId, tipo: 'organizador', chave: input.chave, rotulo: input.nome, organization_id: organizationId, promovido_por: profileId },
    { onConflict: 'org_id,tipo,chave' },
  )
  if (linkErr) throw new Error(linkErr.message)
  return organizationId
}

/** Promove um local da Pesquisa para um Local (crm_locals) do CRM. */
export async function promoverLocal(
  orgId: string,
  input: PromoverAggInput,
  profileId: string | null,
): Promise<string> {
  const { data: existente } = await supabase
    .from('crawled_promotions')
    .select('local_id')
    .eq('org_id', orgId).eq('tipo', 'local').eq('chave', input.chave)
    .maybeSingle()
  if (existente?.local_id) return existente.local_id as string

  const { data: created, error } = await supabase
    .from('crm_locals')
    .insert({
      org_id: orgId,
      nome: input.nome,
      cidade: input.cidade ?? null,
      uf: input.uf ?? null,
      observacoes: obsPromocao(input),
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  const localId = created.id as string

  const { error: linkErr } = await supabase.from('crawled_promotions').upsert(
    { org_id: orgId, tipo: 'local', chave: input.chave, rotulo: input.nome, local_id: localId, promovido_por: profileId },
    { onConflict: 'org_id,tipo,chave' },
  )
  if (linkErr) throw new Error(linkErr.message)
  return localId
}

/** Mapa chave→promoção para um tipo (organizador|local), p/ marcar já promovidos. */
export function usePromocoes(tipo: 'organizador' | 'local'): UseQueryResult<Map<string, PromocaoRef>> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15_000,
    queryKey: ['pesquisa', 'promocoes', tipo, orgId],
    queryFn: async (): Promise<Map<string, PromocaoRef>> => {
      const { data, error } = await supabase
        .from('crawled_promotions')
        .select('chave, organization_id, local_id')
        .eq('org_id', orgId!).eq('tipo', tipo)
      if (error) throw new Error(error.message)
      const m = new Map<string, PromocaoRef>()
      for (const r of data ?? []) m.set(r.chave as string, r as PromocaoRef)
      return m
    },
  })
}

/** Liga/desliga uma fonte (Gestor). */
export async function setSourceAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('crawler_sources').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Reinicia a varredura de uma fonte do começo (zera offset/cursor). */
export async function resetSourceScan(source: CrawlerSource): Promise<void> {
  const cfg = (source.config ?? {}) as Record<string, unknown>
  const novo: Record<string, unknown> = {
    ...cfg, offset: 0, sitemap_offset: 0, uf_cursor: 0, cursor: null,
  }
  if (cfg.id_topo != null) novo.id_baixo = cfg.id_topo // Bileto volta ao topo
  const { error } = await supabase.from('crawler_sources').update({ config: novo }).eq('id', source.id)
  if (error) throw new Error(error.message)
}

/** Mescla campos no config de uma fonte (preserva offset/cursor/scan etc.). */
export async function saveSourceConfig(
  source: CrawlerSource,
  patch: Record<string, unknown>,
): Promise<void> {
  const novo = { ...(source.config ?? {}), ...patch }
  const { error } = await supabase.from('crawler_sources').update({ config: novo }).eq('id', source.id)
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

/** Aplica as regras de ignorar (ativas) aos eventos já capturados. Retorna nº afetados. */
export async function applyIgnoreRules(): Promise<number> {
  const { data, error } = await supabase.rpc('apply_ignore_rules')
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/** Detecta artistas nos títulos dos eventos capturados (vínculo evento<>artista). */
export async function detectEventArtists(): Promise<number> {
  const { data, error } = await supabase.rpc('detect_event_artists')
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/** Remove manualmente um artista detectado de um evento (não será redetectado). */
export async function removeEventArtist(crawledEventId: string, artistId: string): Promise<void> {
  const { error } = await supabase
    .from('crawled_event_artists')
    .update({ removido: true })
    .eq('crawled_event_id', crawledEventId)
    .eq('artist_id', artistId)
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
