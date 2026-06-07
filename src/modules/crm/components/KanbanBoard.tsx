import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFunnel, type FunnelSlug } from '../hooks/useFunnelStages'
import {
  moveCardStage,
  useOppsKanban,
  useOrgsKanban,
  type KanbanCard,
} from '../hooks/useKanbanData'
import { fmtBRL } from '@/lib/format'

const NONE = '__none__'

export function KanbanBoard({ slug, statusFilter, includeInactiveStages }: { slug: FunnelSlug; statusFilter?: string[] | null; includeInactiveStages?: boolean }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const kind = slug === 'relacionamento' ? 'org' : 'opp'
  const { stages, isLoading: stagesLoading } = useFunnel(slug)
  const orgsQ = useOrgsKanban()
  const oppsQ = useOppsKanban()
  const cardsQ = kind === 'org' ? orgsQ : oppsQ
  const cards = useMemo(() => {
    const all = cardsQ.data ?? []
    if (!statusFilter || statusFilter.length === 0) return all
    return all.filter((c) => c.status != null && statusFilter.includes(c.status))
  }, [cardsQ.data, statusFilter])

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const activeStages = useMemo(
    () => (includeInactiveStages ? stages : stages.filter((s) => s.ativo)),
    [stages, includeInactiveStages],
  )

  // Colunas: estágios ativos + "Sem estágio" como PRIMEIRA coluna, apenas no
  // relacionamento e somente quando há organização sem estágio.
  const columns = useMemo(() => {
    const cols = activeStages.map((s) => ({
      id: s.id,
      nome: s.nome,
      cor: s.cor,
    }))
    if (kind === 'org' && cards.some((c) => c.stageId == null)) {
      cols.unshift({ id: NONE, nome: 'Sem estágio', cor: null })
    }
    return cols
  }, [activeStages, kind, cards])

  const byStage = useMemo(() => {
    const m = new Map<string, KanbanCard[]>()
    for (const c of cards) {
      const key = c.stageId ?? NONE
      const arr = m.get(key) ?? []
      arr.push(c)
      m.set(key, arr)
    }
    return m
  }, [cards])

  const activeCard = cards.find((c) => c.id === activeId) ?? null

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const card = cards.find((c) => c.id === String(e.active.id))
    const overCol = e.over ? String(e.over.id) : null
    if (!card || !overCol) return
    const newStage = overCol === NONE ? null : overCol
    if (newStage === card.stageId) return
    const key = kind === 'org' ? ['crm', 'kanban', 'orgs'] : ['crm', 'kanban', 'opps']
    try {
      await moveCardStage(kind, card.id, newStage)
      qc.invalidateQueries({ queryKey: key })
      toast.success('Estágio atualizado')
    } catch (err) {
      toast.error('Não foi possível mover', { description: (err as Error).message })
    }
  }

  if (stagesLoading || cardsQ.isLoading) {
    return (
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-64 shrink-0" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-2 pb-2">
        {columns.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            nome={col.nome}
            cor={col.cor}
            cards={byStage.get(col.id) ?? []}
            kind={kind}
            onOpen={(href) => navigate(href)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} kind={kind} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  id,
  nome,
  cor,
  cards,
  kind,
  onOpen,
}: {
  id: string
  nome: string
  cor: string | null
  cards: KanbanCard[]
  kind: 'org' | 'opp'
  onOpen: (href: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: cor ?? 'var(--muted-foreground)' }}
          />
          <span className="text-sm font-medium">{nome}</span>
        </div>
        <Badge variant="secondary">{cards.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? 'bg-primary/5' : ''
        }`}
      >
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} kind={kind} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            Vazio
          </p>
        )}
      </div>
    </div>
  )
}

function DraggableCard({
  card,
  kind,
  onOpen,
}: {
  card: KanbanCard
  kind: 'org' | 'opp'
  onOpen: (href: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card.href)}
      className={`cursor-pointer rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-opacity hover:border-primary ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <CardView card={card} kind={kind} />
    </div>
  )
}

function CardView({
  card,
  kind,
  dragging,
}: {
  card: KanbanCard
  kind: 'org' | 'opp'
  dragging?: boolean
}) {
  return (
    <div
      className={
        dragging
          ? 'w-60 rounded-md border border-primary bg-card p-2.5 shadow-lg'
          : ''
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{card.title}</span>
        {card.badge && (
          <Badge variant="outline" className="shrink-0">
            {card.badge}
          </Badge>
        )}
      </div>
      {card.subtitle && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {card.subtitle}
        </p>
      )}
      {kind === 'opp' && card.meta && (
        <p className="mt-1 text-xs font-medium tabular-nums">
          {fmtBRL(Number(card.meta))}
        </p>
      )}
    </div>
  )
}
