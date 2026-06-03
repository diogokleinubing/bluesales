import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Lookup {
  id: string
  nome: string
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
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((o) => ({ id: o.id, nome: o.titulo }))
    },
  })
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
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Lookup[]
    },
  })
}
