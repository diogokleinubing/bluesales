// Edge Function pública: recebe os eventos de email do SparkPost (webhook da
// SUBCONTA do BlueSales) e atualiza email_recipients / email_events / supressões.
// Correlação evento -> destinatário pelo metadata { recipient_id } injetado no
// envio. Valida um segredo compartilhado (SPARKPOST_WEBHOOK_SECRET) no header.
//
// Deploy: supabase functions deploy email-webhook-sparkpost --no-verify-jwt
//   (ou config.toml: [functions.email-webhook-sparkpost] verify_jwt = false)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// SparkPost event type -> (status do destinatário, tipo do evento, supressão).
type Map = { status?: string; tipo: string; sup?: 'bounce' | 'reclamacao' | 'optout'; stamp?: 'delivered_at' | 'opened_at' | 'clicked_at' | 'unsubscribed_at' }
const TYPE_MAP: Record<string, Map> = {
  delivery: { status: 'entregue', tipo: 'entregue', stamp: 'delivered_at' },
  bounce: { status: 'bounce', tipo: 'bounce', sup: 'bounce' },
  out_of_band: { status: 'bounce', tipo: 'bounce', sup: 'bounce' },
  spam_complaint: { status: 'reclamacao', tipo: 'reclamacao', sup: 'reclamacao' },
  policy_rejection: { status: 'falha', tipo: 'falha' },
  generation_failure: { status: 'falha', tipo: 'falha' },
  generation_rejection: { status: 'falha', tipo: 'falha' },
  open: { tipo: 'aberto', stamp: 'opened_at' },
  initial_open: { tipo: 'aberto', stamp: 'opened_at' },
  amp_open: { tipo: 'aberto', stamp: 'opened_at' },
  click: { tipo: 'clique', stamp: 'clicked_at' },
  amp_click: { tipo: 'clique', stamp: 'clicked_at' },
  list_unsubscribe: { tipo: 'descadastro', sup: 'optout', stamp: 'unsubscribed_at' },
  link_unsubscribe: { tipo: 'descadastro', sup: 'optout', stamp: 'unsubscribed_at' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('SPARKPOST_WEBHOOK_SECRET')
  if (secret) {
    const got = req.headers.get('authorization') || req.headers.get('x-webhook-secret') || ''
    if (got !== secret && got !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401)
  }

  let batch: unknown
  try { batch = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  const items: Record<string, unknown>[] = Array.isArray(batch) ? batch : [batch as Record<string, unknown>]

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Extrai os eventos válidos (com recipient_id no metadata).
  const evs: { recipientId: string; type: string; ts: string; url?: string; reason?: string }[] = []
  for (const it of items) {
    const msys = (it?.msys ?? {}) as Record<string, Record<string, unknown>>
    const ev = msys.message_event || msys.track_event || msys.gen_event || msys.unsubscribe_event || msys.relay_event
    if (!ev) continue
    const recipientId = (ev.rcpt_meta as Record<string, unknown> | undefined)?.recipient_id as string | undefined
    const type = ev.type as string | undefined
    if (!recipientId || !type || !TYPE_MAP[type]) continue
    const tsRaw = ev.timestamp as string | number | undefined
    const ts = tsRaw ? new Date(Number(tsRaw) * 1000).toISOString() : new Date().toISOString()
    evs.push({ recipientId, type, ts, url: ev.target_link_url as string | undefined, reason: (ev.raw_reason || ev.reason) as string | undefined })
  }
  if (evs.length === 0) return json({ ok: true, processed: 0 })

  // Carrega os destinatários envolvidos (para org_id / person_id / email).
  const ids = [...new Set(evs.map((e) => e.recipientId))]
  const { data: recRows } = await supabase
    .from('email_recipients')
    .select('id, org_id, campaign_id, person_id, email')
    .in('id', ids)
  const recById = new Map((recRows ?? []).map((r) => [r.id as string, r]))

  const eventRows: Record<string, unknown>[] = []
  const sups: Record<string, unknown>[] = []
  let processed = 0

  for (const e of evs) {
    const rec = recById.get(e.recipientId)
    if (!rec) continue
    const m = TYPE_MAP[e.type]

    // Atualiza o destinatário (status e/ou carimbo de data).
    const patch: Record<string, unknown> = {}
    if (m.status) patch.status = m.status
    if (m.stamp) patch[m.stamp] = e.ts
    if (m.tipo === 'bounce' || m.tipo === 'falha') patch.error = e.reason ?? null
    if (Object.keys(patch).length > 0) await supabase.from('email_recipients').update(patch).eq('id', e.recipientId)

    eventRows.push({
      org_id: rec.org_id, recipient_id: e.recipientId, campaign_id: rec.campaign_id,
      person_id: rec.person_id, tipo: m.tipo, url: e.url ?? null, ocorrido_em: e.ts,
    })
    if (m.sup) sups.push({ org_id: rec.org_id, email: rec.email, person_id: rec.person_id, motivo: m.sup, campaign_id: rec.campaign_id })
    processed++
  }

  if (eventRows.length > 0) await supabase.from('email_events').insert(eventRows)
  if (sups.length > 0) await supabase.from('email_suppressions').upsert(sups, { onConflict: 'org_id,email', ignoreDuplicates: true })

  return json({ ok: true, processed })
})
