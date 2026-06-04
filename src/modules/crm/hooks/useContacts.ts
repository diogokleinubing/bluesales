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
  instagram: string | null
  observacoes: string | null
  cargo: string | null
  funil_stage_id: string | null
  created_at: string
  updated_at: string
}

export interface PersonOrgLink {
  nome: string
  papel: string | null
}

export interface PersonListRow extends Person {
  orgs: PersonOrgLink[]
  stageNome: string | null
  stageCor: string | null
}

export function useContacts() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'contacts', orgId],
    queryFn: async (): Promise<PersonListRow[]> => {
      const [persons, links] = await Promise.all([
        supabase
          .from('persons')
          .select('*, funnel_stages(nome, cor)')
          .eq('org_id', orgId!)
          .order('nome'),
        supabase
          .from('org_persons')
          .select('person_id, ativo, papel, organizations(nome)')
          .eq('ativo', true),
      ])
      if (persons.error) throw new Error(persons.error.message)
      const byPerson = new Map<string, PersonOrgLink[]>()
      for (const l of links.data ?? []) {
        const arr = byPerson.get(l.person_id) ?? []
        const nome = (l.organizations as unknown as { nome?: string } | null)?.nome
        if (nome) arr.push({ nome, papel: l.papel ?? null })
        byPerson.set(l.person_id, arr)
      }
      return (persons.data ?? []).map((p) => {
        const stage = (p as unknown as { funnel_stages?: { nome: string; cor: string | null } | null })
          .funnel_stages
        return {
          ...(p as Person),
          orgs: byPerson.get(p.id) ?? [],
          stageNome: stage?.nome ?? null,
          stageCor: stage?.cor ?? null,
        }
      })
    },
  })
}

/** Busca contatos por nome sob demanda (autocomplete — não pré-carrega tudo). */
export function useContactSearch(term: string) {
  const orgId = useCrmOrgId()
  const q = term.trim()
  return useQuery({
    enabled: !!orgId && q.length >= 1,
    staleTime: 10 * 1000,
    queryKey: ['crm', 'contact-search', orgId, q],
    queryFn: async (): Promise<{ id: string; nome: string; cargo: string | null }[]> => {
      const { data, error } = await supabase
        .from('persons')
        .select('id, nome, cargo')
        .eq('org_id', orgId!)
        .ilike('nome', `%${q}%`)
        .order('nome')
        .limit(8)
      if (error) throw new Error(error.message)
      return data ?? []
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

export async function deleteContact(id: string) {
  // Objeções são polimórficas (sem FK), então limpamos antes do cascade.
  await supabase
    .from('entity_objections')
    .delete()
    .eq('entity_type', 'person')
    .eq('entity_id', id)
  const { error } = await supabase.from('persons').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
