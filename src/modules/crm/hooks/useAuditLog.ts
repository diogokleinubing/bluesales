import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HistoryEvent {
  id: string
  kind: 'audit' | 'stage'
  action: string
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
  user?: string | null
  at: string
}

/** Histórico (audit_log + stage_history) de uma entidade, mais recente primeiro. */
export function useAuditLog(entityType: string, entityId: string | undefined) {
  return useQuery({
    enabled: !!entityId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'history', entityType, entityId],
    queryFn: async (): Promise<HistoryEvent[]> => {
      const [audit, stages, profiles, stageNames] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, action, field_name, old_value, new_value, user_id, created_at')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId!)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('stage_history')
          .select('id, from_stage_id, to_stage_id, user_id, created_at')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId!)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, nome'),
        supabase.from('funnel_stages').select('id, nome'),
      ])
      const userById = new Map(
        (profiles.data ?? []).map((p) => [p.id, p.nome as string]),
      )
      const stageById = new Map(
        (stageNames.data ?? []).map((s) => [s.id, s.nome as string]),
      )

      const auditEvents: HistoryEvent[] = (audit.data ?? [])
        // stage_change já aparece detalhado em stage_history
        .filter((a) => a.action !== 'stage_change')
        .map((a) => ({
          id: `a-${a.id}`,
          kind: 'audit',
          action: a.action,
          field: a.field_name,
          oldValue: a.old_value,
          newValue: a.new_value,
          user: a.user_id ? userById.get(a.user_id) ?? null : null,
          at: a.created_at,
        }))

      const stageEvents: HistoryEvent[] = (stages.data ?? []).map((s) => ({
        id: `s-${s.id}`,
        kind: 'stage',
        action: 'stage_change',
        oldValue: s.from_stage_id ? stageById.get(s.from_stage_id) ?? null : null,
        newValue: s.to_stage_id ? stageById.get(s.to_stage_id) ?? null : null,
        user: s.user_id ? userById.get(s.user_id) ?? null : null,
        at: s.created_at,
      }))

      return [...auditEvents, ...stageEvents].sort((a, b) =>
        a.at < b.at ? 1 : -1,
      )
    },
  })
}
