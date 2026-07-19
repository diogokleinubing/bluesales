// Edge Function: dispara uma campanha (ou um teste) via SparkPost.
// Usa a API key da SUBCONTA (SPARKPOST_API_KEY) — os envios já saem isolados na
// subconta do BlueSales, e o webhook da subconta recebe os eventos.
//
// Auth: verify_jwt ON (padrão). As operações no banco usam o JWT do chamador
// (RLS is_member), então só membros disparam. O envio usa a key do ambiente.
//
// Body: { campaignId: uuid, testEmail?: string }
// Deploy: supabase functions deploy email-send-sparkpost

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const API_BASE = Deno.env.get('SPARKPOST_API_BASE') || 'https://api.sparkpost.com'
// Domínio público das landings (conteúdo + descadastro). O link de descadastro
// é preenchido por destinatário via substitution_data ({{unsubscribe_url}}).
const CONTEUDO_BASE = (Deno.env.get('CONTEUDO_BASE_URL') || 'https://conteudo.blueticket.com.br').replace(/\/$/, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const apiKey = Deno.env.get('SPARKPOST_API_KEY')
    if (!apiKey) return json({ error: 'SPARKPOST_API_KEY não configurada' }, 500)

    const auth = req.headers.get('Authorization') ?? ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    })

    const { campaignId, testEmail } = await req.json().catch(() => ({}))
    if (!campaignId) return json({ error: 'missing_campaignId' }, 400)

    // RLS garante que só um membro lê a campanha.
    const { data: c, error: cErr } = await supabase
      .from('email_campaigns')
      .select('id, org_id, nome, assunto, remetente_nome, remetente_email, reply_to, html, status')
      .eq('id', campaignId)
      .maybeSingle()
    if (cErr) return json({ error: cErr.message }, 403)
    if (!c) return json({ error: 'not_found' }, 404)
    if (!c.assunto || !c.html || !c.remetente_email) {
      return json({ error: 'Preencha assunto, conteúdo e remetente antes de enviar.' }, 400)
    }

    const content = {
      from: { email: c.remetente_email, name: c.remetente_nome ?? undefined },
      subject: c.assunto,
      html: c.html,
      reply_to: c.reply_to ?? undefined,
    }

    async function sparkpost(payload: unknown) {
      const r = await fetch(`${API_BASE}/api/v1/transmissions`, {
        method: 'POST',
        headers: { Authorization: apiKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const jr = await r.json().catch(() => ({}))
      return { ok: r.ok, status: r.status, jr }
    }

    // Teste: manda só para um email, sem tocar na fila.
    if (testEmail) {
      const { ok, jr } = await sparkpost({
        options: { open_tracking: true, click_tracking: true, transactional: true },
        content,
        recipients: [{ address: { email: String(testEmail) }, metadata: { test: true }, substitution_data: { nome: '', unsubscribe_url: CONTEUDO_BASE } }],
      })
      if (!ok) return json({ error: jr?.errors?.[0]?.message ?? 'Falha no SparkPost', detail: jr }, 502)
      return json({ ok: true, test: true })
    }

    // Envio real: destinatários na fila.
    const { data: recs, error: rErr } = await supabase
      .from('email_recipients')
      .select('id, email, person_id, persons(nome)')
      .eq('campaign_id', campaignId)
      .eq('status', 'fila')
    if (rErr) return json({ error: rErr.message }, 403)
    if (!recs || recs.length === 0) return json({ error: 'Nenhum destinatário na fila. Use "Preparar envio" primeiro.' }, 400)

    const recipients = recs.map((rc) => {
      const nome = (rc.persons as unknown as { nome?: string } | null)?.nome ?? ''
      return {
        address: { email: rc.email as string, name: nome || undefined },
        metadata: { recipient_id: rc.id },
        substitution_data: { nome, unsubscribe_url: `${CONTEUDO_BASE}/descadastrar/${rc.id}` },
      }
    })

    const { ok, jr } = await sparkpost({
      options: { open_tracking: true, click_tracking: true, transactional: false },
      campaign_id: String(campaignId).slice(0, 64),
      content,
      recipients,
    })
    if (!ok) return json({ error: jr?.errors?.[0]?.message ?? 'Falha no SparkPost', detail: jr }, 502)

    const now = new Date().toISOString()
    const ids = recs.map((rc) => rc.id)
    await supabase.from('email_recipients').update({ status: 'enviado', sent_at: now }).in('id', ids)
    await supabase.from('email_campaigns').update({ status: 'enviada', enviada_em: now }).eq('id', campaignId)
    await supabase.from('email_events').insert(
      recs.map((rc) => ({
        org_id: c.org_id, recipient_id: rc.id, campaign_id: campaignId,
        person_id: rc.person_id, tipo: 'enviado', ocorrido_em: now,
      })),
    )

    // Marca os conteúdos usados nesta news como "utilizado".
    const { data: links } = await supabase.from('email_campaign_conteudos').select('conteudo_id').eq('campaign_id', campaignId)
    const conteudoIds = (links ?? []).map((l) => l.conteudo_id as string)
    if (conteudoIds.length > 0) {
      await supabase.from('crm_conteudos').update({ status: 'utilizado' }).in('id', conteudoIds)
    }

    return json({ ok: true, sent: recs.length, accepted: jr?.results?.total_accepted_recipients ?? null })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
