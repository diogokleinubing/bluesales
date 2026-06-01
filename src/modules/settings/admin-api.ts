import { supabase } from '@/lib/supabase'
import type { LoginEventRow, ProfileRow } from '@/lib/database.types'

/** Lista os perfis (visível só para admin via RLS). */
export async function fetchProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('email')
  if (error) throw new Error(error.message)
  return (data ?? []) as ProfileRow[]
}

/** Define/retira o papel admin de um usuário. */
export async function setAdmin(id: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_admin: isAdmin })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Log de logins, mais recentes primeiro (só admin lê). */
export async function fetchLoginEvents(limit = 200): Promise<LoginEventRow[]> {
  const { data, error } = await supabase
    .from('login_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as LoginEventRow[]
}
