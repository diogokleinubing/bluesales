import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Upload } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useOrganizations, createOrganization, STATUS_COMERCIAL } from '../hooks/useOrganizations'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useViewPref } from '../hooks/useViewPref'
import { ClasseBadge } from '../components/ClasseBadge'
import { StatusComercialBadge } from '../components/StatusComercialBadge'
import { KanbanBoard } from '../components/KanbanBoard'
import { ListView, ToolbarSearch, ViewToggle, TOOLBAR_TRIGGER } from '../components/ListView'
import { OrgImportWizard } from '../import/OrgImportWizard'
import { cn } from '@/lib/utils'
import { fmtBRL, fmtDate } from '@/lib/format'

const CLASSES = ['A+', 'A', 'B', 'C']
const ALL = '__all__'

export function Organizacoes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const [params] = useSearchParams()
  const biOrganizador = params.get('bi_organizador') ?? ''

  const { data, isLoading } = useOrganizations()
  const [view, setView] = useViewPref('crm:orgView', 'list')
  const [search, setSearch] = useState(biOrganizador)
  const [classe, setClasse] = useState<string>(ALL)
  const [statusF, setStatusF] = useState<string>(ALL)
  const [gmvMin, setGmvMin] = useState('')
  const [kbStatuses, setKbStatuses] = useState<string[]>(['Eventual', 'Inativo'])
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const { isGestor } = useAuth()

  function toggleKbStatus(s: string) {
    setKbStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = Number(gmvMin)
    const temMin = gmvMin.trim() !== '' && Number.isFinite(min)
    return (data ?? []).filter(
      (o) =>
        (!q || o.nome.toLowerCase().includes(q)) &&
        (classe === ALL || o.classificacao === classe) &&
        (statusF === ALL || o.status_comercial === statusF) &&
        (!temMin || (o.gmv_anual != null && o.gmv_anual >= min)),
    )
  }, [data, search, classe, statusF, gmvMin])

  async function criar() {
    if (!orgId || !novoNome.trim()) return
    try {
      const id = await createOrganization(orgId, { nome: novoNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      setNovoOpen(false); setNovoNome('')
      navigate(`/comercial/organizacoes/${id}`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <>
      <ListView
        title="Organizações"
        count={data ? String(data.length) : undefined}
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            {isGestor && (
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Importar</Button>
            )}
            <Button onClick={() => setNovoOpen(true)}><Plus className="size-4" /> Nova organização</Button>
          </>
        }
        footer={view === 'list' && data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          view === 'list' ? (
            <>
              <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger className={`${TOOLBAR_TRIGGER} w-40`} size="sm"><SelectValue placeholder="Classe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as classes</SelectItem>
                  {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Status comercial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os status</SelectItem>
                  {STATUS_COMERCIAL.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
                placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
            </>
          ) : (
            <div className="flex items-center gap-1">
              {STATUS_COMERCIAL.map((s) => {
                const on = kbStatuses.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleKbStatus(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          )
        }
      >
        {view === 'kanban' ? (
          <div className="p-4">
            <KanbanBoard slug="relacionamento" statusFilter={kbStatuses} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Estrutura</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Status comercial</TableHead>
              <TableHead className="text-right">GMV anual</TableHead>
              <TableHead>Última atividade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma organização — adicione a primeira.</TableCell></TableRow>
            ) : rows.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/comercial/organizacoes/${o.id}`)}>
                <TableCell className="font-medium">{o.nome}</TableCell>
                <TableCell><ClasseBadge classe={o.classificacao} /></TableCell>
                <TableCell className="text-muted-foreground">{[o.cidade, o.uf].filter(Boolean).join('/') || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{o.estrutura ?? '—'}</TableCell>
                <TableCell>
                  {o.stageNome ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: o.stageCor ?? 'var(--muted-foreground)' }} />
                      {o.stageNome}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusComercialBadge status={o.status_comercial} />
                    {o.oppStageNome && (
                      <Badge variant="outline" className="gap-1" title="Oportunidade em aberto">
                        <span className="size-2 rounded-full" style={{ backgroundColor: o.oppStageCor ?? 'var(--muted-foreground)' }} />
                        {o.oppStageNome}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{o.gmv_anual != null ? fmtBRL(o.gmv_anual) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{o.ultimaAtividade ? fmtDate(new Date(o.ultimaAtividade)) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </ListView>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova organização</DialogTitle></DialogHeader>
          <Input placeholder="Nome da organização" value={novoNome} autoFocus onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={!novoNome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrgImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
