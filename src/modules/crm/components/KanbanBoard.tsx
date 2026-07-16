import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useOpenItem } from '@/lib/useOpenItem'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ClasseBadge } from './ClasseBadge'
import { OppAcompControl } from './OppAcompControl'
import { UserAvatar } from './UserAvatar'
import { useFunnel, type FunnelSlug } from '../hooks/useFunnelStages'
import {
  moveCardStage,
  useOppsKanban,
  useOrgsKanban,
  type KanbanCard,
} from '../hooks/useKanbanData'
import { fmtBRL } from '@/lib/format'

const NONE = '__none__'

export function KanbanBoard({ slug, statusFilter, includeInactiveStages, classFilter, search, gmvMin, ownerId, showCidade = true, showGmv = true, selectMode = false, selectedIds, onToggleSelect }: { slug: FunnelSlug; statusFilter?: string[] | null; includeInactiveStages?: boolean; classFilter?: string[] | null; search?: string; gmvMin?: number | null; ownerId?: string | null; showCidade?: boolean; showGmv?: boolean; selectMode?: boolean; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void }) {
  const openItem = useOpenItem()
  const qc = useQueryClient()
  const kind = slug === 'relacionamento' ? 'org' : 'opp'
  const { stages, isLoading: stagesLoading } = useFunnel(slug)
  const orgsQ = useOrgsKanban()
  const oppsQ = useOppsKanban()
  const cardsQ = kind === 'org' ? orgsQ : oppsQ
  const cards = useMemo(() => {
    let all = cardsQ.data ?? []
    // Status comercial: filtro estrito (exige status na seleção).
    if (statusFilter && statusFilter.length > 0) {
      all = all.filter((c) => c.status != null && statusFilter.includes(c.status))
    }
    // Classe (badge): quando há filtro, exige classe na seleção.
    if (classFilter && classFilter.length > 0) {
      all = all.filter((c) => c.badge != null && classFilter.includes(c.badge))
    }
    const q = (search ?? '').trim().toLowerCase()
    if (q) all = all.filter((c) => c.title.toLowerCase().includes(q) || (c.subtitle ?? '').toLowerCase().includes(q))
    if (gmvMin != null) all = all.filter((c) => c.gmv != null && c.gmv >= gmvMin)
    if (ownerId) all = all.filter((c) => c.ownerId === ownerId)
    // Org: ordena dentro das colunas — classe (A+→C), GMV desc, nome asc.
    if (kind === 'org') {
      const rank = (b?: string | null) => ({ 'A+': 4, A: 3, B: 2, C: 1 } as Record<string, number>)[b ?? ''] ?? 0
      all = [...all].sort((a, b) =>
        (rank(b.badge) - rank(a.badge))
        || ((b.gmv ?? -Infinity) - (a.gmv ?? -Infinity))
        || a.title.localeCompare(b.title, 'pt-BR'))
    }
    return all
  }, [cardsQ.data, statusFilter, classFilter, search, gmvMin, ownerId, kind])

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
            showCidade={showCidade}
            showGmv={showGmv}
            onOpen={(e, href) => openItem(e, href)}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} kind={kind} showCidade={showCidade} showGmv={showGmv} dragging /> : null}
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
  showCidade,
  showGmv,
  onOpen,
  selectMode,
  selectedIds,
  onToggleSelect,
}: {
  id: string
  nome: string
  cor: string | null
  cards: KanbanCard[]
  kind: 'org' | 'opp'
  showCidade: boolean
  showGmv: boolean
  onOpen: (e: ReactMouseEvent, href: string) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const CAP = 60
  const shown = cards.slice(0, CAP)
  const gmvTotal = kind === 'org' && showGmv
    ? cards.reduce((s, c) => s + (c.gmv ?? 0), 0)
    : null
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: cor ?? 'var(--muted-foreground)' }}
            />
            <span className="truncate text-sm font-medium">{nome}</span>
          </div>
          <Badge variant="secondary">{cards.length}</Badge>
        </div>
        {gmvTotal != null && (
          <p className="mt-1 text-xs font-semibold tabular-nums text-muted-foreground">{fmtBRL(gmvTotal)}</p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? 'bg-primary/5' : ''
        }`}
      >
        {shown.map((c) => (
          <DraggableCard key={c.id} card={c} kind={kind} showCidade={showCidade} showGmv={showGmv} onOpen={onOpen} selectMode={selectMode} selected={!!selectedIds?.has(c.id)} onToggleSelect={onToggleSelect} />
        ))}
        {cards.length > CAP && (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">
            +{cards.length - CAP} — use a visão de lista ou a busca
          </p>
        )}
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
  showCidade,
  showGmv,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
}: {
  card: KanbanCard
  kind: 'org' | 'opp'
  showCidade: boolean
  showGmv: boolean
  onOpen: (e: ReactMouseEvent, href: string) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  })

  // Modo seleção (mudança em massa): sem drag, clique alterna a seleção.
  if (selectMode) {
    return (
      <div
        onClick={() => onToggleSelect?.(card.id)}
        className={`flex cursor-pointer gap-2 rounded-md border bg-card p-2.5 text-left shadow-sm transition-colors ${
          selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary'
        }`}
      >
        <Checkbox checked={!!selected} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <CardView card={card} kind={kind} showCidade={showCidade} showGmv={showGmv} />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => onOpen(e, card.href)}
      className={`cursor-pointer rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-opacity hover:border-primary ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <CardView card={card} kind={kind} showCidade={showCidade} showGmv={showGmv} />
    </div>
  )
}

function CardView({
  card,
  kind,
  showCidade = true,
  showGmv = true,
  dragging,
}: {
  card: KanbanCard
  kind: 'org' | 'opp'
  showCidade?: boolean
  showGmv?: boolean
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
        <span className="line-clamp-2 min-w-0 text-sm font-medium">{card.title}</span>
        {card.badge && (
          kind === 'org'
            ? <span className="shrink-0"><ClasseBadge classe={card.badge} /></span>
            : <Badge variant="outline" className="shrink-0">{card.badge}</Badge>
        )}
      </div>
      {card.subtitle && (kind !== 'org' || showCidade) && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {card.subtitle}
        </p>
      )}
      {kind === 'org' && showGmv && card.gmv != null && (
        <p className="mt-1 text-xs font-medium tabular-nums">
          {fmtBRL(card.gmv)}
        </p>
      )}
      {kind === 'opp' && (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <UserAvatar nome={card.ownerNome ?? null} color={card.ownerColor} size={20} />
            {card.meta && <p className="text-xs font-medium tabular-nums">{fmtBRL(Number(card.meta))}</p>}
          </div>
          {card.health && (
            <OppAcompControl
              oppId={card.id}
              href={card.href}
              health={card.health}
              proximaAcaoAt={card.proximaAcaoAt}
              atrasadaDesde={card.atrasadaDesde}
              className="shrink-0"
            />
          )}
        </div>
      )}
    </div>
  )
}
