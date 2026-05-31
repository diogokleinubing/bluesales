import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { OrgRow } from '@/lib/database.types'

/**
 * Resolve o org_id default da plataforma.
 * - Se VITE_DEFAULT_ORG_ID estiver setada, usa-a.
 * - Caso contrário, busca a primeira org cadastrada (seed "Blueticket").
 *
 * Multi-tenant futuro: substituir por seleção de org ligada ao usuário.
 */
export function useDefaultOrg() {
  return useQuery({
    queryKey: ['default-org'],
    staleTime: Infinity,
    queryFn: async (): Promise<OrgRow> => {
      const envId = import.meta.env.VITE_DEFAULT_ORG_ID
      const query = supabase.from('orgs').select('*')

      const { data, error } = envId
        ? await query.eq('id', envId).single()
        : await query.order('created_at', { ascending: true }).limit(1).single()

      if (error) throw error
      return data as OrgRow
    },
  })
}
