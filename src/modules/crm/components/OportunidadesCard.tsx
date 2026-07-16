import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtBRL } from '@/lib/format'
import { useOpportunities } from '../hooks/useOpportunities'
import { NovaOportunidadeDialog } from './NovaOportunidadeDialog'

const SIGNAL: Record<'ativa' | 'ganha' | 'perdida', { color: string; label: string }> = {
  ativa: { color: '#3b82f6', label: 'Em andamento' },
  ganha: { color: 'var(--success)', label: 'Ganha' },
  perdida: { color: 'var(--destructive)', label: 'Perdida' },
}

/**
 * Bloco "Oportunidades" reutilizável (lista + botão Nova + dialog), filtrável
 * por organização, local ou evento. Usado nas telas de detalhe (Local, Evento).
 */
export function OportunidadesCard({
  organizationId,
  localId,
  crmEventId,
  initialTitulo,
}: {
  organizationId?: string
  localId?: string
  crmEventId?: string
  initialTitulo?: string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useOpportunities(organizationId, { localId, crmEventId })

  // Exibe apenas uma: prioridade para uma em andamento (mais recente); senão a
  // ganha/perdida mais recente. Sinaliza o resultado por cor.
  const opps = data ?? []
  const ativas = opps.filter((o) => o.resultado == null)
  const shown = ativas.length > 0
    ? ativas[0]
    : [...opps].sort((a, b) => (b.resultado_em ?? '').localeCompare(a.resultado_em ?? ''))[0] ?? null
  const estado: 'ativa' | 'ganha' | 'perdida' | null = shown
    ? (shown.resultado == null ? 'ativa' : shown.resultado === 'Ganho' ? 'ganha' : 'perdida')
    : null
  const outras = opps.length - (shown ? 1 : 0)

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Oportunidades</h3>
        <button onClick={() => setOpen(true)} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground" title="Nova oportunidade">
          <Plus className="size-4" />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !shown || !estado ? (
        <p className="text-sm text-muted-foreground">Nenhuma oportunidade</p>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => navigate(`/comercial/oportunidades/${shown.id}`)}
            className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left hover:border-primary"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SIGNAL[estado].color }} />
                <span className="truncate font-medium">{shown.titulo}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {(estado === 'ganha' || estado === 'perdida') && (
                  <span className="font-medium" style={{ color: SIGNAL[estado].color }}>{SIGNAL[estado].label} · </span>
                )}
                {shown.stageNome ?? '—'} · {shown.ownerNome ?? '—'}
              </div>
            </div>
            <div className="shrink-0 text-sm tabular-nums">
              {shown.gmv_estimado != null ? fmtBRL(shown.gmv_estimado) : '—'}
            </div>
          </button>
          {outras > 0 && (
            <p className="text-xs text-muted-foreground">+{outras} outra{outras > 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      <NovaOportunidadeDialog
        open={open}
        onOpenChange={setOpen}
        organizationId={organizationId}
        initialLocalId={localId}
        initialEventId={crmEventId}
        initialTitulo={initialTitulo}
      />
    </section>
  )
}
