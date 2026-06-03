import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GripVertical, Plus, EyeOff, Eye } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProfile } from '../../hooks/useProfile'
import {
  addStage,
  reorderStages,
  stageUsage,
  updateStage,
  useFunnel,
  type FunnelSlug,
  type FunnelStage,
} from '../../hooks/useFunnelStages'

export function FunisConfig() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funis</h1>
        <p className="text-sm text-muted-foreground">
          Estágios dos funis de relacionamento e de oportunidades. Arraste para
          reordenar.
        </p>
      </div>
      <Tabs defaultValue="relacionamento">
        <TabsList>
          <TabsTrigger value="relacionamento">Relacionamento</TabsTrigger>
          <TabsTrigger value="oportunidade">Oportunidades</TabsTrigger>
        </TabsList>
        <TabsContent value="relacionamento" className="mt-4">
          <FunnelEditor slug="relacionamento" />
        </TabsContent>
        <TabsContent value="oportunidade" className="mt-4">
          <FunnelEditor slug="oportunidade" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FunnelEditor({ slug }: { slug: FunnelSlug }) {
  const qc = useQueryClient()
  const { profile } = useProfile()
  const editable = profile?.role === 'gestor'
  const { type, stages, isLoading } = useFunnel(slug)

  const [order, setOrder] = useState<FunnelStage[]>([])
  useEffect(() => {
    setOrder(stages.filter((s) => s.ativo))
  }, [stages])
  const inativos = stages.filter((s) => !s.ativo)

  const [addOpen, setAddOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState('#60a5fa')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'funnel'] })

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const oldIdx = order.findIndex((s) => s.id === e.active.id)
    const newIdx = order.findIndex((s) => s.id === e.over!.id)
    const next = arrayMove(order, oldIdx, newIdx)
    setOrder(next)
    const ids = [...next.map((s) => s.id), ...inativos.map((s) => s.id)]
    try {
      await reorderStages(ids)
      refresh()
    } catch (err) {
      toast.error('Erro ao reordenar', { description: (err as Error).message })
      refresh()
    }
  }

  async function handleInativar(stage: FunnelStage) {
    const n = await stageUsage(stage.id)
    if (
      !window.confirm(
        n > 0
          ? `${n} registro(s) usam "${stage.nome}". Não dá para excluir — apenas inativar. Inativar agora?`
          : `Inativar o estágio "${stage.nome}"?`,
      )
    )
      return
    run(() => updateStage(stage.id, { ativo: false }))
  }

  if (isLoading) return <Skeleton className="h-64 w-full max-w-2xl" />

  return (
    <div className="max-w-2xl space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((s) => (
              <StageRow
                key={s.id}
                stage={s}
                editable={editable}
                onRename={(nome) => run(() => updateStage(s.id, { nome }))}
                onColor={(cor) => run(() => updateStage(s.id, { cor }))}
                onInativar={() => handleInativar(s)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editable && (
        <Button variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Adicionar estágio
        </Button>
      )}

      {inativos.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Inativos
          </p>
          {inativos.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 opacity-60"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.cor ?? 'var(--muted-foreground)' }}
                />
                <span className="text-sm">{s.nome}</span>
                <Badge variant="outline">inativo</Badge>
              </div>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => run(() => updateStage(s.id, { ativo: true }))}
                >
                  <Eye className="size-4" /> Reativar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo estágio</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={novaCor}
              onChange={(e) => setNovaCor(e.target.value)}
              className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
            <Input
              placeholder="Nome do estágio"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!type || !novoNome.trim()) return
                const seq = Math.max(0, ...stages.map((s) => s.sequencia)) + 1
                run(() =>
                  addStage(type.org_id, type.id, novoNome.trim(), novaCor, seq),
                )
                setNovoNome('')
                setAddOpen(false)
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StageRow({
  stage,
  editable,
  onRename,
  onColor,
  onInativar,
}: {
  stage: FunnelStage
  editable: boolean
  onRename: (nome: string) => void
  onColor: (cor: string) => void
  onInativar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id, disabled: !editable })
  const [nome, setNome] = useState(stage.nome)
  useEffect(() => setNome(stage.nome), [stage.nome])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 ${
        isDragging ? 'opacity-60 shadow-lg' : ''
      }`}
    >
      {editable ? (
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <input
        type="color"
        value={stage.cor ?? '#94a3b8'}
        disabled={!editable}
        onChange={(e) => onColor(e.target.value)}
        className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent disabled:cursor-default"
      />
      <Input
        className="h-8 flex-1"
        value={nome}
        disabled={!editable}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => nome.trim() && nome !== stage.nome && onRename(nome.trim())}
      />
      <span className="text-xs text-muted-foreground">#{stage.sequencia}</span>
      {editable && (
        <Button size="icon" variant="ghost" onClick={onInativar} title="Inativar">
          <EyeOff className="size-4" />
        </Button>
      )}
    </div>
  )
}
