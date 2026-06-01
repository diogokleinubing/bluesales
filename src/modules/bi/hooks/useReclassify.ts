import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchRules, toClassificationRules } from '../lib/rules-api'
import { reclassifyEvents, type ReclassifyScope } from '../lib/reclassify'

/**
 * Reclassifica eventos (segmento + gênero) respeitando definições manuais.
 * Aceita o scope: 'all' | { local } | { codigos }.
 */
export function useReclassify(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (scope: ReclassifyScope = 'all') => {
      if (!orgId) throw new Error('Organização não carregada.')
      const rules = toClassificationRules(await fetchRules(orgId))
      return reclassifyEvents(scope, rules, orgId)
    },
    onSuccess: ({ updated, skipped }) => {
      // Reclassificar muda events.segmento/genero (join na leitura), não o rollup.
      qc.invalidateQueries({ queryKey: ['bi'] })
      qc.invalidateQueries({ queryKey: ['rules'] })
      const extra = skipped > 0 ? ` (${skipped} manuais preservados)` : ''
      toast.success('Reclassificação concluída', {
        description: `${updated} eventos atualizados${extra}.`,
      })
    },
    onError: (e) =>
      toast.error('Falha ao reclassificar', {
        description: (e as Error).message,
      }),
  })
}
