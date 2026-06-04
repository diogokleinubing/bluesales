import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type SearchKind = 'organization' | 'person' | 'opportunity' | 'event' | 'local'

export interface SearchHit {
  kind: SearchKind
  id: string
  nome: string
  to: string
}

const LABELS: Record<SearchKind, string> = {
  organization: 'Organizações',
  person: 'Contatos',
  opportunity: 'Oportunidades',
  event: 'Eventos',
  local: 'Locais',
}

export const SEARCH_GROUP_ORDER: SearchKind[] = [
  'organization', 'person', 'opportunity', 'event', 'local',
]
export const searchGroupLabel = (k: SearchKind) => LABELS[k]

/** Busca ampla no módulo Comercial (orgs, contatos, oportunidades, eventos, locais). */
export function useGlobalSearch(term: string) {
  const orgId = useCrmOrgId()
  const q = term.trim()
  return useQuery({
    enabled: !!orgId && q.length >= 2,
    staleTime: 10 * 1000,
    queryKey: ['crm', 'global-search', orgId, q],
    queryFn: async (): Promise<SearchHit[]> => {
      const like = `%${q}%`
      const [orgs, persons, opps, events, locais] = await Promise.all([
        supabase.from('organizations').select('id, nome').eq('org_id', orgId!).ilike('nome', like).order('nome').limit(6),
        supabase.from('persons').select('id, nome').eq('org_id', orgId!).ilike('nome', like).order('nome').limit(6),
        supabase.from('opportunities').select('id, titulo').eq('org_id', orgId!).ilike('titulo', like).limit(6),
        supabase.from('crm_events').select('id, nome').eq('org_id', orgId!).ilike('nome', like).order('nome').limit(6),
        supabase.from('crm_locals').select('id, nome').eq('org_id', orgId!).ilike('nome', like).order('nome').limit(6),
      ])
      const hits: SearchHit[] = []
      for (const o of orgs.data ?? []) hits.push({ kind: 'organization', id: o.id, nome: o.nome, to: `/comercial/organizacoes/${o.id}` })
      for (const p of persons.data ?? []) hits.push({ kind: 'person', id: p.id, nome: p.nome, to: `/comercial/contatos/${p.id}` })
      for (const o of opps.data ?? []) hits.push({ kind: 'opportunity', id: o.id, nome: o.titulo, to: `/comercial/oportunidades/${o.id}` })
      for (const e of events.data ?? []) hits.push({ kind: 'event', id: e.id, nome: e.nome, to: '/comercial/eventos' })
      for (const l of locais.data ?? []) hits.push({ kind: 'local', id: l.id, nome: l.nome, to: '/comercial/locais' })
      return hits
    },
  })
}
