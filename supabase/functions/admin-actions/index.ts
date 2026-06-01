// Edge Function: ações administrativas privilegiadas (requer service_role).
//
// Ações (body JSON { action, userId }):
//   - reset_password: define uma senha temporária para o usuário e marca
//     must_change_password=true (força troca no próximo login). Retorna a
//     senha temporária para o admin repassar.
//   - disable_mfa: remove os fatores TOTP do usuário (força recriar o 2FA).
//
// Segurança: só executa se o CHAMADOR for admin (profiles.is_admin). O JWT do
// chamador vem no header Authorization; a service_role nunca chega ao cliente.
//
// Deploy:
//   supabase functions deploy admin-actions
//   (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetadas pelo runtime)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Senha temporária forte: 12 chars (maiúsc/minúsc/dígito/símbolo). */
function tempPassword(): string {
  const sets = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnpqrstuvwxyz',
    '23456789',
    '!@#$%&*?',
  ]
  const all = sets.join('')
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  // Garante ao menos um de cada conjunto.
  const chars = sets.map((s, i) => s[bytes[i] % s.length])
  for (let i = 4; i < 12; i++) chars.push(all[bytes[i] % all.length])
  // Embaralha (Fisher-Yates com bytes adicionais).
  const shuffle = new Uint32Array(chars.length)
  crypto.getRandomValues(shuffle)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // Cliente admin (service_role) — todo o trabalho privilegiado passa por aqui.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1) Identifica o chamador a partir do JWT.
  const token = authHeader.replace('Bearer ', '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) {
    return json({ error: 'Não autenticado' }, 401)
  }

  // 2) Confirma que o chamador é admin.
  const { data: prof } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (!prof?.is_admin) {
    return json({ error: 'Acesso restrito a administradores' }, 403)
  }

  // 3) Lê a ação.
  let body: { action?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }
  const { action, userId } = body
  if (!userId) return json({ error: 'userId é obrigatório' }, 400)
  if (userId === caller.user.id) {
    return json({ error: 'Use a sua própria tela de conta para isto.' }, 400)
  }

  if (action === 'reset_password') {
    const senha = tempPassword()
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: senha,
    })
    if (upErr) return json({ error: upErr.message }, 400)

    const { error: flagErr } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId)
    if (flagErr) return json({ error: flagErr.message }, 400)

    return json({ ok: true, tempPassword: senha })
  }

  if (action === 'disable_mfa') {
    const { data: factors, error: listErr } =
      await admin.auth.admin.mfa.listFactors({ userId })
    if (listErr) return json({ error: listErr.message }, 400)
    let removed = 0
    for (const f of factors?.factors ?? []) {
      const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
        userId,
        id: f.id,
      })
      if (delErr) return json({ error: delErr.message }, 400)
      removed++
    }
    return json({ ok: true, removed })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})
