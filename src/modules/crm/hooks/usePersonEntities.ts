import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Tipos de entidade que podem ter contatos vinculados. */
export type ContatoEntity = 'organization' | 'local' | 'evento'

export interface EntityContact {
  id: string
  person_id: string
  papel: string | null
  nome: string
  email: string | null
  telefone: string | null
  stageNome: string | null
  stageCor: string | null
}

/** Contatos (pessoas) vinculados a uma entidade via person_entities. */
export function useEntityContacts(entityType: ContatoEntity, entityId: string | undefined) {
  return useQuery({
    enabled: !!entityId,
    queryKey: ['crm', 'entity-contacts', entityType, entityId],
    queryFn: async (): Promise<EntityContact[]> => {
      const { data, error } = await supabase
        .from('person_entities')
        .select('id, papel, person_id, persons(nome, email, telefone, funnel_stages(nome, cor))')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .eq('ativo', true)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => {
        const p = r.persons as unknown as {
          nome: string; email: string | null; telefone: string | null
          funnel_stages: { nome: string; cor: string | null } | null
        } | null
        return {
          id: r.id as string,
          person_id: r.person_id as string,
          papel: (r.papel as string | null) ?? null,
          nome: p?.nome ?? '—',
          email: p?.email ?? null,
          telefone: p?.telefone ?? null,
          stageNome: p?.funnel_stages?.nome ?? null,
          stageCor: p?.funnel_stages?.cor ?? null,
        }
      })
    },
  })
}

/** Vincula uma pessoa a uma entidade (org/local/evento). */
export async function linkPersonToEntity(
  orgId: string,
  entityType: ContatoEntity,
  entityId: string,
  personId: string,
  papel: string | null,
  userId?: string | null,
) {
  const { error } = await supabase.from('person_entities').insert({
    org_id: orgId,
    entity_type: entityType,
    entity_id: entityId,
    person_id: personId,
    papel: papel?.trim() || null,
    data_inicio: new Date().toISOString().slice(0, 10),
    created_by: userId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function updateEntityLinkPapel(id: string, papel: string | null) {
  const { error } = await supabase
    .from('person_entities')
    .update({ papel: papel?.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function unlinkEntity(id: string) {
  const { error } = await supabase.from('person_entities').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
