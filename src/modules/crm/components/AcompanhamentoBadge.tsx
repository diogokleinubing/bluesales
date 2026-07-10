import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { acompEstado, type RelItem } from '../hooks/useRelacionamento'
import { useActivities, type ActivityFilter } from '../hooks/useActivities'
import { ACOMP_META, acompTooltip } from './acompanhamentoMeta'
import { EmTrabalhoToggle } from './EmTrabalhoToggle'

function dtLabel(iso: string) {
  const d = new Date(iso)
  return `${fmtDate(d)} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function filterFor(item: RelItem): ActivityFilter {
  if (item.tipo === 'org') return { organizationId: item.id }
  if (item.tipo === 'local') return { localId: item.id }
  return { crmEventId: item.id }
}

/** Conteúdo do popover: toggle da flag + próximas atividades + link p/ detalhes. */
function AcompPopoverBody({ item }: { item: RelItem }) {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const { data, isLoading } = useActivities(filterFor(item))
  const pend = (data ?? [])
    .filter((a) => !a.realizada && a.data_hora)
    .sort((a, b) => (a.data_hora! < b.data_hora! ? -1 : 1))

  return (
    <div className="space-y-3">
      <EmTrabalhoToggle tipo={item.tipo} entityId={item.id} />

      <div className="space-y-1.5 border-t border-border pt-2">
        <p className="text-xs font-medium text-muted-foreground">Próximas atividades</p>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : pend.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {item.emTrabalho ? 'Sem próxima ação agendada.' : 'Fora de trabalho ativo.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {pend.slice(0, 6).map((a) => {
              const overdue = new Date(a.data_hora!).getTime() < now
              return (
                <li key={a.id} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-medium tabular-nums', overdue && 'text-[var(--destructive)]')}>
                      {dtLabel(a.data_hora!)}{overdue ? ' · atrasada' : ''}
                    </span>
                    {a.author && <span className="shrink-0 text-muted-foreground">{a.author}</span>}
                  </div>
                  <div className="mt-0.5">{a.titulo}</div>
                  {a.resumo && <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{a.resumo}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate(item.href)}>
        Ver detalhes
      </Button>
    </div>
  )
}

/**
 * Ícone do estado de acompanhamento com popover: mostra as próximas atividades
 * (data, responsável, texto), permite ligar/desligar a flag de trabalho ativo
 * ali mesmo e abrir os detalhes da entidade. Usado no kanban e na lista.
 */
export function AcompanhamentoControl({ item, className }: { item: RelItem; className?: string }) {
  const meta = ACOMP_META[acompEstado(item)]
  const Icon = meta.icon
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={acompTooltip(item)}
          aria-label={meta.label}
          className={cn('inline-flex rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring', className)}
        >
          <Icon className="size-4 shrink-0" style={{ color: meta.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <AcompPopoverBody item={item} />
      </PopoverContent>
    </Popover>
  )
}
