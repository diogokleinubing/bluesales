import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface Person {
  id: string
  org_id: string
  nome: string
  email: string | null
  telefone: string | null
  linkedin: string | null
  cargo: string | null
  funil_stage_id: string | null
  created_at: string
  updated_at: string
}

export interface PersonListRow extends Person {
  orgs: string[]
}

export function useContacts() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'contacts', orgId],
    queryFn: async (): Promise<PersonListRow[]> => {
      const [persons, links] = await Promise.all([
        supabase.from('persons').select('*').eq('org_id', orgId!).order('nome'),
        supabase
          .from('org_persons')
          .select('person_id, ativo, organizations(nome)')
          .eq('ativo', true),
      ])
      if (persons.error) throw new Error(persons.error.message)
      const byPerson = new Map<string, string[]>()
      for (const l of links.data ?? []) {
        const arr = byPerson.get(l.person_id) ?? []
        const nome = (l.organizations as { nome?: string } | null)?.nome
        if (nome) arr.push(nome)
        byPerson.set(l.person_id, arr)
      }
      return (persons.data ?? []).map((p) => ({
        ...(p as Person),
        orgs: byPerson.get(p.id) ?? [],
      }))
    },
  })
}

export function useContact(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'contact', id],
    queryFn: async (): Promise<Person | null> => {
      const { data, error } = await supabase
        .from('persons')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Person) ?? null
    },
  })
}

export async function createContact(orgId: string, nome: string): Promise<string> {
  const { data, error } = await supabase
    .from('persons')
    .insert({ org_id: orgId, nome })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateContact(id: string, patch: Partial<Person>) {
  const { error } = await supabase
    .from('persons')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
