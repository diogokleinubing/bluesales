import { useMemo, useState } from 'react'
import { useOpenItem } from '@/lib/useOpenItem'
import { SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useViewPref, usePersistedState } from '../hooks/useViewPref'
import { useRelacionamento } from '../hooks/useRelacionamento'
import { STATUS_COMERCIAL } from '../hooks/useOrganizations'
import { ClasseBadge } from '../components/ClasseBadge'
import { StatusComercialBadge } from '../components/StatusComercialBadge'
import { ClasseChips, StageDot, useRelStageMap } from '../components/RelacionamentoBits'
import { RelacionamentoBoard, RelTipoBadge } from '../components/RelacionamentoBoard'
import { ListView, ToolbarSearch, ViewToggle, TOOLBAR_TRIGGER } from '../components/ListView'
import { cn } from '@/lib/utils'
import { fmtBRL } from '@/lib/format'

const CHIP_OFF = 'border-border text-muted-foreground hover:border-primary'

export function Relacionamento() {
  const openItem = useOpenItem()
  const { data, isLoading } = useRelacionamento()
  const stageMap = useRelStageMap()
  const [view, setView] = useViewPref('crm:relView', 'kanban')
  const [search, setSearch] = useState('')
  const [classesSel, setClassesSel] = usePersistedState<string[]>('crm:rel:classes', [])
  const [statusSel, setStatusSel] = usePersistedState<string[]>('crm:rel:status', [])
  const [gmvMin, setGmvMin] = useState('')
  const [estagiosInativos, setEstagiosInativos] = usePersistedState<boolean>('crm:rel:estagiosInativos', false)
  const [showCidade, setShowCidade] = usePersistedState<boolean>('crm:rel:cardCidade', true)
  const [showGmv, setShowGmv] = usePersistedState<boolean>('crm:rel:cardGmv', true)

  function toggleStatus(s: string) {
    setStatusSel(statusSel.includes(s) ? statusSel.filter((x) => x !== s) : [...statusSel, s])
  }
  const gmvMinNum = useMemo(() => {
    const n = Number(gmvMin)
    return gmvMin.trim() !== '' && Number.isFinite(n) ? n : null
  }, [gmvMin])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((it) => {
      if (q && !it.nome.toLowerCase().includes(q) && !(it.cidade ?? '').toLowerCase().includes(q)) return false
      if (classesSel.length > 0 && !(it.classificacao != null && classesSel.includes(it.classificacao))) return false
      // Status comercial: filtra APENAS organizações; locais/eventos sempre passam.
      if (it.tipo === 'org' && statusSel.length > 0 && !(it.status != null && statusSel.includes(it.status))) return false
      // Estágios inativos: esconde itens em estágio inativo, salvo o toggle.
      const st = it.funil_stage_id ? stageMap.get(it.funil_stage_id) : null
      if (!estagiosInativos && st && st.ativo === false) return false
      if (gmvMinNum != null && !(it.gmv != null && it.gmv >= gmvMinNum)) return false
      return true
    })
  }, [data, search, classesSel, statusSel, estagiosInativos, gmvMinNum, stageMap])

  const gmvTotal = useMemo(() => rows.reduce((s, o) => s + (o.gmv ?? 0), 0), [rows])

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
            <DropdownMenuCheckboxItem checked={showCidade} onCheckedChange={(v) => setShowCidade(v === true)}>Cidade/UF</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showGmv} onCheckedChange={(v) => setShowGmv(v === true)}>GMV</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem checked={estagiosInativos} onCheckedChange={(v) => setEstagiosInativos(v === true)}>Estágios inativos</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const statusChips = (
    <div className="flex items-center gap-1">
      {STATUS_COMERCIAL.map((s) => {
        const on = statusSel.includes(s)
        return (
          <button key={s} type="button" onClick={() => toggleStatus(s)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              on ? 'border-primary bg-primary text-primary-foreground' : CHIP_OFF)}>
            {s}
          </button>
        )
      })}
    </div>
  )

  return (
    <ListView
      title="Funil de Relacionamento"
      count={data ? String(rows.length) : undefined}
      actions={<><ViewToggle view={view} onChange={setView} />{exibicaoMenu}</>}
      footer={view === 'list' && data ? `${rows.length} itens` : undefined}
      toolbar={
        <>
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome ou cidade…" />
          <ClasseChips value={classesSel} onChange={setClassesSel} />
          {statusChips}
          <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
            placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
        </>
      }
    >
      {view === 'kanban' ? (
        <div className="p-4">
          <RelacionamentoBoard items={rows} includeInactiveStages={estagiosInativos} showCidade={showCidade} showGmv={showGmv} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">GMV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum item.</TableCell></TableRow>
            ) : rows.map((it) => (
              <TableRow key={`${it.tipo}:${it.id}`} className="cursor-pointer" onClick={(e) => openItem(e, it.href)}>
                <TableCell><RelTipoBadge tipo={it.tipo} /></TableCell>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={it.nome}>{it.nome}</div></TableCell>
                <TableCell><ClasseBadge classe={it.classificacao} /></TableCell>
                <TableCell className="text-muted-foreground">{[it.cidade, it.uf].filter(Boolean).join('/') || '—'}</TableCell>
                <TableCell><StageDot stage={it.funil_stage_id ? stageMap.get(it.funil_stage_id) : null} /></TableCell>
                <TableCell>{it.tipo === 'org' ? <StatusComercialBadge status={it.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{it.gmv != null ? fmtBRL(it.gmv) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {!isLoading && rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="font-medium">Total ({rows.length})</TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{fmtBRL(gmvTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      )}
    </ListView>
  )
}
