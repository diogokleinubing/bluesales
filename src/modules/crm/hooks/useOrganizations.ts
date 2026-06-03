import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Organization {
  id: string
  org_id: string
  nome: string
  cidade: string | null
  uf: string | null
  gmv_anual: number | null
  classificacao: string | null
  origem_lead: string | null
  sociedade: string | null
  estrutura: string | null
  funil_stage_id: string | null
  bi_organizador: string | null
  created_at: string
  updated_at: string
}

export interface OrgListRow extends Organization {
  stageNome: string | null
  stageCor: string | null
  ultimaAtividade: string | null
}

export function useOrganizations() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'organizations', orgId],
    queryFn: async (): Promise<OrgListRow[]> => {
      const [orgs, stages, acts] = await Promise.all([
        supabase
          .from('organizations')
          .select('*')
          .eq('org_id', orgId!)
          .order('nome'),
        supabase.from('funnel_stages').select('id, nome, cor'),
        supabase
          .from('activities')
          .select('organization_id, data_hora')
          .eq('org_id', orgId!)
          .not('organization_id', 'is', null),
      ])
      if (orgs.error) throw new Error(orgs.error.message)
      const stageById = new Map(
        (stages.data ?? []).map((s) => [s.id, s]),
      )
      const lastAct = new Map<string, string>()
      for (const a of acts.data ?? []) {
        const k = a.organization_id as string
        const d = a.data_hora as string
        if (!lastAct.has(k) || d > lastAct.get(k)!) lastAct.set(k, d)
      }
      return (orgs.data ?? []).map((o) => {
        const st = o.funil_stage_id ? stageById.get(o.funil_stage_id) : null
        return {
          ...(o as Organization),
          stageNome: st?.nome ?? null,
          stageCor: st?.cor ?? null,
          ultimaAtividade: lastAct.get(o.id) ?? null,
        }
      })
    },
  })
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'organization', id],
    queryFn: async (): Promise<Organization | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Organization) ?? null
    },
  })
}

export async function createOrganization(
  orgId: string,
  patch: Partial<Organization>,
): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({ org_id: orgId, nome: patch.nome, ...patch })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateOrganization(
  id: string,
  patch: Partial<Organization>,
) {
  const { error } = await supabase
    .from('organizations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteOrganization(id: string) {
  // Objeções são polimórficas (sem FK), então limpamos antes do cascade.
  await supabase
    .from('entity_objections')
    .delete()
    .eq('entity_type', 'organization')
    .eq('entity_id', id)
  const { error } = await supabase.from('organizations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
