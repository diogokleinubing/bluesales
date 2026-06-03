import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CurrencyField } from '../components/EditFields'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useLocalOptions, useOrgOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import {
  useCrmEvents, saveCrmEvent, deleteCrmEvent, EVENTO_STATUS, type CrmEventRow, type EventoStatus,
} from '../hooks/useCadastros'
import { fmtBRL, fmtDate } from '@/lib/format'

const NONE = '__none__'

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  Planejado: 'secondary',
  Confirmado: 'default',
  Cancelado: 'destructive',
  Realizado: 'outline',
}

export function EventosCrm() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useCrmEvents()
  const locais = useLocalOptions()
  const orgs = useOrgOptions()
  const segs = useSegmentOptions()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<CrmEventRow | null>(null)
  const [f, setF] = useState({
    nome: '', data_prevista: '', local_id: NONE, organization_id: NONE,
    capacidade_estimada: '', gmv_estimado: '', segmento_id: NONE,
    status: 'Planejado' as EventoStatus, observacoes: '', bi_event_codigo: '',
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) =>
      (!q || e.nome.toLowerCase().includes(q)) &&
      (statusFilter === 'todos' || e.status === statusFilter))
  }, [data, search, statusFilter])

  function openNew() {
    setEdit(null)
    setF({
      nome: '', data_prevista: '', local_id: NONE, organization_id: NONE,
      capacidade_estimada: '', gmv_estimado: '', segmento_id: NONE,
      status: 'Planejado', observacoes: '', bi_event_codigo: '',
    })
    setOpen(true)
  }
  function openEdit(e: CrmEventRow) {
    setEdit(e)
    setF({
      nome: e.nome,
      data_prevista: e.data_prevista ?? '',
      local_id: e.local_id ?? NONE,
      organization_id: e.organization_id ?? NONE,
      capacidade_estimada: e.capacidade_estimada != null ? String(e.capacidade_estimada) : '',
      gmv_estimado: e.gmv_estimado != null ? String(Math.round(e.gmv_estimado)) : '',
      segmento_id: e.segmento_id ?? NONE,
      status: e.status,
      observacoes: e.observacoes ?? '',
      bi_event_codigo: e.bi_event_codigo ?? '',
    })
    setOpen(true)
  }

  async function salvar() {
    if (!orgId || !f.nome.trim()) return
    try {
      await saveCrmEvent(orgId, {
        nome: f.nome.trim(),
        data_prevista: f.data_prevista || null,
        local_id: f.local_id === NONE ? null : f.local_id,
        organization_id: f.organization_id === NONE ? null : f.organization_id,
        capacidade_estimada: f.capacidade_estimada ? Number(f.capacidade_estimada) : null,
        gmv_estimado: f.gmv_estimado ? Number(f.gmv_estimado) : null,
        segmento_id: f.segmento_id === NONE ? null : f.segmento_id,
        status: f.status,
        observacoes: f.observacoes.trim() || null,
        bi_event_codigo: f.bi_event_codigo.trim() || null,
      }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(e: CrmEventRow) {
    try { await deleteCrmEvent(e.id); qc.invalidateQueries({ queryKey: ['crm', 'events'] }) }
    catch (err) { toast.error('Erro', { description: (err as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos comerciais</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} eventos em prospecção/planejamento.</p>
        </div>
        <Button onClick={openNew}><Plus className="size-4" /> Novo evento</Button>
      </div>
      <Card><CardContent className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {EVENTO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Data</TableHead><TableHead>Local</TableHead>
            <TableHead>Organização</TableHead><TableHead className="text-right">GMV est.</TableHead>
            <TableHead>Status</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum evento.</TableCell></TableRow>
            ) : rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nome}</TableCell>
                <TableCell className="text-muted-foreground">{e.data_prevista ? fmtDate(e.data_prevista) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{e.local_nome ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{e.organization_nome ?? '—'}</TableCell>
                <TableCell className="text-right">{e.gmv_estimado != null ? fmtBRL(e.gmv_estimado) : '—'}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(e)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                    <button onClick={() => remover(e)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{edit ? 'Editar evento' : 'Novo evento'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Nome</Label>
              <Input value={f.nome} autoFocus onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div className="space-y-1"><Label>Data prevista</Label>
              <Input type="date" value={f.data_prevista} onChange={(e) => setF({ ...f, data_prevista: e.target.value })} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as EventoStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Local</Label>
              <Select value={f.local_id} onValueChange={(v) => setF({ ...f, local_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(locais.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Organização</Label>
              <Select value={f.organization_id} onValueChange={(v) => setF({ ...f, organization_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(orgs.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Segmento</Label>
              <Select value={f.segmento_id} onValueChange={(v) => setF({ ...f, segmento_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(segs.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Capacidade estimada</Label>
              <Input type="number" value={f.capacidade_estimada} onChange={(e) => setF({ ...f, capacidade_estimada: e.target.value })} /></div>
            <CurrencyField label="GMV estimado" value={f.gmv_estimado} onChange={(v) => setF({ ...f, gmv_estimado: v })} />
            <div className="space-y-1"><Label>Código BI</Label>
              <Input value={f.bi_event_codigo} onChange={(e) => setF({ ...f, bi_event_codigo: e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label>Observações</Label>
              <Textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!f.nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
