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

/**
 * Reseta a senha de outro usuário (via Edge Function admin-actions).
 * Retorna a senha temporária; o usuário será forçado a trocá-la no login.
 */
export async function resetUserPassword(userId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action: 'reset_password', userId },
  })
  if (error) throw new Error(await edgeError(error))
  if (!data?.tempPassword) throw new Error('Resposta inesperada do servidor.')
  return data.tempPassword as string
}

/** Desliga o 2FA de outro usuário (força recriar no próximo login). */
export async function disableUserMfa(userId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action: 'disable_mfa', userId },
  })
  if (error) throw new Error(await edgeError(error))
  return Number(data?.removed ?? 0)
}

/** Extrai a mensagem de erro do corpo da Edge Function quando disponível. */
async function edgeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch {
      /* ignore */
    }
  }
  return (error as Error).message
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
