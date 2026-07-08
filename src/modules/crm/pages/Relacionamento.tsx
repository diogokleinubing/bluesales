import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readStr, readBool, readArr, buildSearchParams } from '@/lib/urlState'
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
import { useRelacionamento, type RelTipo } from '../hooks/useRelacionamento'
import { STATUS_COMERCIAL } from '../hooks/useOrganizations'
import { ClasseBadge } from '../components/ClasseBadge'
import { StatusComercialBadge } from '../components/StatusComercialBadge'
import { ClasseChips, StageDot, useRelStageMap } from '../components/RelacionamentoBits'
import { RelacionamentoBoard, RelTipoBadge, TIPO_META } from '../components/RelacionamentoBoard'
import { ListView, ToolbarSearch, ViewToggle, TOOLBAR_TRIGGER } from '../components/ListView'
import { cn } from '@/lib/utils'
import { fmtBRL } from '@/lib/format'

const CHIP_OFF = 'border-border text-muted-foreground hover:border-primary'
const REL_TIPOS: RelTipo[] = ['org', 'local', 'evento']

export function Relacionamento() {
  const openItem = useOpenItem()
  const { data, isLoading } = useRelacionamento()
  const stageMap = useRelStageMap()
  const [params, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'kanban' | 'list'>(() => (readStr(params, 'view', 'kanban') === 'list' ? 'list' : 'kanban'))
  const [search, setSearch] = useState(() => readStr(params, 'search'))
  const [classesSel, setClassesSel] = useState<string[]>(() => readArr(params, 'classes'))
  const [statusSel, setStatusSel] = useState<string[]>(() => readArr(params, 'status'))
  const [tiposSel, setTiposSel] = useState<RelTipo[]>(() => readArr(params, 'tipos').filter((t): t is RelTipo => (REL_TIPOS as string[]).includes(t)))
  const [gmvMin, setGmvMin] = useState(() => readStr(params, 'gmvMin'))
  const [estagiosInativos, setEstagiosInativos] = useState<boolean>(() => readBool(params, 'includeInactive'))
  const [showCidade, setShowCidade] = useState<boolean>(() => readBool(params, 'showCity', true))
  const [showGmv, setShowGmv] = useState<boolean>(() => readBool(params, 'showGmv', true))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'view', v: view, def: 'kanban' },
      { k: 'search', v: search },
      { k: 'classes', v: classesSel },
      { k: 'status', v: statusSel },
      { k: 'tipos', v: tiposSel },
      { k: 'gmvMin', v: gmvMin },
      { k: 'includeInactive', v: estagiosInativos },
      { k: 'showCity', v: showCidade, def: true },
      { k: 'showGmv', v: showGmv, def: true },
    ]), { replace: true })
  }, [view, search, classesSel, statusSel, tiposSel, gmvMin, estagiosInativos, showCidade, showGmv, setSearchParams])

  function toggleStatus(s: string) {
    setStatusSel(statusSel.includes(s) ? statusSel.filter((x) => x !== s) : [...statusSel, s])
  }
  function toggleTipo(t: RelTipo) {
    setTiposSel(tiposSel.includes(t) ? tiposSel.filter((x) => x !== t) : [...tiposSel, t])
  }
  const gmvMinNum = useMemo(() => {
    const n = Number(gmvMin)
    return gmvMin.trim() !== '' && Number.isFinite(n) ? n : null
  }, [gmvMin])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((it) => {
      if (tiposSel.length > 0 && !tiposSel.includes(it.tipo)) return false
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
  }, [data, search, classesSel, statusSel, tiposSel, estagiosInativos, gmvMinNum, stageMap])

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

  const tipoChips = (
    <div className="flex items-center gap-1">
      {REL_TIPOS.map((t) => {
        const meta = TIPO_META[t]
        const on = tiposSel.includes(t)
        const Icon = meta.icon
        return (
          <button key={t} type="button" onClick={() => toggleTipo(t)}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              on ? 'border-transparent text-white' : CHIP_OFF)}
            style={on ? { backgroundColor: meta.color } : undefined}>
            <Icon className="size-3.5" style={{ color: on ? '#fff' : meta.color }} /> {meta.label}
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
          {tipoChips}
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
