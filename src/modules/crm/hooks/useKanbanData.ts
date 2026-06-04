import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface KanbanCard {
  id: string
  stageId: string | null
  title: string
  subtitle?: string | null
  badge?: string | null
  meta?: string | null
  status?: string | null
  href: string
}

/** Organizações para o Kanban de relacionamento. */
export function useOrgsKanban() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'kanban', 'orgs', orgId],
    queryFn: async (): Promise<KanbanCard[]> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, nome, cidade, uf, classificacao, status_comercial, funil_stage_id')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []).map((o) => ({
        id: o.id,
        stageId: o.funil_stage_id,
        title: o.nome,
        badge: o.classificacao,
        subtitle: [o.cidade, o.uf].filter(Boolean).join('/') || null,
        status: o.status_comercial,
        href: `/comercial/organizacoes/${o.id}`,
      }))
    },
  })
}

/** Oportunidades para o Kanban de oportunidades. */
export function useOppsKanban() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'kanban', 'opps', orgId],
    queryFn: async (): Promise<KanbanCard[]> => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, titulo, gmv_estimado, stage_id, data_prevista_fechamento, organizations(nome)')
        .eq('org_id', orgId!)
        .is('resultado', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((o) => {
        const org = (o.organizations as { nome?: string } | null) ?? null
        return {
          id: o.id,
          stageId: o.stage_id,
          title: o.titulo,
          subtitle: org?.nome ?? null,
          meta: o.gmv_estimado != null ? Number(o.gmv_estimado).toString() : null,
          href: `/comercial/oportunidades/${o.id}`,
        }
      })
    },
  })
}

/** Move um card para outro estágio (o trigger registra stage_history/audit). */
export async function moveCardStage(
  kind: 'org' | 'opp',
  id: string,
  stageId: string | null,
) {
  const table = kind === 'org' ? 'organizations' : 'opportunities'
  const col = kind === 'org' ? 'funil_stage_id' : 'stage_id'
  if (kind === 'opp' && stageId == null) {
    throw new Error('Oportunidade precisa de um estágio.')
  }
  const { error } = await supabase
    .from(table)
    .update({ [col]: stageId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
