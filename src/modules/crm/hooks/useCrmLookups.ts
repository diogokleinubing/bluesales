import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Lookup {
  id: string
  nome: string
}

export interface GmvOption extends Lookup {
  gmv: number | null
}

/** Organizações com GMV anual (para copiar para a oportunidade). */
export function useOrgGmvOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'orgs-gmv', orgId],
    queryFn: async (): Promise<GmvOption[]> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, nome, gmv_anual')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []).map((o) => ({ id: o.id, nome: o.nome, gmv: o.gmv_anual }))
    },
  })
}

/** Eventos com GMV estimado (para vincular e copiar para a oportunidade). */
export function useEventGmvOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'events-gmv', orgId],
    queryFn: async (): Promise<GmvOption[]> => {
      const { data, error } = await supabase
        .from('crm_events')
        .select('id, nome, gmv_estimado')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []).map((e) => ({ id: e.id, nome: e.nome, gmv: e.gmv_estimado }))
    },
  })
}

export function useOrgOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'orgs', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}

export function usePersonOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'persons', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('persons')
        .select('id, nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}

/** Oportunidades de uma organização (para vincular atividades). */
export function useOppOptions(organizationId: string | null | undefined) {
  return useQuery({
    enabled: !!organizationId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'opps', organizationId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, titulo')
        .eq('organization_id', organizationId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((o) => ({ id: o.id, nome: o.titulo }))
    },
  })
}

export function useGeneroOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'generos', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('generos')
        .select('id, nome')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}

export function useSegmentOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'segments', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('segments')
        .select('id, nome')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}

export function useLocalOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'locais', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('crm_locals')
        .select('id, nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}

export type EntityTipo = 'org' | 'local' | 'evento' | 'artista'
export interface EntityOption {
  id: string
  nome: string
  tipo: EntityTipo
  /** Organização relacionada (para resolver a oportunidade / vínculo). */
  organization_id: string | null
}

/** Lista combinada de Organizações, Locais, Eventos e Artistas (busca de entidade). */
export function useEntities() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'entities', orgId],
    queryFn: async (): Promise<EntityOption[]> => {
      const [orgs, locs, evs, arts] = await Promise.all([
        supabase.from('organizations').select('id, nome').eq('org_id', orgId!).is('deleted_at', null).order('nome'),
        supabase.from('crm_locals').select('id, nome').eq('org_id', orgId!).is('deleted_at', null).order('nome'),
        supabase.from('crm_events').select('id, nome, organization_id').eq('org_id', orgId!).is('deleted_at', null).order('nome'),
        supabase.from('artists').select('id, nome, organization_id').eq('org_id', orgId!).is('deleted_at', null).order('nome'),
      ])
      const out: EntityOption[] = []
      for (const o of orgs.data ?? []) out.push({ id: o.id, nome: o.nome, tipo: 'org', organization_id: o.id })
      for (const l of locs.data ?? []) out.push({ id: l.id, nome: l.nome, tipo: 'local', organization_id: null })
      for (const e of evs.data ?? []) out.push({ id: e.id, nome: e.nome, tipo: 'evento', organization_id: (e as { organization_id: string | null }).organization_id })
      for (const a of arts.data ?? []) out.push({ id: a.id, nome: a.nome, tipo: 'artista', organization_id: (a as { organization_id: string | null }).organization_id })
      return out
    },
  })
}

export interface OpenOpp { id: string; titulo: string; stage: string | null; organization_id: string | null }

/** Oportunidade em aberto vinculada a uma entidade (ou null). */
export async function findOpenOpportunity(tipo: EntityTipo, id: string, organizationId: string | null): Promise<OpenOpp | null> {
  let q = supabase.from('opportunities')
    .select('id, titulo, organization_id, funnel_stages(nome)')
    .is('deleted_at', null).is('resultado', null)
    .order('created_at', { ascending: false }).limit(1)
  if (tipo === 'org') q = q.eq('organization_id', id)
  else if (tipo === 'local') q = q.eq('local_id', id)
  else if (tipo === 'evento') q = q.eq('crm_event_id', id)
  else { if (!organizationId) return null; q = q.eq('organization_id', organizationId) }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const o = data?.[0]
  if (!o) return null
  return { id: o.id, titulo: o.titulo, stage: (o.funnel_stages as unknown as { nome: string } | null)?.nome ?? null, organization_id: o.organization_id }
}

export function useArtistOptions() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'lookup', 'artists', orgId],
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}
