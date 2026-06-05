import { supabase } from '@/lib/supabase'

/** Marca um registro como removido (soft delete). */
export async function softDelete(table: string, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from(table) as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Restaura um registro removido (desfaz o soft delete). */
export async function restoreDeleted(table: string, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from(table) as any)
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Mapa entity_type (auditoria) -> tabela, para restaurar a partir do log. */
export const ENTITY_TABLE: Record<string, string> = {
  organization: 'organizations',
  person: 'persons',
  opportunity: 'opportunities',
  crm_event: 'crm_events',
  task: 'tasks',
  activity: 'activities',
  local: 'crm_locals',
  artist: 'artists',
}
