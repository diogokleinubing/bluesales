import { useQuery } from '@tanstack/react-query'
import { useDefaultOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase'

export type FunnelSlug = 'relacionamento' | 'oportunidade'

export interface FunnelType {
  id: string
  org_id: string
  slug: FunnelSlug
  nome: string
}

export interface FunnelStage {
  id: string
  org_id: string
  funnel_type_id: string
  nome: string
  sequencia: number
  cor: string | null
  ativo: boolean
}

export function useCrmOrgId() {
  return useDefaultOrg().data?.id as string | undefined
}

/** Tipo de funil + seus estágios (ordenados por sequência). */
export function useFunnel(slug: FunnelSlug) {
  const orgId = useCrmOrgId()
  const query = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'funnel', orgId, slug],
    queryFn: async (): Promise<{ type: FunnelType | null; stages: FunnelStage[] }> => {
      const { data: ft, error: e1 } = await supabase
        .from('funnel_types')
        .select('*')
        .eq('org_id', orgId!)
        .eq('slug', slug)
        .maybeSingle()
      if (e1) throw new Error(e1.message)
      if (!ft) return { type: null, stages: [] }
      const { data: stages, error: e2 } = await supabase
        .from('funnel_stages')
        .select('*')
        .eq('funnel_type_id', ft.id)
        .order('sequencia')
      if (e2) throw new Error(e2.message)
      return { type: ft as FunnelType, stages: (stages ?? []) as FunnelStage[] }
    },
  })
  return {
    ...query,
    type: query.data?.type ?? null,
    stages: query.data?.stages ?? [],
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export async function addStage(
  orgId: string,
  funnelTypeId: string,
  nome: string,
  cor: string | null,
  sequencia: number,
) {
  const { error } = await supabase
    .from('funnel_stages')
    .insert({ org_id: orgId, funnel_type_id: funnelTypeId, nome, cor, sequencia })
  if (error) throw new Error(error.message)
}

export async function updateStage(
  id: string,
  patch: Partial<Pick<FunnelStage, 'nome' | 'cor' | 'ativo'>>,
) {
  const { error } = await supabase.from('funnel_stages').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Reordena via RPC (ids na ordem desejada). */
export async function reorderStages(ids: string[]) {
  const { error } = await supabase.rpc('crm_reorder_funnel_stages', { p_ids: ids })
  if (error) throw new Error(error.message)
}

/** Quantos registros usam este estágio (para bloquear exclusão). */
export async function stageUsage(stageId: string): Promise<number> {
  const [orgs, persons, opps] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('funil_stage_id', stageId).is('deleted_at', null),
    supabase.from('persons').select('id', { count: 'exact', head: true }).eq('funil_stage_id', stageId).is('deleted_at', null),
    supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('stage_id', stageId).is('deleted_at', null),
  ])
  return (orgs.count ?? 0) + (persons.count ?? 0) + (opps.count ?? 0)
}
