import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { readStr, buildSearchParams } from '@/lib/urlState'
import { useOpenItem } from '@/lib/useOpenItem'
import { Plus, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useOpportunities, setOpportunitiesOwner } from '../hooks/useOpportunities'
import { useUserOptions } from '../hooks/useCrmLookups'
import { useFunnel } from '../hooks/useFunnelStages'
import { useViewPref } from '../hooks/useViewPref'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import { KanbanBoard } from '../components/KanbanBoard'
import { ListView, ViewToggle, ToolbarSearch, TOOLBAR_TRIGGER } from '../components/ListView'
import { fmtBRL } from '@/lib/format'

const ALL = '__all__'
const ABERTA = '__aberta__'

function statusBadge(resultado: 'Ganho' | 'Perdida' | null) {
  if (resultado === 'Ganho') return <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Ganho</Badge>
  if (resultado === 'Perdida') return <Badge variant="destructive">Perdida</Badge>
  return <Badge variant="secondary">Em aberto</Badge>
}

export function Oportunidades() {
  const openItem = useOpenItem()
  const { data, isLoading } = useOpportunities()
  const { stages } = useFunnel('oportunidade')
  const [view, setView] = useViewPref('crm:oppView', 'list')
  const [params, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => readStr(params, 'search'))
  const [stageF, setStageF] = useState(() => readStr(params, 'stage', ALL))
  const [statusF, setStatusF] = useState(() => readStr(params, 'result', ALL))
  const [ownerF, setOwnerF] = useState(() => readStr(params, 'owner', ALL))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'search', v: search },
      { k: 'stage', v: stageF, def: ALL },
      { k: 'result', v: statusF, def: ALL },
      { k: 'owner', v: ownerF, def: ALL },
    ]), { replace: true })
  }, [search, stageF, statusF, ownerF, setSearchParams])

  // Responsáveis com oportunidade ativa (em aberto) — opções do filtro.
  const ownerOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of data ?? []) {
      if (o.resultado == null && o.owner_id) m.set(o.owner_id, o.ownerNome ?? '—')
    }
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [data])
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const userOptions = useUserOptions()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwner, setBulkOwner] = useState('')
  const [applying, setApplying] = useState(false)

  function toggleSel(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function sairSelecao() { setSelectMode(false); setSelected(new Set()); setBulkOwner('') }
  async function aplicarResponsavel() {
    if (!bulkOwner || selected.size === 0) return
    setApplying(true)
    try {
      await setOpportunitiesOwner([...selected], bulkOwner)
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      toast.success(`Responsável atualizado em ${selected.size} oportunidade(s)`)
      sairSelecao()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setApplying(false) }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((o) => {
      if (q && !o.titulo.toLowerCase().includes(q) && !(o.orgNome ?? '').toLowerCase().includes(q)) return false
      if (stageF !== ALL && o.stage_id !== stageF) return false
      if (statusF === ABERTA && o.resultado != null) return false
      if (statusF !== ALL && statusF !== ABERTA && o.resultado !== statusF) return false
      if (ownerF !== ALL && o.owner_id !== ownerF) return false
      return true
    })
  }, [data, search, stageF, statusF, ownerF])

  return (
    <>
      <ListView
        title="Funil de Prospecção"
        count={data ? String(data.length) : undefined}
        actions={
          <>
            <Select value={ownerF} onValueChange={setOwnerF}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-40`} size="sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {ownerOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <ViewToggle view={view} onChange={setView} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-8 shrink-0" title="Ações em massa">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setSelected(new Set()); setBulkOwner(''); setSelectMode(true) }}>
                  Mudar responsável…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova oportunidade</Button>
          </>
        }
        footer={view === 'list' && data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          <>
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por título ou organização…" />
            {view === 'list' && (
              <>
                <Select value={statusF} onValueChange={setStatusF}>
                  <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos os status</SelectItem>
                    <SelectItem value={ABERTA}>Em aberto</SelectItem>
                    <SelectItem value="Ganho">Ganho</SelectItem>
                    <SelectItem value="Perdida">Perdida</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={stageF} onValueChange={setStageF}>
                  <SelectTrigger className={`${TOOLBAR_TRIGGER} w-56`} size="sm"><SelectValue placeholder="Estágio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos os estágios</SelectItem>
                    {stages.filter((s) => s.ativo).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
          </>
        }
      >
        {view === 'kanban' ? (
          <div className="p-4">
            <KanbanBoard slug="oportunidade" search={search} ownerId={ownerF === ALL ? null : ownerF} selectMode={selectMode} selectedIds={selected} onToggleSelect={toggleSel} />
          </div>
        ) : (
        <Table>
          <TableHeader><TableRow>
            {selectMode && <TableHead className="w-8" />}
            <TableHead>Título</TableHead><TableHead>Organização</TableHead><TableHead>Estágio</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">GMV est.</TableHead>
            <TableHead>Responsável</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={selectMode ? 7 : 6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={selectMode ? 7 : 6} className="py-10 text-center text-muted-foreground">Nenhuma oportunidade</TableCell></TableRow>
            ) : rows.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={(e) => (selectMode ? toggleSel(o.id) : openItem(e, `/comercial/oportunidades/${o.id}`))}>
                {selectMode && <TableCell className="w-8"><Checkbox checked={selected.has(o.id)} /></TableCell>}
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={o.titulo}>{o.titulo}</div></TableCell>
                <TableCell>{o.orgNome ?? '—'}</TableCell>
                <TableCell>
                  {o.stageNome ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: o.stageCor ?? 'var(--muted-foreground)' }} />
                      {o.stageNome}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell>{statusBadge(o.resultado)}</TableCell>
                <TableCell className="text-right tabular-nums">{o.gmv_estimado != null ? fmtBRL(o.gmv_estimado) : '—'}</TableCell>
                <TableCell>{o.ownerNome ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </ListView>

      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 py-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">Marque os itens e escolha o novo responsável.</span>
            <div className="ml-auto flex items-center gap-2">
              <Select value={bulkOwner} onValueChange={setBulkOwner}>
                <SelectTrigger className="h-9 w-52" size="sm"><SelectValue placeholder="Novo responsável…" /></SelectTrigger>
                <SelectContent>
                  {(userOptions.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={aplicarResponsavel} disabled={!bulkOwner || selected.size === 0 || applying}>
                {applying ? 'Aplicando…' : 'Aplicar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={sairSelecao} disabled={applying}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
      <NovaOportunidadeDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
