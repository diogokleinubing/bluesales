import { supabase } from '@/lib/supabase'

/** Registra um evento de login (best-effort; não bloqueia o fluxo). */
export async function logLogin(userId: string, email: string | undefined) {
  try {
    await supabase.from('login_events').insert({
      user_id: userId,
      email: email ?? null,
      user_agent: navigator.userAgent,
    })
  } catch {
    // ignore — log de login nunca deve quebrar o acesso
  }
}
