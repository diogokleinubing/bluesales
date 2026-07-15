import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface EmailList {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  created_at: string
  inscritos: number
}

/** Listas de email do tenant, com contagem de inscritos. */
export function useEmailLists() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    queryKey: ['crm', 'email', 'lists', orgId],
    queryFn: async (): Promise<EmailList[]> => {
      const { data, error } = await supabase
        .from('email_lists')
        .select('id, nome, descricao, ativo, created_at')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      const { data: mem } = await supabase
        .from('email_list_members')
        .select('list_id')
        .eq('status', 'inscrito')
      const counts = new Map<string, number>()
      for (const m of mem ?? []) counts.set(m.list_id as string, (counts.get(m.list_id as string) ?? 0) + 1)
      return (data ?? []).map((l) => ({ ...(l as Omit<EmailList, 'inscritos'>), inscritos: counts.get(l.id as string) ?? 0 }))
    },
  })
}

export function useEmailList(id: string | undefined) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!id && !!orgId,
    queryKey: ['crm', 'email', 'list', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_lists').select('*').eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as { id: string; nome: string; descricao: string | null; ativo: boolean } | null
    },
  })
}

export async function createEmailList(orgId: string, nome: string, descricao: string | null, userId?: string | null) {
  const { data, error } = await supabase
    .from('email_lists')
    .insert({ org_id: orgId, nome: nome.trim(), descricao: descricao?.trim() || null, created_by: userId ?? null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateEmailList(id: string, patch: { nome?: string; descricao?: string | null; ativo?: boolean }) {
  const { error } = await supabase.from('email_lists').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteEmailList(id: string) {
  const { error } = await supabase.from('email_lists').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export interface ListMember {
  id: string
  person_id: string
  status: string
  nome: string
  email: string | null
  telefone: string | null
}

export function useListMembers(listId: string | undefined) {
  return useQuery({
    enabled: !!listId,
    queryKey: ['crm', 'email', 'members', listId],
    queryFn: async (): Promise<ListMember[]> => {
      const { data, error } = await supabase
        .from('email_list_members')
        .select('id, person_id, status, persons(nome, email, telefone)')
        .eq('list_id', listId!)
        .order('subscribed_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((m) => {
        const p = m.persons as unknown as { nome: string; email: string | null; telefone: string | null } | null
        return {
          id: m.id as string,
          person_id: m.person_id as string,
          status: m.status as string,
          nome: p?.nome ?? '—',
          email: p?.email ?? null,
          telefone: p?.telefone ?? null,
        }
      })
    },
  })
}

/** Inscreve pessoas na lista (ignora quem já é membro). Retorna quantas entraram. */
export async function addMembers(orgId: string, listId: string, personIds: string[]): Promise<number> {
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return 0
  const rows = ids.map((pid) => ({ org_id: orgId, list_id: listId, person_id: pid }))
  const { error } = await supabase
    .from('email_list_members')
    .upsert(rows, { onConflict: 'list_id,person_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return ids.length
}

export async function removeMember(id: string) {
  const { error } = await supabase.from('email_list_members').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** person_ids dos contatos vinculados às organizações escolhidas (person_entities). */
export async function personIdsByOrgs(orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) return []
  const { data, error } = await supabase
    .from('person_entities')
    .select('person_id')
    .eq('entity_type', 'organization')
    .eq('ativo', true)
    .in('entity_id', orgIds)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r) => r.person_id as string))]
}
