import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { readStr, readBool, readArr, buildSearchParams } from '@/lib/urlState'
import { useOpenItem } from '@/lib/useOpenItem'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Upload, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useOrganizations, createOrganization, STATUS_COMERCIAL } from '../hooks/useOrganizations'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { StatusComercialBadge } from '../components/StatusComercialBadge'
import { InlineStageSelect, InlineClasseSelect } from '../components/RelacionamentoBits'
import { KanbanBoard } from '../components/KanbanBoard'
import { ListView, ToolbarSearch, ViewToggle, TOOLBAR_TRIGGER } from '../components/ListView'
import { OrgImportWizard } from '../import/OrgImportWizard'
import { cn } from '@/lib/utils'
import { fmtBRL, fmtDate } from '@/lib/format'

const CLASSES = ['A+', 'A', 'B', 'C']

// Cores dos chips de classe quando selecionados (espelha o ClasseBadge).
const CLASSE_CHIP_ON: Record<string, string> = {
  'A+': 'border-transparent bg-[var(--success)] text-white',
  A: 'border-[var(--success)] bg-[var(--success)]/15 text-[var(--success)]',
  B: 'border-[var(--warning)] bg-[var(--warning)]/15 text-[var(--warning)]',
  C: 'border-destructive bg-destructive/15 text-destructive',
}
const CHIP_OFF = 'border-border text-muted-foreground hover:border-primary'

export function Organizacoes() {
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const [params, setSearchParams] = useSearchParams()
  const biOrganizador = params.get('bi_organizador') ?? ''

  const { data, isLoading } = useOrganizations()
  const ORG_CLASSES_DEF = ['A+', 'A', 'B']
  const ORG_STATUS_DEF = ['Eventual', 'Inativo']
  const [view, setView] = useState<'kanban' | 'list'>(() => (readStr(params, 'view', 'list') === 'kanban' ? 'kanban' : 'list'))
  const [search, setSearch] = useState(() => readStr(params, 'search') || biOrganizador)
  const [classesSel, setClassesSel] = useState<string[]>(() => readArr(params, 'classes', ORG_CLASSES_DEF))
  const [statusSel, setStatusSel] = useState<string[]>(() => readArr(params, 'status', ORG_STATUS_DEF))
  const [gmvMin, setGmvMin] = useState(() => readStr(params, 'gmvMin'))
  const [estagiosInativos, setEstagiosInativos] = useState<boolean>(() => readBool(params, 'includeInactive'))
  const [showCidade, setShowCidade] = useState<boolean>(() => readBool(params, 'showCity', true))
  const [showGmv, setShowGmv] = useState<boolean>(() => readBool(params, 'showGmv', true))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'view', v: view, def: 'list' },
      { k: 'search', v: search },
      { k: 'classes', v: classesSel, always: true },
      { k: 'status', v: statusSel, always: true },
      { k: 'gmvMin', v: gmvMin },
      { k: 'includeInactive', v: estagiosInativos },
      { k: 'showCity', v: showCidade, def: true },
      { k: 'showGmv', v: showGmv, def: true },
    ]), { replace: true })
  }, [view, search, classesSel, statusSel, gmvMin, estagiosInativos, showCidade, showGmv, setSearchParams])
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const { isGestor } = useAuth()

  function toggleStatus(s: string) {
    setStatusSel(statusSel.includes(s) ? statusSel.filter((x) => x !== s) : [...statusSel, s])
  }
  function toggleClasse(c: string) {
    setClassesSel(classesSel.includes(c) ? classesSel.filter((x) => x !== c) : [...classesSel, c])
  }

  const gmvMinNum = useMemo(() => {
    const n = Number(gmvMin)
    return gmvMin.trim() !== '' && Number.isFinite(n) ? n : null
  }, [gmvMin])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (o) =>
        o.parent_id == null && // só principais; subs aparecem dentro da principal
        (!q || o.nome.toLowerCase().includes(q)) &&
        (classesSel.length === 0 || (o.classificacao != null && classesSel.includes(o.classificacao))) &&
        // Status comercial: filtro estrito (exige status na seleção).
        (statusSel.length === 0 || (o.status_comercial != null && statusSel.includes(o.status_comercial))) &&
        // Por padrão esconde organizações em estágio inativo (ex.: Inativo).
        (estagiosInativos || o.stageAtivo !== false) &&
        (gmvMinNum == null || (o.gmv_anual != null && o.gmv_anual >= gmvMinNum)),
    )
  }, [data, search, classesSel, statusSel, gmvMinNum, estagiosInativos])

  async function criar() {
    if (!orgId || !novoNome.trim()) return
    try {
      const id = await createOrganization(orgId, { nome: novoNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      setNovoOpen(false); setNovoNome('')
      navigate(`/comercial/organizacoes/${id}`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  const totalPrincipais = useMemo(
    () => (data ?? []).filter((o) => o.parent_id == null).length,
    [data],
  )

  const gmvTotal = useMemo(
    () => rows.reduce((s, o) => s + (o.gmv_anual ?? 0), 0),
    [rows],
  )


  const classeChips = (
    <div className="flex items-center gap-1">
      {CLASSES.map((c) => {
        const on = classesSel.includes(c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggleClasse(c)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              on ? (CLASSE_CHIP_ON[c] ?? 'border-primary bg-primary text-primary-foreground') : CHIP_OFF,
            )}
          >
            {c}
          </button>
        )
      })}
    </div>
  )

  const statusChips = (
    <div className="flex items-center gap-1">
      {STATUS_COMERCIAL.map((s) => {
        const on = statusSel.includes(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              on ? 'border-primary bg-primary text-primary-foreground' : CHIP_OFF,
            )}
          >
            {s}
          </button>
        )
      })}
    </div>
  )

  const exibicaoMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="size-8 shrink-0" title="Configurações de exibição">
          <SlidersHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {view === 'kanban' && (
          <>
            <DropdownMenuLabel>Exibir nos cards</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={showCidade} onCheckedChange={(v) => setShowCidade(v === true)}>
              Cidade/UF
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showGmv} onCheckedChange={(v) => setShowGmv(v === true)}>
              GMV
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem checked={estagiosInativos} onCheckedChange={(v) => setEstagiosInativos(v === true)}>
          Estágios inativos
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Mesma toolbar nos dois modos (lista e kanban): busca, classe, status, GMV mín., exibição.
  const toolbar = (
    <>
      <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />
      {classeChips}
      {statusChips}
      <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
        placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
    </>
  )

  return (
    <>
      <ListView
        title="Organizações"
        count={data ? String(totalPrincipais) : undefined}
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            {exibicaoMenu}
            {isGestor && (
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Importar</Button>
            )}
            <Button onClick={() => setNovoOpen(true)}><Plus className="size-4" /> Nova organização</Button>
          </>
        }
        footer={view === 'list' && data ? `${rows.length} de ${totalPrincipais}` : undefined}
        toolbar={toolbar}
      >
        {view === 'kanban' ? (
          <div className="p-4">
            <KanbanBoard slug="relacionamento" statusFilter={statusSel} includeInactiveStages={estagiosInativos} classFilter={classesSel} search={search} gmvMin={gmvMinNum} showCidade={showCidade} showGmv={showGmv} />
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
              <TableRow key={o.id} className="cursor-pointer" onClick={(e) => openItem(e, `/comercial/organizacoes/${o.id}`)}>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={o.nome}>{o.nome}</div></TableCell>
                <TableCell><InlineClasseSelect tipo="org" id={o.id} value={o.classificacao} /></TableCell>
                <TableCell className="text-muted-foreground">{[o.cidade, o.uf].filter(Boolean).join('/') || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{o.estrutura ?? '—'}</TableCell>
                <TableCell><InlineStageSelect tipo="org" id={o.id} value={o.funil_stage_id} /></TableCell>
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
          {!isLoading && rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="font-medium">Total ({rows.length})</TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{fmtBRL(gmvTotal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
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
