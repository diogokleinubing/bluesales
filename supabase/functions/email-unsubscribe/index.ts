// Edge Function pública: processa o descadastro (opt-out) de um destinatário.
// Chamada pela landing /descadastrar/:rid (fetch do front) e utilizável por
// clientes de email que suportam List-Unsubscribe (POST direto). Idempotente.
//
// Identifica pelo recipient_id (UUID não-enumerável, como o conteudo-publico).
// Insere a supressão global (email_suppressions), que o prepareSend honra em
// todo disparo futuro. Usa service_role (tabelas seguem sob RLS is_member()).
//
// Deploy (público, sem exigir JWT):
//   supabase functions deploy email-unsubscribe --no-verify-jwt
//   (ou config.toml: [functions.email-unsubscribe] verify_jwt = false)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    let rid = url.searchParams.get('r') || url.searchParams.get('rid') || ''
    if (!rid && req.method === 'POST') {
      const b = await req.json().catch(() => ({}))
      rid = (b?.rid || b?.r || '') as string
    }
    rid = rid.trim()
    if (!rid) return json({ error: 'missing_recipient' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: rec } = await supabase
      .from('email_recipients')
      .select('id, org_id, campaign_id, person_id, email, unsubscribed_at')
      .eq('id', rid)
      .maybeSingle()
    if (!rec) return json({ error: 'not_found' }, 404)

    const email = String(rec.email)
    const now = new Date().toISOString()

    // Supressão global (idempotente) — honrada em todo disparo (prepareSend).
    await supabase.from('email_suppressions').upsert(
      { org_id: rec.org_id, email, person_id: rec.person_id, motivo: 'optout', campaign_id: rec.campaign_id },
      { onConflict: 'org_id,email', ignoreDuplicates: true },
    )

    // Carimba e registra o evento só na primeira vez (evita duplicar no refresh).
    if (!rec.unsubscribed_at) {
      await supabase.from('email_recipients').update({ unsubscribed_at: now }).eq('id', rid)
      await supabase.from('email_events').insert({
        org_id: rec.org_id, recipient_id: rid, campaign_id: rec.campaign_id,
        person_id: rec.person_id, tipo: 'descadastro', ocorrido_em: now,
      })
    }

    return json({ ok: true, email })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
