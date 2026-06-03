import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Task {
  id: string
  org_id: string
  titulo: string
  descricao: string | null
  owner_id: string
  organization_id: string | null
  opportunity_id: string | null
  data_vencimento: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
}

export interface TaskRow extends Task {
  owner_nome: string | null
  organization_nome: string | null
}

export type TaskScope = 'minhas' | 'todas'

export function useTasks(scope: TaskScope, userId: string | null | undefined) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15 * 1000,
    queryKey: ['crm', 'tasks', orgId, scope, userId],
    queryFn: async (): Promise<TaskRow[]> => {
      let q = supabase
        .from('tasks')
        .select('*')
        .eq('org_id', orgId!)
        .order('concluida', { ascending: true })
        .order('data_vencimento', { ascending: true, nullsFirst: false })
      if (scope === 'minhas' && userId) q = q.eq('owner_id', userId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const tasks = (data ?? []) as Task[]

      const orgIds = [...new Set(tasks.map((t) => t.organization_id).filter(Boolean))] as string[]
      const ownerIds = [...new Set(tasks.map((t) => t.owner_id).filter(Boolean))]
      const [orgs, profiles] = await Promise.all([
        orgIds.length
          ? supabase.from('organizations').select('id, nome').in('id', orgIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        ownerIds.length
          ? supabase.from('profiles').select('id, nome').in('id', ownerIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      ])
      const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o.nome]))
      const ownerById = new Map((profiles.data ?? []).map((p) => [p.id, p.nome]))
      return tasks.map((t) => ({
        ...t,
        owner_nome: ownerById.get(t.owner_id) ?? null,
        organization_nome: t.organization_id ? orgById.get(t.organization_id) ?? null : null,
      }))
    },
  })
}

export interface NewTask {
  titulo: string
  descricao?: string | null
  data_vencimento?: string | null
  organization_id?: string | null
  opportunity_id?: string | null
}

export async function createTask(orgId: string, ownerId: string, t: NewTask): Promise<string> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      titulo: t.titulo,
      descricao: t.descricao ?? null,
      data_vencimento: t.data_vencimento ?? null,
      organization_id: t.organization_id ?? null,
      opportunity_id: t.opportunity_id ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function toggleTask(id: string, concluida: boolean) {
  const { error } = await supabase
    .from('tasks')
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
