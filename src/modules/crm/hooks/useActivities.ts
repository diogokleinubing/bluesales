import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { softDelete } from '@/lib/softDelete'
import { useCrmOrgId } from './useFunnelStages'

export type ActivityTipo =
  | 'Reunião'
  | 'Ligação'
  | 'Email'
  | 'WhatsApp'
  | 'Nota'
  | 'Tarefa'
  | 'Outro'

export interface ActivityRow {
  id: string
  tipo: ActivityTipo | null
  data_hora: string | null
  titulo: string
  resumo: string | null
  transcricao: string | null
  transcricao_file_url: string | null
  author_id: string
  organization_id: string | null
  opportunity_id: string | null
  local_id: string | null
  crm_event_id: string | null
  artist_id: string | null
  realizada: boolean
  created_at: string
  organization?: { nome: string } | null
  local?: { nome: string } | null
  event?: { nome: string } | null
  artist?: { nome: string } | null
  participants?: { person_id: string; nome: string }[]
  author?: string | null
}

export interface ActivityFilter {
  organizationId?: string
  opportunityId?: string
  localId?: string
  crmEventId?: string
  personId?: string
  tipo?: ActivityTipo
  authorId?: string
  /** Intervalo por data_hora (ISO): [from, to). */
  from?: string
  to?: string
  /** Ordenação: data_hora (padrão) ou created_at (ordem de cadastro). */
  orderBy?: 'data_hora' | 'created_at'
  /** Só tarefas sem data (To-Do / A fazer). */
  semData?: boolean
}

export function useActivities(filter: ActivityFilter = {}) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'activities', orgId, filter],
    queryFn: async (): Promise<ActivityRow[]> => {
      // Atividades de um contato: via participantes.
      let ids: string[] | null = null
      if (filter.personId) {
        const { data } = await supabase
          .from('activity_participants')
          .select('activity_id')
          .eq('person_id', filter.personId)
        ids = (data ?? []).map((r) => r.activity_id as string)
        if (ids.length === 0) return []
      }

      let q = supabase
        .from('activities')
        .select(
          'id, tipo, data_hora, titulo, resumo, transcricao, transcricao_file_url, author_id, organization_id, opportunity_id, local_id, crm_event_id, artist_id, realizada, created_at, organizations(nome), crm_locals(nome), crm_events(nome), artists(nome), activity_participants(person_id, persons(nome))',
        )
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order(filter.orderBy ?? 'data_hora', { ascending: false })
        .limit(500)
      if (filter.organizationId) q = q.eq('organization_id', filter.organizationId)
      if (filter.opportunityId) q = q.eq('opportunity_id', filter.opportunityId)
      if (filter.localId) q = q.eq('local_id', filter.localId)
      if (filter.crmEventId) q = q.eq('crm_event_id', filter.crmEventId)
      if (filter.tipo) q = q.eq('tipo', filter.tipo)
      if (filter.authorId) q = q.eq('author_id', filter.authorId)
      if (filter.from) q = q.gte('data_hora', filter.from)
      if (filter.to) q = q.lt('data_hora', filter.to)
      if (filter.semData) q = q.is('data_hora', null)
      if (ids) q = q.in('id', ids)

      const { data, error } = await q
      if (error) throw new Error(error.message)

      const authors = await supabase.from('profiles').select('id, nome')
      const authorById = new Map(
        (authors.data ?? []).map((p) => [p.id, p.nome as string]),
      )

      return (data ?? []).map((a) => ({
        id: a.id,
        tipo: a.tipo as ActivityTipo | null,
        data_hora: a.data_hora,
        titulo: a.titulo,
        resumo: a.resumo,
        transcricao: a.transcricao,
        transcricao_file_url: a.transcricao_file_url,
        author_id: a.author_id,
        organization_id: a.organization_id,
        opportunity_id: a.opportunity_id,
        local_id: a.local_id ?? null,
        crm_event_id: a.crm_event_id ?? null,
        artist_id: a.artist_id ?? null,
        realizada: !!a.realizada,
        created_at: a.created_at,
        organization: (a.organizations as unknown as { nome: string } | null) ?? null,
        local: (a.crm_locals as unknown as { nome: string } | null) ?? null,
        event: (a.crm_events as unknown as { nome: string } | null) ?? null,
        artist: (a.artists as unknown as { nome: string } | null) ?? null,
        author: authorById.get(a.author_id) ?? null,
        participants: ((a.activity_participants as unknown as
          | { person_id: string; persons: { nome: string } | null }[]
          | null) ?? []).map((p) => ({
          person_id: p.person_id,
          nome: p.persons?.nome ?? '—',
        })),
      }))
    },
  })
}

export interface NewActivity {
  tipo: ActivityTipo
  data_hora: string | null
  titulo: string
  resumo?: string | null
  transcricao?: string | null
  transcricao_file_url?: string | null
  organization_id?: string | null
  opportunity_id?: string | null
  local_id?: string | null
  crm_event_id?: string | null
  artist_id?: string | null
  participantIds: string[]
  /** Se omitido: passado/agora = realizada; futuro (agendamento) = pendente. */
  realizada?: boolean
}

/** Marca/desmarca uma atividade como realizada. */
export async function setActivityRealizada(id: string, realizada: boolean) {
  const { error } = await supabase.from('activities').update({ realizada }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Define/remove a data de uma atividade (agendar uma tarefa de backlog). */
export async function setActivityData(id: string, data_hora: string | null) {
  const { error } = await supabase.from('activities').update({ data_hora }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createActivity(
  orgId: string,
  authorId: string,
  a: NewActivity,
): Promise<string> {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      org_id: orgId,
      author_id: authorId,
      tipo: a.tipo,
      data_hora: a.data_hora,
      titulo: a.titulo, // (data_hora null = tarefa sem data / A fazer)
      resumo: a.resumo ?? null,
      transcricao: a.transcricao ?? null,
      transcricao_file_url: a.transcricao_file_url ?? null,
      organization_id: a.organization_id ?? null,
      opportunity_id: a.opportunity_id ?? null,
      local_id: a.local_id ?? null,
      crm_event_id: a.crm_event_id ?? null,
      artist_id: a.artist_id ?? null,
      realizada: a.realizada ?? (a.data_hora ? new Date(a.data_hora) <= new Date() : false),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const actId = data.id as string
  if (a.participantIds.length > 0) {
    const rows = a.participantIds.map((pid) => ({
      activity_id: actId,
      person_id: pid,
    }))
    const { error: e2 } = await supabase.from('activity_participants').insert(rows)
    if (e2) throw new Error(e2.message)
  }
  return actId
}

/** Atualiza uma atividade e substitui a lista de participantes. */
export async function updateActivity(id: string, a: NewActivity) {
  const { error } = await supabase.from('activities').update({
    tipo: a.tipo,
    data_hora: a.data_hora,
    titulo: a.titulo,
    resumo: a.resumo ?? null,
    transcricao: a.transcricao ?? null,
    organization_id: a.organization_id ?? null,
    opportunity_id: a.opportunity_id ?? null,
    local_id: a.local_id ?? null,
    crm_event_id: a.crm_event_id ?? null,
    artist_id: a.artist_id ?? null,
    ...(a.realizada != null ? { realizada: a.realizada } : {}),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  await supabase.from('activity_participants').delete().eq('activity_id', id)
  if (a.participantIds.length > 0) {
    const { error: e2 } = await supabase.from('activity_participants')
      .insert(a.participantIds.map((pid) => ({ activity_id: id, person_id: pid })))
    if (e2) throw new Error(e2.message)
  }
}

export async function deleteActivity(id: string) {
  await softDelete('activities', id)
}
