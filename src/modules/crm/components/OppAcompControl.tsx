import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { useActivities } from '../hooks/useActivities'
import { type RelHealth } from '../hooks/useRelacionamento'
import { ACOMP_META } from './acompanhamentoMeta'

function dtLabel(iso: string) {
  const d = new Date(iso)
  return `${fmtDate(d)} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function tooltip(health: RelHealth, proximaAcaoAt: string | null, atrasadaDesde: string | null): string {
  if (health === 'atrasada') return atrasadaDesde ? `Atrasada desde ${fmtDate(atrasadaDesde)}` : 'Atrasada'
  if (health === 'em_dia') return proximaAcaoAt ? `Em dia — próxima ação em ${fmtDate(proximaAcaoAt)}` : 'Em dia'
  return 'Sem próxima ação agendada'
}

function Body({ oppId, href }: { oppId: string; href: string }) {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const { data, isLoading } = useActivities({ opportunityId: oppId })
  const pend = (data ?? [])
    .filter((a) => !a.realizada && a.data_hora)
    .sort((a, b) => (a.data_hora! < b.data_hora! ? -1 : 1))

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Próximas atividades</p>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : pend.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem próxima ação agendada.</p>
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
      <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate(href)}>Ver detalhes</Button>
    </div>
  )
}

/**
 * Ícone de saúde por atividades para os cards do funil de prospecção — mesmo
 * conceito do relacionamento (em dia / atrasada / sem ação), mas sem o estado
 * "fora de trabalho" (na prospecção todos estão sendo trabalhados).
 */
export function OppAcompControl({
  oppId, href, health, proximaAcaoAt, atrasadaDesde, className,
}: {
  oppId: string
  href: string
  health: RelHealth
  proximaAcaoAt?: string | null
  atrasadaDesde?: string | null
  className?: string
}) {
  const meta = ACOMP_META[health]
  const Icon = meta.icon
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={tooltip(health, proximaAcaoAt ?? null, atrasadaDesde ?? null)}
          aria-label={meta.label}
          className={cn('inline-flex rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring', className)}
        >
          <Icon className="size-4 shrink-0" style={{ color: meta.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Body oppId={oppId} href={href} />
      </PopoverContent>
    </Popover>
  )
}
