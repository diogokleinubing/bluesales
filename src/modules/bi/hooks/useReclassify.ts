import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { reclassifyEvents } from '../lib/rules-api'

/** Reclassifica todos os eventos e atualiza os caches de dados. */
export function useReclassify(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Organização não carregada.')
      return reclassifyEvents(orgId)
    },
    onSuccess: (count) => {
      // Reclassificar muda events.segmento (join na leitura), não o rollup.
      qc.invalidateQueries({ queryKey: ['bi'] })
      qc.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Reclassificação concluída', {
        description: `${count} eventos atualizados.`,
      })
    },
    onError: (e) =>
      toast.error('Falha ao reclassificar', { description: (e as Error).message }),
  })
}
