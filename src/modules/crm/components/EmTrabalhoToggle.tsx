import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { updateEmTrabalho, type RelTipo } from '../hooks/useRelacionamento'

const TABLE: Record<RelTipo, string> = { org: 'organizations', local: 'crm_locals', evento: 'crm_events' }

/**
 * Toggle da flag "trabalho ativo de relacionamento" de uma entidade.
 * Auto-contido: lê e grava só o próprio campo e invalida o funil.
 */
export function EmTrabalhoToggle({ tipo, entityId }: { tipo: RelTipo; entityId: string }) {
  const qc = useQueryClient()
  const q = useQuery({
    enabled: !!entityId,
    queryKey: ['crm', 'em-trabalho', tipo, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE[tipo])
        .select('em_trabalho_relacionamento')
        .eq('id', entityId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return !!(data as { em_trabalho_relacionamento?: boolean } | null)?.em_trabalho_relacionamento
    },
  })
  const value = q.data ?? false

  async function toggle(v: boolean) {
    try {
      await updateEmTrabalho(tipo, entityId, v)
      qc.setQueryData(['crm', 'em-trabalho', tipo, entityId], v)
      qc.invalidateQueries({ queryKey: ['crm', 'relacionamento'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs"
      title={value ? 'Acompanhamento ativo' : 'Fora de trabalho ativo'}
    >
      <span className="font-medium text-muted-foreground">Em trabalho de relacionamento</span>
      <Switch checked={value} onCheckedChange={toggle} disabled={q.isLoading} />
    </div>
  )
}
