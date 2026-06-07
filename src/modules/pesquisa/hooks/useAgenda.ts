import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from '@/modules/crm/hooks/useFunnelStages'

// ---------------------------------------------------------------------------
// Agenda oficial dos artistas
// ---------------------------------------------------------------------------
export interface AgendaArtist {
  id: string
  nome: string
  agenda_url: string | null
  total: number
  futuros: number
  ultima_captura: string | null
}

export interface AgendaEventRow {
  id: string
  artist_id: string
  artist_nome: string | null
  nome: string
  data: string | null
  hora: string | null
  local_raw: string | null
  cidade: string | null
  uf: string | null
  site_url: string | null
  link_sale: string | null
  promovido_crm_event_id: string | null
}

/** Artistas que têm URL de agenda configurada (+ contadores). */
export function useAgendaArtists(): UseQueryResult<AgendaArtist[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'agenda-artists', orgId],
    queryFn: async (): Promise<AgendaArtist[]> => {
      const { data: artists, error } = await supabase
        .from('artists')
        .select('id, nome, agenda_url')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .not('agenda_url', 'is', null)
        .order('nome')
      if (error) throw new Error(error.message)
      const ids = (artists ?? []).map((a) => a.id as string)
      if (ids.length === 0) return []
      const { data: evs } = await supabase
        .from('artist_agenda_events')
        .select('artist_id, data, updated_at')
        .in('artist_id', ids)
      const hoje = new Date().toISOString().slice(0, 10)
      const agg = new Map<string, { total: number; futuros: number; ultima: string | null }>()
      for (const e of evs ?? []) {
        const a = agg.get(e.artist_id as string) ?? { total: 0, futuros: 0, ultima: null }
        a.total++
        if ((e.data as string | null) && (e.data as string) >= hoje) a.futuros++
        const u = e.updated_at as string | null
        if (u && (!a.ultima || u > a.ultima)) a.ultima = u
        agg.set(e.artist_id as string, a)
      }
      return (artists ?? []).map((a) => {
        const x = agg.get(a.id as string)
        return {
          id: a.id as string,
          nome: a.nome as string,
          agenda_url: (a.agenda_url as string | null) ?? null,
          total: x?.total ?? 0,
          futuros: x?.futuros ?? 0,
          ultima_captura: x?.ultima ?? null,
        }
      })
    },
  })
}

/** Artistas (busca) para configurar uma URL de agenda. */
export function useArtistasBusca(termo: string): UseQueryResult<{ id: string; nome: string; agenda_url: string | null }[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId && termo.trim().length >= 2,
    staleTime: 10_000,
    queryKey: ['pesquisa', 'artistas-busca', orgId, termo.trim()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, nome, agenda_url')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .ilike('nome', `%${termo.trim()}%`)
        .order('nome')
        .limit(20)
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; nome: string; agenda_url: string | null }[]
    },
  })
}

/** Shows capturados da agenda (opcionalmente de um artista). */
export function useAgendaEvents(artistId: string | null): UseQueryResult<AgendaEventRow[]> {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 20_000,
    queryKey: ['pesquisa', 'agenda-events', orgId, artistId],
    queryFn: async (): Promise<AgendaEventRow[]> => {
      let q = supabase
        .from('artist_agenda_events')
        .select('*, artists(nome)')
        .eq('org_id', orgId!)
        .order('data', { ascending: true })
        .limit(2000)
      if (artistId) q = q.eq('artist_id', artistId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []).map((e: Record<string, unknown>) => ({
        ...(e as object),
        artist_nome: (e.artists as { nome?: string } | null)?.nome ?? null,
      })) as AgendaEventRow[]
    },
  })
}

// ---------------------------------------------------------------------------
// Agenda unificada de um artista (oficial + plataformas), mesclada por data
// ---------------------------------------------------------------------------
export interface UnifiedAgendaRow {
  key: string
  data: string | null
  nome: string
  cidade: string | null
  uf: string | null
  local: string | null
  oficial: { link: string | null } | null
  plataformas: { nome: string; url: string }[]
}

/**
 * Data-calendário (AAAA-MM-DD) de um evento no fuso do Brasil. As plataformas
 * gravam data_inicio como timestamptz (ex.: "...T22:00:00-03:00"), que no banco
 * vira UTC; fatiar a string em UTC adianta 1 dia para shows após 21h. Converte
 * para America/Sao_Paulo para casar com a data da agenda oficial (coluna date).
 */
function dataBR(iso: string | null | undefined): string | null {
  if (!iso) return null
  const only = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (only) return iso // já é data pura
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d) // en-CA -> "AAAA-MM-DD"
}

export function useArtistUnifiedAgenda(artistId: string | null): UseQueryResult<UnifiedAgendaRow[]> {
  return useQuery({
    enabled: !!artistId,
    staleTime: 20_000,
    queryKey: ['comercial', 'artist-agenda-unificada', artistId],
    queryFn: async (): Promise<UnifiedAgendaRow[]> => {
      const [oficial, plat] = await Promise.all([
        supabase.from('artist_agenda_events')
          .select('id, nome, data, cidade, uf, local_raw, site_url, link_sale')
          .eq('artist_id', artistId!),
        supabase.from('crawled_event_artists')
          .select('crawled_events(id, nome, data_inicio, cidade, uf, local_raw, url_evento, ignorado, crawler_sources(nome, slug))')
          .eq('artist_id', artistId!).eq('removido', false),
      ])
      if (oficial.error) throw new Error(oficial.error.message)
      if (plat.error) throw new Error(plat.error.message)

      const map = new Map<string, UnifiedAgendaRow>()
      const keyOf = (data: string | null, id: string) => (data ? `d:${data}` : `i:${id}`)
      const get = (k: string, base: Partial<UnifiedAgendaRow>): UnifiedAgendaRow => {
        let r = map.get(k)
        if (!r) {
          r = { key: k, data: null, nome: '', cidade: null, uf: null, local: null, oficial: null, plataformas: [], ...base } as UnifiedAgendaRow
          map.set(k, r)
        }
        return r
      }

      for (const o of oficial.data ?? []) {
        const data = (o.data as string | null) ?? null
        const k = keyOf(data, o.id as string)
        const r = get(k, { data, nome: o.nome as string, cidade: (o.cidade as string) ?? null, uf: (o.uf as string) ?? null, local: (o.local_raw as string) ?? null })
        r.oficial = { link: (o.link_sale as string) || (o.site_url as string) || null }
        if (!r.nome) r.nome = o.nome as string
      }

      for (const row of plat.data ?? []) {
        // deno-lint-ignore no-explicit-any
        const ce = (row as any).crawled_events
        if (!ce || ce.ignorado) continue
        const data = dataBR(ce.data_inicio as string | null)
        const k = keyOf(data, ce.id as string)
        const r = get(k, { data, nome: ce.nome as string, cidade: ce.cidade ?? null, uf: ce.uf ?? null, local: ce.local_raw ?? null })
        const nome = ce.crawler_sources?.nome ?? ce.crawler_sources?.slug ?? 'Plataforma'
        if (!r.plataformas.some((p) => p.url === ce.url_evento)) {
          r.plataformas.push({ nome, url: ce.url_evento as string })
        }
        if (!r.nome) r.nome = ce.nome as string
        if (!r.cidade && ce.cidade) { r.cidade = ce.cidade; r.uf = ce.uf ?? null }
      }

      return [...map.values()].sort((a, b) => (a.data ?? '~').localeCompare(b.data ?? '~'))
    },
  })
}

export async function setAgendaUrl(artistId: string, url: string | null): Promise<void> {
  const { error } = await supabase.from('artists').update({ agenda_url: url }).eq('id', artistId)
  if (error) throw new Error(error.message)
}

/** Dispara a captura de agenda (Edge Function). Sem id roda todos. */
export async function runAgenda(artistId?: string): Promise<unknown> {
  const body: Record<string, unknown> = {}
  if (artistId) body.artist_id = artistId
  const { data, error } = await supabase.functions.invoke('artist-agenda-run', { body })
  if (error) throw new Error(error.message)
  return data
}

/** Copia um show da agenda para o CRM (crm_events) e marca como promovido. */
export async function promoverAgendaEvento(
  orgId: string,
  ev: AgendaEventRow,
  profileId: string | null,
): Promise<string> {
  if (ev.promovido_crm_event_id) return ev.promovido_crm_event_id
  const obs = [
    `Copiado da Agenda oficial${ev.artist_nome ? ` de ${ev.artist_nome}` : ''}.`,
    ev.local_raw ? `Local: ${ev.local_raw}` : null,
    ev.cidade ? `Cidade: ${ev.cidade}${ev.uf ? `/${ev.uf}` : ''}` : null,
    ev.site_url ? `Site oficial: ${ev.site_url}` : null,
    ev.link_sale ? `Vendas: ${ev.link_sale}` : null,
  ].filter(Boolean).join('\n')

  const { data: created, error } = await supabase
    .from('crm_events')
    .insert({
      org_id: orgId,
      nome: ev.nome,
      data_prevista: ev.data,
      site: ev.link_sale ?? ev.site_url,
      observacoes: obs,
      status: 'Planejado',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const crmId = created.id as string
  const { error: linkErr } = await supabase
    .from('artist_agenda_events')
    .update({ promovido_crm_event_id: crmId, promovido_em: new Date().toISOString(), promovido_por: profileId })
    .eq('id', ev.id)
  if (linkErr) throw new Error(linkErr.message)
  return crmId
}
