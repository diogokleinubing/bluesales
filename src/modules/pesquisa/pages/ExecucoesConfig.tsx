import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExecucoesTabela } from '../components/ExecucoesTabela'

export function ExecucoesConfig() {
  const qc = useQueryClient()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Execuções</h1>
          <p className="text-sm text-muted-foreground">Histórico das coletas (cron semanal e disparos manuais).</p>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['pesquisa', 'runs'] })}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </div>

      <ExecucoesTabela />
    </div>
  )
}
