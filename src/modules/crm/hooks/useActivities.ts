import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type ActivityTipo =
  | 'Reunião'
  | 'Ligação'
  | 'Email'
  | 'WhatsApp'
  | 'Nota'
  | 'Outro'

export interface ActivityRow {
  id: string
  tipo: ActivityTipo | null
  data_hora: string
  titulo: string
  resumo: string | null
  transcricao: string | null
  transcricao_file_url: string | null
  author_id: string
  organization_id: string | null
  opportunity_id: string | null
  created_at: string
  organization?: { nome: string } | null
  participants?: { person_id: string; nome: string }[]
  author?: string | null
}

export interface ActivityFilter {
  organizationId?: string
  opportunityId?: string
  personId?: string
  tipo?: ActivityTipo
  authorId?: string
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
          'id, tipo, data_hora, titulo, resumo, transcricao, transcricao_file_url, author_id, organization_id, opportunity_id, created_at, organizations(nome), activity_participants(person_id, persons(nome))',
        )
        .eq('org_id', orgId!)
        .order('data_hora', { ascending: false })
        .limit(500)
      if (filter.organizationId) q = q.eq('organization_id', filter.organizationId)
      if (filter.opportunityId) q = q.eq('opportunity_id', filter.opportunityId)
      if (filter.tipo) q = q.eq('tipo', filter.tipo)
      if (filter.authorId) q = q.eq('author_id', filter.authorId)
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
        created_at: a.created_at,
        organization: (a.organizations as unknown as { nome: string } | null) ?? null,
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
  data_hora: string
  titulo: string
  resumo?: string | null
  transcricao?: string | null
  transcricao_file_url?: string | null
  organization_id?: string | null
  opportunity_id?: string | null
  participantIds: string[]
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
      titulo: a.titulo,
      resumo: a.resumo ?? null,
      transcricao: a.transcricao ?? null,
      transcricao_file_url: a.transcricao_file_url ?? null,
      organization_id: a.organization_id ?? null,
      opportunity_id: a.opportunity_id ?? null,
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
