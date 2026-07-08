import { useMemo, useState } from 'react'
import { X, GripVertical, Trash2 } from 'lucide-react'
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useProjetos } from '../store'
import { pessoaNome, trilhaDaAcao } from '../lib/compute'
import type { Acao, Tarefa } from '../types'
import { PageShell, ToolbarSearch, MultiSelect, TOOLBAR_TRIGGER } from '../components/Shell'
import { TipoToggle, TrilhaBadge } from '../components/bits'
import { AcaoDialog } from '../components/AcaoDialog'

const ALL = '__all__'
const SEM = '__none__'

/** Data de hoje em ISO (yyyy-mm-dd) — para destacar prazos vencidos. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function Tarefas() {
  const store = useProjetos()
  const { areas, objetivos, pessoas, acoes, tarefas } = store

  const [areaSel, setAreaSel] = useState<string[]>([])
  const [objSel, setObjSel] = useState<string>(ALL)
  // Visão padrão já filtrada por "você" (usuário logado), quando definido.
  const [respSel, setRespSel] = useState<string[]>(() => (store.currentPessoaId ? [store.currentPessoaId] : []))
  const [editor, setEditor] = useState<string | null>(null)

  const acaoById = useMemo(() => new Map(acoes.map((a) => [a.id, a])), [acoes])

  // Junta cada tarefa com a ação-mãe, na ordem manual (do array) — o que permite
  // reordenar aqui e refletir dentro do card.
  const linhas = useMemo(() => {
    const q = store.busca.trim().toLowerCase()
    return tarefas
      .map((t) => ({ t, acao: acaoById.get(t.acaoId) }))
      .filter((x): x is { t: Tarefa; acao: Acao } => !!x.acao)
      .filter(({ t, acao }) => {
        if (areaSel.length > 0 && (acao.areaId == null || !areaSel.includes(acao.areaId))) return false
        if (objSel !== ALL) {
          if (objSel === 'avulso' || objSel === 'rotina') {
            if (acao.objetivoId || acao.semVinculo !== objSel) return false
          } else if (acao.objetivoId !== objSel) return false
        }
        if (respSel.length > 0 && (t.responsavelId == null || !respSel.includes(t.responsavelId))) return false
        if (q) {
          const nome = pessoaNome(t.responsavelId, pessoas).toLowerCase()
          if (!t.titulo.toLowerCase().includes(q) && !acao.titulo.toLowerCase().includes(q) && !nome.includes(q)) return false
        }
        return true
      })
  }, [tarefas, acaoById, areaSel, objSel, respSel, store.busca, pessoas])

  const feitas = linhas.filter((l) => l.t.concluida).length
  const temFiltro = store.busca.trim() !== '' || areaSel.length > 0 || objSel !== ALL || respSel.length > 0
  function limpar() {
    store.setBusca('')
    setAreaSel([])
    setObjSel(ALL)
    setRespSel([])
  }

  const empresaObjs = objetivos.filter((o) => o.tipo === 'empresa')
  const areaObjs = objetivos.filter((o) => o.tipo === 'area')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) store.reorderTarefas(String(e.active.id), String(e.over.id))
  }

  const hoje = hojeISO()

  const toolbar = (
    <>
      <ToolbarSearch value={store.busca} onChange={store.setBusca} placeholder="Buscar tarefa, ação ou pessoa…" />
      <MultiSelect
        label="Área"
        options={areas.map((a) => ({ value: a.id, label: a.nome }))}
        selected={areaSel}
        onChange={setAreaSel}
      />
      <Select value={objSel} onValueChange={setObjSel}>
        <SelectTrigger className={cn(TOOLBAR_TRIGGER, 'w-[190px]')}><SelectValue placeholder="Objetivo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os objetivos</SelectItem>
          {empresaObjs.length > 0 && (
            <SelectGroup>
              <SelectLabel>Empresa</SelectLabel>
              {empresaObjs.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectGroup>
          )}
          {areaObjs.length > 0 && (
            <SelectGroup>
              <SelectLabel>Área</SelectLabel>
              {areaObjs.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>Sem objetivo</SelectLabel>
            <SelectItem value="avulso">Avulso</SelectItem>
            <SelectItem value="rotina">Rotina</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <MultiSelect
        label="Responsável"
        options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        selected={respSel}
        onChange={setRespSel}
      />
      {temFiltro && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={limpar}>
          <X className="size-3.5" /> Limpar
        </Button>
      )}
    </>
  )

  return (
    <>
      <PageShell title="Tarefas" count={`${feitas}/${linhas.length} concluídas`} toolbar={toolbar}>
        {linhas.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma tarefa {temFiltro ? 'com esses filtros.' : 'ainda — crie tarefas dentro de uma ação.'}
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={linhas.map((l) => l.t.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-border">
                {linhas.map(({ t, acao }) => (
                  <TarefaRow
                    key={t.id}
                    tarefa={t}
                    acao={acao}
                    hoje={hoje}
                    areaNome={areas.find((ar) => ar.id === acao.areaId)?.nome}
                    trilha={trilhaDaAcao(acao, objetivos)}
                    pessoas={pessoas}
                    onOpenAcao={() => setEditor(acao.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </PageShell>

      {editor && <AcaoDialog open onOpenChange={(v) => !v && setEditor(null)} acaoId={editor} />}
    </>
  )
}

function TarefaRow({
  tarefa: t,
  acao,
  hoje,
  areaNome,
  trilha,
  pessoas,
  onOpenAcao,
}: {
  tarefa: Tarefa
  acao: Acao
  hoje: string
  areaNome?: string
  trilha: ReturnType<typeof trilhaDaAcao>
  pessoas: { id: string; nome: string }[]
  onOpenAcao: () => void
}) {
  const store = useProjetos()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id })
  const atrasada = !!t.prazo && !t.concluida && t.prazo < hoje

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 bg-background px-4 py-2"
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
        title="Arraste para reordenar"
        aria-label="Reordenar tarefa"
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox checked={t.concluida} onCheckedChange={() => store.toggleTarefa(t.id)} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <Input
          value={t.titulo}
          placeholder="Título da tarefa"
          onChange={(e) => store.updateTarefa(t.id, { titulo: e.target.value })}
          className={cn(
            'h-7 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:bg-card focus-visible:ring-1',
            t.concluida && 'text-muted-foreground line-through',
          )}
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-xs text-muted-foreground">
          <button type="button" onClick={onOpenAcao} className="truncate underline-offset-2 hover:text-foreground hover:underline" title={acao.titulo}>
            {acao.titulo}
          </button>
          <TrilhaBadge trilha={trilha} />
          {areaNome && <span>· {areaNome}</span>}
        </div>
      </div>

      <TipoToggle value={t.tipo} onChange={(tp) => store.updateTarefa(t.id, { tipo: tp })} />

      <input
        type="date"
        value={t.prazo ?? ''}
        onChange={(e) => store.updateTarefa(t.id, { prazo: e.target.value || null })}
        title={atrasada ? 'Prazo vencido' : 'Prazo (opcional)'}
        className={cn(
          'h-7 shrink-0 rounded-md border bg-card px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring',
          atrasada ? 'border-destructive/50 text-destructive' : 'border-border text-muted-foreground',
        )}
      />

      <Select value={t.responsavelId ?? SEM} onValueChange={(v) => store.updateTarefa(t.id, { responsavelId: v === SEM ? null : v })}>
        <SelectTrigger className="h-7 w-32 shrink-0 text-xs"><SelectValue placeholder="Resp." /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM}>Sem resp.</SelectItem>
          {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={() => store.removeTarefa(t.id)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        title="Remover tarefa"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
