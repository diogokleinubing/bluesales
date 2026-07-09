import { FileText, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjetos } from '../store'
import { contarTarefas, pessoaNome, trilhaDaAcao } from '../lib/compute'
import { TRILHAS } from '../types'
import type { Acao } from '../types'
import { PessoaAvatar, StatusBadge } from './bits'

/**
 * Card de ação para o kanban. Mostra vínculo (via cor da borda = trilha),
 * status, área, responsável, contador de tarefas e indicador de detalhes.
 */
export function AcaoCard({
  acao,
  onOpen,
  dragging,
}: {
  acao: Acao
  onOpen?: (id: string) => void
  dragging?: boolean
}) {
  const store = useProjetos()
  const { objetivos, areas, pessoas, tarefas } = store
  const trilha = trilhaDaAcao(acao, objetivos)
  const cor = TRILHAS[trilha].cor
  const areaNome = areas.find((a) => a.id === acao.areaId)?.nome
  const resp = pessoaNome(acao.responsavelId, pessoas)
  const { feitas, total } = contarTarefas(acao.id, tarefas)

  return (
    <div
      onClick={() => onOpen?.(acao.id)}
      className={cn(
        'group rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-colors',
        onOpen && 'cursor-pointer hover:border-primary',
        dragging && 'border-primary shadow-lg',
      )}
      style={{ borderLeft: `3px solid ${cor}` }}
    >
      <span className={cn('line-clamp-2 text-sm font-medium leading-snug', acao.status === 'concluido' && 'text-muted-foreground line-through')}>
        {acao.titulo}
      </span>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        <StatusBadge status={acao.status} />
        {areaNome && <span className="truncate">· {areaNome}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <PessoaAvatar nome={resp} />
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {acao.detalhes.trim() && (
            <FileText className="size-3.5" aria-label="Tem detalhes" />
          )}
          {total > 0 && (
            <span className={cn('inline-flex items-center gap-1 tabular-nums', feitas === total && 'text-[var(--success)]')}>
              <CheckSquare className="size-3.5" /> {feitas}/{total}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
