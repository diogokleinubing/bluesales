import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HistoryChange {
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
}

export interface HistoryEntry {
  id: string
  kind: 'audit' | 'stage'
  action: string
  user?: string | null
  at: string
  /** Alterações agrupadas (um update pode mexer em vários campos de uma vez). */
  changes: HistoryChange[]
  /** Observação anexada à mudança de estágio (stage_history.comentario). */
  comentario?: string | null
}

/**
 * Histórico (audit_log + stage_history) de uma entidade, mais recente primeiro.
 * Alterações feitas em conjunto (mesmo usuário e horário) são agrupadas em um
 * único registro para facilitar a leitura.
 */
export function useAuditLog(entityType: string, entityId: string | undefined) {
  return useQuery({
    enabled: !!entityId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'history', entityType, entityId],
    queryFn: async (): Promise<HistoryEntry[]> => {
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
          .select('id, from_stage_id, to_stage_id, user_id, created_at, comentario')
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

      const entries: HistoryEntry[] = []

      // Agrupa updates por (usuário + horário); create/delete ficam isolados.
      const updateGroups = new Map<string, HistoryEntry>()
      for (const a of audit.data ?? []) {
        if (a.action === 'stage_change') continue // detalhado em stage_history
        const user = a.user_id ? userById.get(a.user_id) ?? null : null
        if (a.action === 'update') {
          const key = `${a.user_id ?? ''}__${a.created_at}`
          let entry = updateGroups.get(key)
          if (!entry) {
            entry = {
              id: `g-${key}`,
              kind: 'audit',
              action: 'update',
              user,
              at: a.created_at,
              changes: [],
            }
            updateGroups.set(key, entry)
            entries.push(entry)
          }
          entry.changes.push({
            field: a.field_name,
            oldValue: a.old_value,
            newValue: a.new_value,
          })
        } else {
          entries.push({
            id: `a-${a.id}`,
            kind: 'audit',
            action: a.action,
            user,
            at: a.created_at,
            changes: [],
          })
        }
      }

      for (const s of stages.data ?? []) {
        entries.push({
          id: `s-${s.id}`,
          kind: 'stage',
          action: 'stage_change',
          user: s.user_id ? userById.get(s.user_id) ?? null : null,
          at: s.created_at,
          comentario: (s as { comentario?: string | null }).comentario ?? null,
          changes: [
            {
              oldValue: s.from_stage_id ? stageById.get(s.from_stage_id) ?? null : null,
              newValue: s.to_stage_id ? stageById.get(s.to_stage_id) ?? null : null,
            },
          ],
        })
      }

      return entries.sort((a, b) => (a.at < b.at ? 1 : -1))
    },
  })
}
