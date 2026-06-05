import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useOpportunities } from '../hooks/useOpportunities'
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
  const navigate = useNavigate()
  const { data, isLoading } = useOpportunities()
  const { stages } = useFunnel('oportunidade')
  const [view, setView] = useViewPref('crm:oppView', 'list')
  const [search, setSearch] = useState('')
  const [stageF, setStageF] = useState(ALL)
  const [statusF, setStatusF] = useState(ALL)
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((o) => {
      if (q && !o.titulo.toLowerCase().includes(q) && !(o.orgNome ?? '').toLowerCase().includes(q)) return false
      if (stageF !== ALL && o.stage_id !== stageF) return false
      if (statusF === ABERTA && o.resultado != null) return false
      if (statusF !== ALL && statusF !== ABERTA && o.resultado !== statusF) return false
      return true
    })
  }, [data, search, stageF, statusF])

  return (
    <>
      <ListView
        title="Oportunidades"
        count={data ? String(data.length) : undefined}
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova oportunidade</Button>
          </>
        }
        footer={view === 'list' && data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          view === 'list' ? (
            <>
              <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por título ou organização…" />
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
          ) : undefined
        }
      >
        {view === 'kanban' ? (
          <div className="p-4">
            <KanbanBoard slug="oportunidade" />
          </div>
        ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Título</TableHead><TableHead>Organização</TableHead><TableHead>Estágio</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">GMV est.</TableHead>
            <TableHead>Responsável</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma oportunidade.</TableCell></TableRow>
            ) : rows.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/comercial/oportunidades/${o.id}`)}>
                <TableCell className="font-medium">{o.titulo}</TableCell>
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
      <NovaOportunidadeDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
