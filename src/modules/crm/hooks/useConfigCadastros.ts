import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

// ---------------------------------------------------------------------------
// Plataformas
// ---------------------------------------------------------------------------
export interface Platform {
  id: string
  org_id: string
  nome: string
  site: string | null
  observacoes: string | null
}

export function usePlatforms() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'platforms', orgId],
    queryFn: async (): Promise<Platform[]> => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Platform[]
    },
  })
}

export async function savePlatform(orgId: string, p: Partial<Platform> & { nome: string }, id?: string) {
  const payload = { nome: p.nome, site: p.site ?? null, observacoes: p.observacoes ?? null }
  const { error } = id
    ? await supabase.from('platforms').update(payload).eq('id', id)
    : await supabase.from('platforms').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deletePlatform(id: string) {
  const { error } = await supabase.from('platforms').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Objeções
// ---------------------------------------------------------------------------
export const OBJECAO_CATEGORIAS = [
  'Preço', 'Produto', 'Timing', 'Relacionamento', 'Concorrência', 'Outro',
] as const
export type ObjecaoCategoria = (typeof OBJECAO_CATEGORIAS)[number]

export interface Objection {
  id: string
  org_id: string
  titulo: string
  categoria: ObjecaoCategoria | null
  descricao: string | null
}

export function useObjectionsBase() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'objections-base', orgId],
    queryFn: async (): Promise<Objection[]> => {
      const { data, error } = await supabase
        .from('objections')
        .select('*')
        .eq('org_id', orgId!)
        .order('categoria')
        .order('titulo')
      if (error) throw new Error(error.message)
      return (data ?? []) as Objection[]
    },
  })
}

export async function saveObjection(orgId: string, o: Partial<Objection> & { titulo: string }, id?: string) {
  const payload = { titulo: o.titulo, categoria: o.categoria ?? null, descricao: o.descricao ?? null }
  const { error } = id
    ? await supabase.from('objections').update(payload).eq('id', id)
    : await supabase.from('objections').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deleteObjection(id: string) {
  const { error } = await supabase.from('objections').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
