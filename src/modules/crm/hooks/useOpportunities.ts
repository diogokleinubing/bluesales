import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Opportunity {
  id: string
  org_id: string
  titulo: string
  organization_id: string
  crm_event_id: string | null
  artist_id: string | null
  stage_id: string
  owner_id: string
  data_prevista_fechamento: string | null
  gmv_estimado: number | null
  probabilidade: number | null
  observacoes: string | null
  resultado: 'Ganho' | 'Perdida' | null
  resultado_em: string | null
  created_at: string
  updated_at: string
}

export interface OppListRow extends Opportunity {
  orgNome: string | null
  stageNome: string | null
  stageCor: string | null
  ownerNome: string | null
}

async function enrich(rows: Opportunity[]): Promise<OppListRow[]> {
  const [orgs, stages, profiles] = await Promise.all([
    supabase.from('organizations').select('id, nome'),
    supabase.from('funnel_stages').select('id, nome, cor'),
    supabase.from('profiles').select('id, nome'),
  ])
  const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o.nome as string]))
  const stageById = new Map((stages.data ?? []).map((s) => [s.id, s]))
  const ownerById = new Map((profiles.data ?? []).map((p) => [p.id, p.nome as string]))
  return rows.map((o) => {
    const st = stageById.get(o.stage_id)
    return {
      ...o,
      orgNome: orgById.get(o.organization_id) ?? null,
      stageNome: st?.nome ?? null,
      stageCor: st?.cor ?? null,
      ownerNome: ownerById.get(o.owner_id) ?? null,
    }
  })
}

export function useOpportunities(organizationId?: string) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'opportunities', orgId, organizationId ?? 'all'],
    queryFn: async (): Promise<OppListRow[]> => {
      let q = supabase
        .from('opportunities')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
      if (organizationId) q = q.eq('organization_id', organizationId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return enrich((data ?? []) as Opportunity[])
    },
  })
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'opportunity', id],
    queryFn: async (): Promise<Opportunity | null> => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Opportunity) ?? null
    },
  })
}

export async function createOpportunity(
  orgId: string,
  ownerId: string,
  patch: { titulo: string; organization_id: string; stage_id: string } & Partial<Opportunity>,
): Promise<string> {
  const { data, error } = await supabase
    .from('opportunities')
    .insert({ org_id: orgId, owner_id: ownerId, ...patch })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateOpportunity(id: string, patch: Partial<Opportunity>) {
  const { error } = await supabase
    .from('opportunities')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Define o resultado (Ganho/Perdida) ou reabre a oportunidade (null). */
export async function setOpportunityOutcome(id: string, resultado: 'Ganho' | 'Perdida' | null) {
  const { error } = await supabase
    .from('opportunities')
    .update({
      resultado,
      resultado_em: resultado ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteOpportunity(id: string) {
  // Objeções são polimórficas (sem FK), então limpamos antes do cascade.
  await supabase
    .from('entity_objections')
    .delete()
    .eq('entity_type', 'opportunity')
    .eq('entity_id', id)
  const { error } = await supabase.from('opportunities').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
