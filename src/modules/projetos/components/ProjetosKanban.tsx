import { useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, HTMLAttributes } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useProjetos } from '../store'
import { TRILHAS } from '../types'
import type { Acao } from '../types'
import { AcaoCard } from './AcaoCard'

export type Agrupamento = 'objetivo' | 'area'

interface Coluna {
  key: string
  title: string
  /** Etiqueta secundária (ex.: "Empresa" ou o nome da área do objetivo). */
  tag?: string
  cor: string
  cardIds: string[]
  /** Reclassifica a ação ao soltar nesta coluna. */
  apply: (acaoId: string) => void
  /** Valores iniciais ao criar uma ação direto nesta coluna. */
  preset: Partial<Acao>
}

const COL = 'colsort:'

export function ProjetosKanban({
  acoes,
  agrupamento,
  columnOrder,
  onColumnOrderChange,
  onOpen,
  onAdd,
}: {
  acoes: Acao[]
  agrupamento: Agrupamento
  /** Ordem manual das colunas (por key). Keys novas entram no fim. */
  columnOrder: string[]
  onColumnOrderChange: (keys: string[]) => void
  onOpen: (id: string) => void
  onAdd: (preset: Partial<Acao>) => void
}) {
  const store = useProjetos()
  const { objetivos, areas } = store
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeColKey, setActiveColKey] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Colunas na ordem "natural" (antes de aplicar a ordem manual salva).
  const baseColumns = useMemo<Coluna[]>(() => {
    if (agrupamento === 'objetivo') {
      const empresa = objetivos.filter((o) => o.tipo === 'empresa')
      const area = objetivos.filter((o) => o.tipo === 'area')
      const cols: Coluna[] = []
      for (const o of empresa) {
        cols.push({
          key: `ob:${o.id}`,
          title: o.nome,
          tag: 'Empresa',
          cor: TRILHAS.estrategico.cor,
          cardIds: acoes.filter((a) => a.objetivoId === o.id).map((a) => a.id),
          apply: (id) => store.setVinculo(id, { objetivoId: o.id, semVinculo: null }),
          preset: { objetivoId: o.id, semVinculo: null },
        })
      }
      for (const o of area) {
        cols.push({
          key: `ob:${o.id}`,
          title: o.nome,
          tag: areas.find((a) => a.id === o.areaId)?.nome ?? 'Área',
          cor: TRILHAS.area.cor,
          cardIds: acoes.filter((a) => a.objetivoId === o.id).map((a) => a.id),
          apply: (id) => store.setVinculo(id, { objetivoId: o.id, semVinculo: null }),
          preset: { objetivoId: o.id, semVinculo: null, areaId: o.areaId },
        })
      }
      cols.push({
        key: 'avulso',
        title: 'Avulso',
        cor: TRILHAS.avulso.cor,
        cardIds: acoes.filter((a) => !a.objetivoId && a.semVinculo === 'avulso').map((a) => a.id),
        apply: (id) => store.setVinculo(id, { objetivoId: null, semVinculo: 'avulso' }),
        preset: { objetivoId: null, semVinculo: 'avulso' },
      })
      cols.push({
        key: 'rotina',
        title: 'Rotina',
        cor: TRILHAS.rotina.cor,
        cardIds: acoes.filter((a) => !a.objetivoId && a.semVinculo === 'rotina').map((a) => a.id),
        apply: (id) => store.setVinculo(id, { objetivoId: null, semVinculo: 'rotina' }),
        preset: { objetivoId: null, semVinculo: 'rotina' },
      })
      return cols
    }
    // agrupamento por área
    const cols: Coluna[] = areas.map((ar) => ({
      key: `ar:${ar.id}`,
      title: ar.nome,
      cor: '#94a3b8',
      cardIds: acoes.filter((a) => a.areaId === ar.id).map((a) => a.id),
      apply: (id) => store.setAcaoArea(id, ar.id),
      preset: { areaId: ar.id },
    }))
    cols.push({
      key: 'ar:none',
      title: 'Sem área',
      cor: '#94a3b8',
      cardIds: acoes.filter((a) => a.areaId == null).map((a) => a.id),
      apply: (id) => store.setAcaoArea(id, null),
      preset: { areaId: null },
    })
    return cols
  }, [agrupamento, acoes, objetivos, areas, store])

  // Aplica a ordem manual: keys conhecidas primeiro (na ordem salva), novas no fim.
  const columns = useMemo<Coluna[]>(() => {
    const byKey = new Map(baseColumns.map((c) => [c.key, c]))
    const known = columnOrder.map((k) => byKey.get(k)).filter((c): c is Coluna => !!c)
    const rest = baseColumns.filter((c) => !columnOrder.includes(c.key))
    return [...known, ...rest]
  }, [baseColumns, columnOrder])

  const colSortIds = useMemo(() => columns.map((c) => `${COL}${c.key}`), [columns])

  const cardColKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of columns) for (const id of c.cardIds) m.set(id, c.key)
    return m
  }, [columns])

  const acaoById = useMemo(() => new Map(acoes.map((a) => [a.id, a])), [acoes])
  const activeAcao = activeId ? acaoById.get(activeId) ?? null : null
  const activeCol = activeColKey ? columns.find((c) => c.key === activeColKey) ?? null : null

  // Separa os alvos de colisão por tipo de arrasto: coluna colide só com coluna;
  // card colide só com cards e áreas de coluna (nunca com o nó da coluna).
  const collision: CollisionDetection = (args) => {
    const type = args.active.data.current?.type
    const containers = args.droppableContainers.filter((c) => {
      const id = String(c.id)
      return type === 'column' ? id.startsWith(COL) : !id.startsWith(COL)
    })
    return closestCorners({ ...args, droppableContainers: containers })
  }

  function onDragStart(e: DragStartEvent) {
    if (e.active.data.current?.type === 'column') setActiveColKey(String(e.active.id).slice(COL.length))
    else setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    const type = e.active.data.current?.type
    setActiveId(null)
    setActiveColKey(null)
    if (!e.over) return

    // Reordenação de colunas
    if (type === 'column') {
      const fromKey = String(e.active.id).slice(COL.length)
      const overId = String(e.over.id)
      const toKey = overId.startsWith(COL) ? overId.slice(COL.length) : null
      if (!toKey || fromKey === toKey) return
      const keys = columns.map((c) => c.key)
      const from = keys.indexOf(fromKey)
      const to = keys.indexOf(toKey)
      if (from < 0 || to < 0) return
      onColumnOrderChange(arrayMove(keys, from, to))
      return
    }

    // Mover/reordenar cards
    const dragId = String(e.active.id)
    const overId = String(e.over.id)
    const sourceCol = cardColKey.get(dragId)
    let destColKey: string
    let overCardId: string | null = null
    if (overId.startsWith('col:')) {
      destColKey = overId.slice(4)
    } else {
      overCardId = overId
      destColKey = cardColKey.get(overId) ?? sourceCol ?? ''
    }
    if (destColKey && destColKey !== sourceCol) {
      columns.find((c) => c.key === destColKey)?.apply(dragId)
      if (overCardId) store.reorderAcoes(dragId, overCardId)
    } else if (overCardId && overCardId !== dragId) {
      store.reorderAcoes(dragId, overCardId)
    }
  }

  // --- Arrastar o fundo do quadro para rolar lateralmente ---
  const scrollRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ startX: number; scrollLeft: number } | null>(null)
  const [panning, setPanning] = useState(false)

  function onMouseDown(e: ReactMouseEvent) {
    // Só inicia o pan em áreas "vazias" — nunca sobre cards, colunas ou controles.
    if ((e.target as HTMLElement).closest('[data-no-pan]')) return
    const el = scrollRef.current
    if (!el) return
    pan.current = { startX: e.clientX, scrollLeft: el.scrollLeft }
    setPanning(true)
  }
  function onMouseMove(e: ReactMouseEvent) {
    if (!pan.current || !scrollRef.current) return
    scrollRef.current.scrollLeft = pan.current.scrollLeft - (e.clientX - pan.current.startX)
  }
  function endPan() {
    pan.current = null
    setPanning(false)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setActiveColKey(null) }}
    >
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        className={cn(
          'flex h-full items-start gap-3 overflow-x-auto p-4 select-none',
          panning ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <SortableContext items={colSortIds} strategy={horizontalListSortingStrategy}>
          {columns.map((col) => (
            <Column key={col.key} col={col} onOpen={onOpen} onAdd={onAdd} activeId={activeId} />
          ))}
        </SortableContext>
      </div>

      <DragOverlay>
        {activeAcao ? (
          <div className="w-64"><AcaoCard acao={activeAcao} dragging /></div>
        ) : activeCol ? (
          <ColumnHeader col={activeCol} onAdd={onAdd} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  col,
  onOpen,
  onAdd,
  activeId,
}: {
  col: Coluna
  onOpen: (id: string) => void
  onAdd: (preset: Partial<Acao>) => void
  activeId: string | null
}) {
  const { setNodeRef: setSortRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } =
    useSortable({ id: `${COL}${col.key}`, data: { type: 'column' } })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `col:${col.key}` })

  return (
    <div
      ref={setSortRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30', isDragging && 'opacity-40')}
    >
      <ColumnHeader
        col={col}
        onAdd={onAdd}
        handleRef={setActivatorNodeRef}
        handleProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLButtonElement>}
      />
      <div
        ref={setDropRef}
        className={cn('flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors', isOver && 'bg-primary/5')}
      >
        <SortableContext items={col.cardIds} strategy={verticalListSortingStrategy}>
          {col.cardIds.map((id) => (
            <SortableCard key={id} id={id} onOpen={onOpen} activeId={activeId} />
          ))}
        </SortableContext>
        {col.cardIds.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Solte uma ação aqui</p>
        )}
      </div>
    </div>
  )
}

/** Cabeçalho da coluna (reutilizado no overlay de arrasto). */
function ColumnHeader({
  col,
  onAdd,
  handleRef,
  handleProps,
  dragging,
}: {
  col: Coluna
  onAdd: (preset: Partial<Acao>) => void
  handleRef?: (el: HTMLElement | null) => void
  handleProps?: HTMLAttributes<HTMLButtonElement>
  dragging?: boolean
}) {
  return (
    <div
      data-no-pan
      className={cn(
        'flex items-start justify-between gap-1 border-b border-border px-2 py-2',
        dragging && 'w-72 rounded-lg border bg-muted shadow-lg',
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        <button
          ref={handleRef}
          {...handleProps}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
          title="Arraste para reordenar a coluna"
          aria-label="Reordenar coluna"
        >
          <GripVertical className="size-4" />
        </button>
        {/* Nome por extenso — sem cortar; quebra em várias linhas. Bolinha e
            etiqueta ficam inline para fluírem junto do texto. */}
        <span className="min-w-0 text-sm font-medium leading-snug">
          <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: col.cor }} />
          {col.title}
          {col.tag && (
            <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
              {col.tag}
            </span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">{col.cardIds.length}</span>
        <button
          type="button"
          onClick={() => onAdd(col.preset)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title="Nova ação nesta coluna"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

function SortableCard({ id, onOpen, activeId }: { id: string; onOpen: (id: string) => void; activeId: string | null }) {
  const store = useProjetos()
  const acao = store.acoes.find((a) => a.id === id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'card' } })
  if (!acao) return null
  return (
    <div
      ref={setNodeRef}
      data-no-pan
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging || activeId === id ? 0.4 : 1 }}
    >
      <AcaoCard acao={acao} onOpen={onOpen} />
    </div>
  )
}
