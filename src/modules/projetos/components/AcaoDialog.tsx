import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useProjetos } from '../store'
import { trilhaDaAcao } from '../lib/compute'
import { STATUS_ORDER, STATUS } from '../types'
import type { Acao, Tarefa } from '../types'
import { TipoToggle, TrilhaBadge } from './bits'

const SEM = '__none__'

type TarefaDraft = Omit<Tarefa, 'id' | 'acaoId'>

/** Converte vínculo (objetivoId | avulso | rotina) num valor de <Select>. */
function vinculoValue(a: Pick<Acao, 'objetivoId' | 'semVinculo'>): string {
  return a.objetivoId ?? a.semVinculo ?? 'avulso'
}
function vinculoFromValue(v: string): Pick<Acao, 'objetivoId' | 'semVinculo'> {
  if (v === 'avulso' || v === 'rotina') return { objetivoId: null, semVinculo: v }
  return { objetivoId: v, semVinculo: null }
}

export function AcaoDialog({
  open,
  onOpenChange,
  acaoId,
  preset,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Quando definido, edita a ação; caso contrário cria uma nova. */
  acaoId: string | null
  /** Valores iniciais ao criar (ex.: ao clicar "+" numa coluna do kanban). */
  preset?: Partial<Acao>
}) {
  const store = useProjetos()
  const { areas, pessoas, objetivos } = store
  const editing = acaoId ? store.acoes.find((a) => a.id === acaoId) ?? null : null

  // Rascunho local — só para o modo criação. Na edição, tudo é write-through.
  const [form, setForm] = useState<Omit<Acao, 'id'>>(() => ({
    titulo: '',
    detalhes: '',
    areaId: preset?.areaId ?? null,
    responsavelId: null,
    status: 'a_fazer',
    objetivoId: preset?.objetivoId ?? null,
    semVinculo: preset?.objetivoId ? null : preset?.semVinculo ?? 'avulso',
  }))
  const [draftTarefas, setDraftTarefas] = useState<TarefaDraft[]>([])

  const acao = editing ?? (form as Acao)
  const trilha = trilhaDaAcao(acao, objetivos)

  const tarefas = useMemo(
    () => (editing ? store.tarefas.filter((t) => t.acaoId === editing.id) : draftTarefas),
    [editing, store.tarefas, draftTarefas],
  )

  const empresaObjs = objetivos.filter((o) => o.tipo === 'empresa')
  const areaObjs = objetivos.filter((o) => o.tipo === 'area')

  // --- setters (edição = write-through na store; criação = rascunho) ---
  function setField<K extends keyof Acao>(key: K, value: Acao[K]) {
    if (editing) store.updateAcao(editing.id, { [key]: value })
    else setForm((f) => ({ ...f, [key]: value }))
  }
  function setVinculo(v: string) {
    const patch = vinculoFromValue(v)
    if (editing) store.setVinculo(editing.id, patch)
    else setForm((f) => ({ ...f, ...patch }))
  }

  // --- tarefas ---
  function addTarefaLocal() {
    if (editing) store.addTarefa(editing.id, { titulo: '' })
    else setDraftTarefas((ts) => [...ts, { titulo: '', responsavelId: null, tipo: 'execucao', concluida: false, prazo: null }])
  }
  function patchTarefa(idx: number, id: string | undefined, patch: Partial<TarefaDraft>) {
    if (editing && id) store.updateTarefa(id, patch)
    else setDraftTarefas((ts) => ts.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }
  function toggleTarefaLocal(idx: number, id: string | undefined) {
    if (editing && id) store.toggleTarefa(id)
    else setDraftTarefas((ts) => ts.map((t, i) => (i === idx ? { ...t, concluida: !t.concluida } : t)))
  }
  function removeTarefaLocal(idx: number, id: string | undefined) {
    if (editing && id) store.removeTarefa(id)
    else setDraftTarefas((ts) => ts.filter((_, i) => i !== idx))
  }

  function handleClose() {
    onOpenChange(false)
  }
  function criar() {
    const id = store.addAcao(form)
    for (const t of draftTarefas) if (t.titulo.trim()) store.addTarefa(id, t)
    handleClose()
  }
  function excluir() {
    if (!editing) return
    if (confirm('Excluir esta ação e suas tarefas?')) {
      store.removeAcao(editing.id)
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? 'Editar ação' : 'Nova ação'}
            <TrilhaBadge trilha={trilha} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Título</label>
            <Input
              autoFocus
              value={acao.titulo}
              placeholder="O que será feito?"
              onChange={(e) => setField('titulo', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Detalhes</label>
            <Textarea
              value={acao.detalhes}
              placeholder="Contexto, escopo, links… (opcional)"
              rows={3}
              onChange={(e) => setField('detalhes', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Vínculo (define a trilha) */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Vínculo</label>
              <Select value={vinculoValue(acao)} onValueChange={setVinculo}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {empresaObjs.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Objetivos da empresa</SelectLabel>
                      {empresaObjs.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectGroup>
                  )}
                  {areaObjs.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Objetivos de área</SelectLabel>
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
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Área</label>
              <Select value={acao.areaId ?? SEM} onValueChange={(v) => setField('areaId', v === SEM ? null : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem área</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Responsável</label>
              <Select value={acao.responsavelId ?? SEM} onValueChange={(v) => setField('responsavelId', v === SEM ? null : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem responsável</SelectItem>
                  {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <Select value={acao.status} onValueChange={(v) => setField('status', v as Acao['status'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: STATUS[s].cor }} />
                        {STATUS[s].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tarefas */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tarefas {tarefas.length > 0 && `(${tarefas.filter((t) => t.concluida).length}/${tarefas.length})`}
              </label>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addTarefaLocal}>
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-1.5">
              {tarefas.length === 0 && (
                <p className="rounded-md border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
                  Nenhuma tarefa ainda.
                </p>
              )}
              {tarefas.map((t, idx) => {
                const id = 'id' in t ? (t as Tarefa).id : undefined
                return (
                  <div key={id ?? idx} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                    <Checkbox checked={t.concluida} onCheckedChange={() => toggleTarefaLocal(idx, id)} />
                    <Input
                      value={t.titulo}
                      placeholder="Título da tarefa"
                      onChange={(e) => patchTarefa(idx, id, { titulo: e.target.value })}
                      className={cn('h-7 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0', t.concluida && 'text-muted-foreground line-through')}
                    />
                    <TipoToggle value={t.tipo} onChange={(tp) => patchTarefa(idx, id, { tipo: tp })} />
                    <input
                      type="date"
                      value={t.prazo ?? ''}
                      onChange={(e) => patchTarefa(idx, id, { prazo: e.target.value || null })}
                      title="Prazo (opcional)"
                      className="h-7 shrink-0 rounded-md border border-border bg-card px-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Select value={t.responsavelId ?? SEM} onValueChange={(v) => patchTarefa(idx, id, { responsavelId: v === SEM ? null : v })}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Resp." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM}>Sem resp.</SelectItem>
                        {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => removeTarefaLocal(idx, id)}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      title="Remover tarefa"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          {editing ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={excluir}>
              <Trash2 className="size-4" /> Excluir
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>{editing ? 'Fechar' : 'Cancelar'}</Button>
            {!editing && <Button onClick={criar} disabled={!form.titulo.trim()}>Criar ação</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
