import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Building2, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProfile } from '../hooks/useProfile'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useOrgOptions } from '../hooks/useCrmLookups'
import {
  useTasks, createTask, toggleTask, deleteTask, type TaskScope, type TaskRow,
} from '../hooks/useTasks'
import { fmtDate } from '@/lib/format'

export function Tarefas() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const isGestor = profile?.role === 'gestor'
  const [scope, setScope] = useState<TaskScope>('minhas')
  const { data, isLoading } = useTasks(scope, profile?.id)
  const orgs = useOrgOptions()

  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [venc, setVenc] = useState('')
  const [orgSel, setOrgSel] = useState('')

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['crm', 'tasks'] })
  }

  async function criar() {
    if (!orgId || !profile?.id || !titulo.trim()) return
    try {
      await createTask(orgId, profile.id, {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        data_vencimento: venc || null,
        organization_id: orgSel || null,
      })
      invalidate()
      setOpen(false); setTitulo(''); setDescricao(''); setVenc(''); setOrgSel('')
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function onToggle(t: TaskRow) {
    try { await toggleTask(t.id, !t.concluida); invalidate() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function onDelete(t: TaskRow) {
    try { await deleteTask(t.id); invalidate() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} tarefas.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova tarefa</Button>
      </div>

      {isGestor && (
        <Tabs value={scope} onValueChange={(v) => setScope(v as TaskScope)}>
          <TabsList>
            <TabsTrigger value="minhas">Minhas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">Nenhuma tarefa.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(data ?? []).map((t) => {
              const atrasada = !t.concluida && t.data_vencimento && t.data_vencimento < hoje
              return (
                <li key={t.id} className="flex items-start gap-3 p-3">
                  <Checkbox checked={t.concluida} onCheckedChange={() => onToggle(t)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${t.concluida ? 'text-muted-foreground line-through' : ''}`}>
                      {t.titulo}
                    </div>
                    {t.descricao && <div className="text-sm text-muted-foreground">{t.descricao}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t.data_vencimento && (
                        <span className={`inline-flex items-center gap-1 ${atrasada ? 'text-destructive' : ''}`}>
                          <Calendar className="size-3" /> {fmtDate(t.data_vencimento)}
                        </span>
                      )}
                      {t.organization_nome && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3" /> {t.organization_nome}
                        </span>
                      )}
                      {isGestor && scope === 'todas' && t.owner_nome && (
                        <Badge variant="outline">{t.owner_nome}</Badge>
                      )}
                      {atrasada && <Badge variant="destructive">Atrasada</Badge>}
                    </div>
                  </div>
                  <button onClick={() => onDelete(t)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={titulo} autoFocus onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Organização</Label>
                <Select value={orgSel} onValueChange={setOrgSel}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    {(orgs.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={!titulo.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
