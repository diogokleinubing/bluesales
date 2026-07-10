import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useOpenItem } from '@/lib/useOpenItem'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { Building2, MapPin, CalendarRange } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ClasseBadge } from './ClasseBadge'
import { AcompanhamentoControl } from './AcompanhamentoBadge'
import { useFunnel } from '../hooks/useFunnelStages'
import { moveRelItemStage, type RelItem, type RelTipo } from '../hooks/useRelacionamento'
import { fmtBRL, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const NONE = '__none__'

export const TIPO_META: Record<RelTipo, { icon: typeof Building2; color: string; label: string }> = {
  org: { icon: Building2, color: '#8b5cf6', label: 'Organização' },
  local: { icon: MapPin, color: '#10b981', label: 'Local' },
  evento: { icon: CalendarRange, color: '#f97316', label: 'Evento' },
}

/** Badge de tipo (ícone + rótulo) para a listagem unificada. */
export function RelTipoBadge({ tipo }: { tipo: RelTipo }) {
  const meta = TIPO_META[tipo]
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <Icon className="size-3.5" style={{ color: meta.color }} /> {meta.label}
    </span>
  )
}

function rankClasse(b?: string | null) {
  return ({ 'A+': 4, A: 3, B: 2, C: 1 } as Record<string, number>)[b ?? ''] ?? 0
}

export function RelacionamentoBoard({
  items, includeInactiveStages, showCidade = true, showGmv = true, showCadastro = false,
}: {
  items: RelItem[]
  includeInactiveStages?: boolean
  showCidade?: boolean
  showGmv?: boolean
  showCadastro?: boolean
}) {
  const openItem = useOpenItem()
  const qc = useQueryClient()
  const { stages, isLoading } = useFunnel('relacionamento')
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeStages = useMemo(
    () => (includeInactiveStages ? stages : stages.filter((s) => s.ativo)),
    [stages, includeInactiveStages],
  )
  const columns = useMemo(() => {
    const cols = activeStages.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor }))
    if (items.some((c) => c.funil_stage_id == null)) cols.unshift({ id: NONE, nome: 'Sem estágio', cor: null })
    return cols
  }, [activeStages, items])

  const byStage = useMemo(() => {
    const m = new Map<string, RelItem[]>()
    const sorted = [...items].sort((a, b) =>
      (rankClasse(b.classificacao) - rankClasse(a.classificacao))
      || ((b.gmv ?? -Infinity) - (a.gmv ?? -Infinity))
      || a.nome.localeCompare(b.nome, 'pt-BR'))
    for (const c of sorted) {
      const key = c.funil_stage_id ?? NONE
      const arr = m.get(key) ?? []
      arr.push(c); m.set(key, arr)
    }
    return m
  }, [items])

  const activeItem = items.find((c) => `${c.tipo}:${c.id}` === activeId) ?? null

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)) }
  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const item = items.find((c) => `${c.tipo}:${c.id}` === String(e.active.id))
    const overCol = e.over ? String(e.over.id) : null
    if (!item || !overCol) return
    const newStage = overCol === NONE ? null : overCol
    if (newStage === item.funil_stage_id) return
    try {
      await moveRelItemStage(item.tipo, item.id, newStage)
      qc.invalidateQueries({ queryKey: ['crm', 'relacionamento'] })
      toast.success('Estágio atualizado')
    } catch (err) {
      toast.error('Não foi possível mover', { description: (err as Error).message })
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-64 shrink-0" />)}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-2 pb-2">
        {columns.map((col) => (
          <Column key={col.id} id={col.id} nome={col.nome} cor={col.cor}
            items={byStage.get(col.id) ?? []} showCidade={showCidade} showGmv={showGmv} showCadastro={showCadastro}
            onOpen={(e, href) => openItem(e, href)} />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? <CardView item={activeItem} showCidade={showCidade} showGmv={showGmv} showCadastro={showCadastro} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ id, nome, cor, items, showCidade, showGmv, showCadastro, onOpen }: {
  id: string; nome: string; cor: string | null; items: RelItem[]
  showCidade: boolean; showGmv: boolean; showCadastro: boolean; onOpen: (e: ReactMouseEvent, href: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const CAP = 60
  const shown = items.slice(0, CAP)
  const gmvTotal = showGmv ? items.reduce((s, c) => s + (c.gmv ?? 0), 0) : null
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor ?? 'var(--muted-foreground)' }} />
            <span className="truncate text-sm font-medium">{nome}</span>
          </div>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        {gmvTotal != null && (
          <p className="mt-1 text-xs font-semibold tabular-nums text-muted-foreground">{fmtBRL(gmvTotal)}</p>
        )}
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors', isOver && 'bg-primary/5')}>
        {shown.map((c) => <DraggableCard key={`${c.tipo}:${c.id}`} item={c} showCidade={showCidade} showGmv={showGmv} showCadastro={showCadastro} onOpen={onOpen} />)}
        {items.length > CAP && <p className="px-1 py-2 text-center text-xs text-muted-foreground">+{items.length - CAP} — use a busca</p>}
        {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Vazio</p>}
      </div>
    </div>
  )
}

function DraggableCard({ item, showCidade, showGmv, showCadastro, onOpen }: {
  item: RelItem; showCidade: boolean; showGmv: boolean; showCadastro: boolean; onOpen: (e: ReactMouseEvent, href: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${item.tipo}:${item.id}` })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={(e) => onOpen(e, item.href)}
      className={cn('cursor-pointer rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-opacity hover:border-primary', isDragging && 'opacity-40')}>
      <CardView item={item} showCidade={showCidade} showGmv={showGmv} showCadastro={showCadastro} />
    </div>
  )
}

function CardView({ item, showCidade = true, showGmv = true, showCadastro = false, dragging }: {
  item: RelItem; showCidade?: boolean; showGmv?: boolean; showCadastro?: boolean; dragging?: boolean
}) {
  const meta = TIPO_META[item.tipo]
  const Icon = meta.icon
  return (
    <div className={dragging ? 'w-60 rounded-md border border-primary bg-card p-2.5 shadow-lg' : ''}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5">
          <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: meta.color }} aria-label={meta.label} />
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="line-clamp-2 text-sm font-medium">{item.nome}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{item.nome}</TooltipContent>
          </Tooltip>
        </span>
        {item.classificacao && <span className="shrink-0"><ClasseBadge classe={item.classificacao} /></span>}
      </div>
      {showCidade && item.cidade && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{[item.cidade, item.uf].filter(Boolean).join('/')}</p>
      )}
      {/* Rodapé: GMV/cadastro à esquerda, acompanhamento no canto inferior direito. */}
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          {showGmv && item.gmv != null && (
            <p className="text-xs font-medium tabular-nums">{fmtBRL(item.gmv)}</p>
          )}
          {showCadastro && item.cadastro && (
            <p className="text-xs text-muted-foreground">Cadastro: {fmtDate(item.cadastro)}</p>
          )}
        </div>
        <AcompanhamentoControl item={item} className="shrink-0" />
      </div>
    </div>
  )
}
