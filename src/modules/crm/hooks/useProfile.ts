import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export type CrmRole = 'gestor' | 'comercial'

export interface CrmProfile {
  id: string
  nome: string | null
  role: CrmRole
}

/**
 * Perfil do usuário logado para o módulo Comercial. O papel (gestor/comercial)
 * é derivado de profiles.is_gestor. Cacheado via TanStack Query.
 */
export function useProfile() {
  const { user } = useAuth()
  const query = useQuery({
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryKey: ['crm', 'profile', user?.id],
    queryFn: async (): Promise<CrmProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, is_gestor')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return {
        id: user!.id,
        nome: data?.nome ?? null,
        role: data?.is_gestor ? 'gestor' : 'comercial',
      }
    },
  })
  return { ...query, profile: query.data ?? null }
}
