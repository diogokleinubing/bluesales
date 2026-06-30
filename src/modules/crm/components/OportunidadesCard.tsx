import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtBRL } from '@/lib/format'
import { useOpportunities } from '../hooks/useOpportunities'
import { NovaOportunidadeDialog } from './NovaOportunidadeDialog'

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

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Oportunidades</h3>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nova
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma oportunidade.</p>
      ) : (
        <div className="space-y-2">
          {data.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate(`/comercial/oportunidades/${o.id}`)}
              className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left hover:border-primary"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{o.titulo}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {o.stageNome ?? '—'} · {o.ownerNome ?? '—'}
                </div>
              </div>
              <div className="shrink-0 text-sm tabular-nums">
                {o.gmv_estimado != null ? fmtBRL(o.gmv_estimado) : '—'}
              </div>
            </button>
          ))}
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
