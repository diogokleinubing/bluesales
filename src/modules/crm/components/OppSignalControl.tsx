import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeDollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { fmtBRL } from '@/lib/format'
import { useFunnel } from '../hooks/useFunnelStages'
import { type OppSignal } from '../hooks/useRelacionamento'

const META: Record<OppSignal['estado'], { color: string; label: string; titulo: string }> = {
  ativa: { color: '#3b82f6', label: 'Oportunidade ativa', titulo: 'Oportunidades ativas' },
  ganha: { color: 'var(--success)', label: 'Oportunidade ganha', titulo: 'Última oportunidade — ganha' },
  perdida: { color: 'var(--destructive)', label: 'Oportunidade perdida', titulo: 'Última oportunidade — perdida' },
}

/**
 * Sinaliza no funil de relacionamento a situação da prospecção da entidade:
 * azul = ativa em andamento; verde = ganha; vermelho = perdida (ganha/perdida só
 * quando não há ativa, pela mais recente). Clicar abre as oportunidades.
 */
export function OppSignalControl({ signal, className }: { signal: OppSignal | null; className?: string }) {
  const navigate = useNavigate()
  const { stages } = useFunnel('oportunidade')
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s.nome])), [stages])

  if (!signal) return null
  const meta = META[signal.estado]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={meta.label}
          aria-label={meta.label}
          className={cn('inline-flex rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring', className)}
        >
          <BadgeDollarSign className="size-4 shrink-0" style={{ color: meta.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{meta.titulo}</p>
          <ul className="space-y-1.5">
            {signal.opps.map((o) => (
              <li key={o.id} className="rounded-md border border-border p-2 text-xs">
                <div className="font-medium">{o.titulo}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
                  <span>{o.resultado ?? (o.stageId ? stageMap.get(o.stageId) ?? '—' : '—')}</span>
                  {o.gmv != null && <span className="tabular-nums">{fmtBRL(o.gmv)}</span>}
                </div>
                <Button size="sm" variant="secondary" className="mt-1.5 h-7 w-full" onClick={() => navigate(`/comercial/oportunidades/${o.id}`)}>
                  Detalhes
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
