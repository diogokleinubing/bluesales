import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface CampaignStats {
  total: number
  enviados: number
  entregues: number
  aberturas: number
  cliques: number
  descadastros: number
  bounces: number
}

const ZERO: CampaignStats = { total: 0, enviados: 0, entregues: 0, aberturas: 0, cliques: 0, descadastros: 0, bounces: 0 }

function toStats(row: Record<string, unknown> | undefined): CampaignStats {
  if (!row) return ZERO
  const n = (k: string) => Number(row[k] ?? 0)
  return {
    total: n('total'), enviados: n('enviados'), entregues: n('entregues'),
    aberturas: n('aberturas'), cliques: n('cliques'), descadastros: n('descadastros'), bounces: n('bounces'),
  }
}

export type CampaignStatus = 'rascunho' | 'fila' | 'enviada' | 'cancelada'

export interface EmailCampaign {
  id: string
  nome: string
  assunto: string | null
  status: CampaignStatus
  enviada_em: string | null
  created_at: string
  stats: CampaignStats
}

/** Mensagens (campanhas) com estatísticas agregadas. */
export function useEmailCampaigns() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    queryKey: ['crm', 'email', 'campaigns', orgId],
    queryFn: async (): Promise<EmailCampaign[]> => {
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('id, nome, assunto, status, enviada_em, created_at')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      const { data: stats } = await supabase.from('email_campaign_stats').select('*')
      const byId = new Map((stats ?? []).map((s) => [(s as Record<string, unknown>).campaign_id as string, s as Record<string, unknown>]))
      return (data ?? []).map((c) => ({ ...(c as Omit<EmailCampaign, 'stats'>), stats: toStats(byId.get(c.id as string)) }))
    },
  })
}

export interface CampaignRow {
  id: string
  nome: string
  assunto: string | null
  remetente_nome: string | null
  remetente_email: string | null
  reply_to: string | null
  html: string | null
  status: CampaignStatus
  enviada_em: string | null
  template_id: string | null
  template_data: { mensagemInicial?: string; mensagemFinal?: string; edicao?: string } | null
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['crm', 'email', 'campaign', id],
    queryFn: async () => {
      const [{ data, error }, listsRes] = await Promise.all([
        supabase.from('email_campaigns').select('*').eq('id', id!).maybeSingle(),
        supabase.from('email_campaign_lists').select('list_id').eq('campaign_id', id!),
      ])
      if (error) throw new Error(error.message)
      return {
        campaign: (data ?? null) as CampaignRow | null,
        listIds: (listsRes.data ?? []).map((r) => r.list_id as string),
      }
    },
  })
}

export async function createCampaign(orgId: string, nome: string, userId?: string | null, templateId?: string | null) {
  const { data, error } = await supabase
    .from('email_campaigns')
    .insert({ org_id: orgId, nome: nome.trim() || 'Nova mensagem', created_by: userId ?? null, template_id: templateId ?? null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateCampaign(id: string, patch: Partial<Omit<CampaignRow, 'id'>>) {
  const { error } = await supabase.from('email_campaigns').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteCampaign(id: string) {
  const { error } = await supabase.from('email_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setCampaignLists(campaignId: string, listIds: string[]) {
  await supabase.from('email_campaign_lists').delete().eq('campaign_id', campaignId)
  if (listIds.length > 0) {
    const rows = listIds.map((list_id) => ({ campaign_id: campaignId, list_id }))
    const { error } = await supabase.from('email_campaign_lists').insert(rows)
    if (error) throw new Error(error.message)
  }
}

export interface Recipient {
  id: string
  email: string
  status: string
  nome: string
  opened_at: string | null
  clicked_at: string | null
  unsubscribed_at: string | null
  error: string | null
}

export function useRecipients(campaignId: string | undefined) {
  return useQuery({
    enabled: !!campaignId,
    queryKey: ['crm', 'email', 'recipients', campaignId],
    queryFn: async (): Promise<Recipient[]> => {
      const { data, error } = await supabase
        .from('email_recipients')
        .select('id, email, status, opened_at, clicked_at, unsubscribed_at, error, persons(nome)')
        .eq('campaign_id', campaignId!)
        .order('email')
        .limit(5000)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => {
        const p = r.persons as unknown as { nome: string } | null
        return {
          id: r.id as string,
          email: r.email as string,
          status: r.status as string,
          nome: p?.nome ?? '—',
          opened_at: (r.opened_at as string | null) ?? null,
          clicked_at: (r.clicked_at as string | null) ?? null,
          unsubscribed_at: (r.unsubscribed_at as string | null) ?? null,
          error: (r.error as string | null) ?? null,
        }
      })
    },
  })
}

/**
 * Monta a fila de destinatários a partir das listas-alvo: inscritos, com email,
 * sem os suprimidos globalmente, deduplicados por email. Marca a campanha como
 * 'fila'. O disparo real (Resend) acontece na integração final.
 */
export async function prepareSend(orgId: string, campaignId: string): Promise<number> {
  const { data: cl } = await supabase.from('email_campaign_lists').select('list_id').eq('campaign_id', campaignId)
  const listIds = (cl ?? []).map((r) => r.list_id as string)
  if (listIds.length === 0) throw new Error('Selecione ao menos uma lista.')

  const { data: mem, error: mErr } = await supabase
    .from('email_list_members')
    .select('person_id, persons(email)')
    .in('list_id', listIds)
    .eq('status', 'inscrito')
  if (mErr) throw new Error(mErr.message)

  const { data: sup } = await supabase.from('email_suppressions').select('email').eq('org_id', orgId)
  const suppressed = new Set((sup ?? []).map((s) => String(s.email).toLowerCase()))

  const seen = new Set<string>()
  const rows: { org_id: string; campaign_id: string; person_id: string; email: string }[] = []
  for (const m of mem ?? []) {
    const p = m.persons as unknown as { email: string | null } | null
    const email = p?.email?.trim().toLowerCase()
    if (!email || suppressed.has(email) || seen.has(email)) continue
    seen.add(email)
    rows.push({ org_id: orgId, campaign_id: campaignId, person_id: m.person_id as string, email })
  }
  if (rows.length === 0) throw new Error('Nenhum destinatário elegível (sem email, suprimidos ou listas vazias).')

  const { error } = await supabase
    .from('email_recipients')
    .upsert(rows, { onConflict: 'campaign_id,person_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  await updateCampaign(campaignId, { status: 'fila' })
  return rows.length
}
