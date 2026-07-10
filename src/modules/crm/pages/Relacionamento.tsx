import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readStr, readBool, readArr, buildSearchParams } from '@/lib/urlState'
import { useOpenItem } from '@/lib/useOpenItem'
import { SlidersHorizontal, MoreVertical, ChevronDown } from 'lucide-react'
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
import { useRelacionamento, acompEstado, type RelTipo, type AcompEstado } from '../hooks/useRelacionamento'
import { STATUS_COMERCIAL } from '../hooks/useOrganizations'
import { ClasseBadge } from '../components/ClasseBadge'
import { StatusComercialBadge } from '../components/StatusComercialBadge'
import { AcompanhamentoControl } from '../components/AcompanhamentoBadge'
import { ACOMP_META, ACOMP_ORDER } from '../components/acompanhamentoMeta'
import { CLASSES, StageDot, useRelStageMap } from '../components/RelacionamentoBits'
import { RelacionamentoBoard, RelTipoBadge, TIPO_META } from '../components/RelacionamentoBoard'
import { ListView, ToolbarSearch, ViewToggle, TOOLBAR_TRIGGER } from '../components/ListView'
import { cn } from '@/lib/utils'
import { fmtBRL, fmtDate } from '@/lib/format'

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
  const [acompSel, setAcompSel] = useState<AcompEstado[]>(() => readArr(params, 'acomp').filter((a): a is AcompEstado => (ACOMP_ORDER as string[]).includes(a)))
  const [ufSel, setUfSel] = useState<string[]>(() => readArr(params, 'uf'))
  const [gmvMin, setGmvMin] = useState(() => readStr(params, 'gmvMin'))
  const [estagiosInativos, setEstagiosInativos] = useState<boolean>(() => readBool(params, 'includeInactive'))
  const [showCidade, setShowCidade] = useState<boolean>(() => readBool(params, 'showCity', true))
  const [showGmv, setShowGmv] = useState<boolean>(() => readBool(params, 'showGmv', true))
  const [showCadastro, setShowCadastro] = useState<boolean>(() => readBool(params, 'showCad'))
  // Filtro extra: intervalo de data de cadastro do local ('' | '7' | '15' | '30' | 'custom').
  const [cadastroDias, setCadastroDias] = useState(() => readStr(params, 'cadDias'))
  const [cadastroMin, setCadastroMin] = useState(() => readStr(params, 'cadMin'))
  const [cadastroMax, setCadastroMax] = useState(() => readStr(params, 'cadMax'))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'view', v: view, def: 'kanban' },
      { k: 'search', v: search },
      { k: 'classes', v: classesSel },
      { k: 'status', v: statusSel },
      { k: 'tipos', v: tiposSel },
      { k: 'acomp', v: acompSel },
      { k: 'uf', v: ufSel },
      { k: 'gmvMin', v: gmvMin },
      { k: 'includeInactive', v: estagiosInativos },
      { k: 'showCity', v: showCidade, def: true },
      { k: 'showGmv', v: showGmv, def: true },
      { k: 'showCad', v: showCadastro },
      { k: 'cadDias', v: cadastroDias },
      { k: 'cadMin', v: cadastroMin },
      { k: 'cadMax', v: cadastroMax },
    ]), { replace: true })
  }, [view, search, classesSel, statusSel, tiposSel, acompSel, ufSel, gmvMin, estagiosInativos, showCidade, showGmv, showCadastro, cadastroDias, cadastroMin, cadastroMax, setSearchParams])

  function toggleStatus(s: string) {
    setStatusSel(statusSel.includes(s) ? statusSel.filter((x) => x !== s) : [...statusSel, s])
  }
  function toggleAcomp(a: AcompEstado) {
    setAcompSel(acompSel.includes(a) ? acompSel.filter((x) => x !== a) : [...acompSel, a])
  }
  function toggleUf(u: string) {
    setUfSel(ufSel.includes(u) ? ufSel.filter((x) => x !== u) : [...ufSel, u])
  }
  function toggleClasse(c: string) {
    setClassesSel(classesSel.includes(c) ? classesSel.filter((x) => x !== c) : [...classesSel, c])
  }
  // UFs presentes na base (para as opções do filtro).
  const ufOptions = useMemo(
    () => [...new Set((data ?? []).map((it) => it.uf).filter((u): u is string => !!u))].sort((a, b) => a.localeCompare(b)),
    [data],
  )
  function toggleTipo(t: RelTipo) {
    setTiposSel(tiposSel.includes(t) ? tiposSel.filter((x) => x !== t) : [...tiposSel, t])
  }
  const gmvMinNum = useMemo(() => {
    const n = Number(gmvMin)
    return gmvMin.trim() !== '' && Number.isFinite(n) ? n : null
  }, [gmvMin])

  const cadastroRange = useMemo<{ min: Date | null; max: Date | null }>(() => {
    if (cadastroDias === 'custom') {
      return {
        min: cadastroMin ? new Date(`${cadastroMin}T00:00:00`) : null,
        max: cadastroMax ? new Date(`${cadastroMax}T23:59:59`) : null,
      }
    }
    const n = Number(cadastroDias)
    if (n === 7 || n === 15 || n === 30) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - n)
      return { min: d, max: null }
    }
    return { min: null, max: null }
  }, [cadastroDias, cadastroMin, cadastroMax])
  const cadastroAtivo = !!(cadastroRange.min || cadastroRange.max)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((it) => {
      if (tiposSel.length > 0 && !tiposSel.includes(it.tipo)) return false
      if (acompSel.length > 0 && !acompSel.includes(acompEstado(it))) return false
      if (ufSel.length > 0 && !(it.uf && ufSel.includes(it.uf))) return false
      if (q && !it.nome.toLowerCase().includes(q) && !(it.cidade ?? '').toLowerCase().includes(q)) return false
      if (classesSel.length > 0 && !(it.classificacao != null && classesSel.includes(it.classificacao))) return false
      // Status comercial: filtra APENAS organizações; locais/eventos sempre passam.
      if (it.tipo === 'org' && statusSel.length > 0 && !(it.status != null && statusSel.includes(it.status))) return false
      // Data de cadastro na base: vale para qualquer tipo de entidade.
      if (cadastroAtivo) {
        if (!it.cadastro) return false
        const t = new Date(it.cadastro)
        if (cadastroRange.min && t < cadastroRange.min) return false
        if (cadastroRange.max && t > cadastroRange.max) return false
      }
      // Estágios inativos: esconde itens em estágio inativo, salvo o toggle.
      const st = it.funil_stage_id ? stageMap.get(it.funil_stage_id) : null
      if (!estagiosInativos && st && st.ativo === false) return false
      if (gmvMinNum != null && !(it.gmv != null && it.gmv >= gmvMinNum)) return false
      return true
    })
  }, [data, search, classesSel, statusSel, tiposSel, acompSel, ufSel, estagiosInativos, gmvMinNum, cadastroAtivo, cadastroRange, stageMap])

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
            <DropdownMenuCheckboxItem checked={showCadastro} onCheckedChange={(v) => setShowCadastro(v === true)}>Data de cadastro</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem checked={estagiosInativos} onCheckedChange={(v) => setEstagiosInativos(v === true)}>Estágios inativos</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const CAD_PRESETS: [string, string][] = [['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['custom', 'Personalizado']]
  const extraFiltrosMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-8 shrink-0" title="Filtros extras">
          <MoreVertical className="size-4" />
          {cadastroAtivo && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Cadastro na base</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="space-y-2 px-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {CAD_PRESETS.map(([v, label]) => (
              <button key={v} type="button"
                onClick={() => setCadastroDias(cadastroDias === v ? '' : v)}
                className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  cadastroDias === v ? 'border-primary bg-primary text-primary-foreground' : CHIP_OFF)}>
                {label}
              </button>
            ))}
          </div>
          {cadastroDias === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={cadastroMin} onChange={(e) => setCadastroMin(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" value={cadastroMax} onChange={(e) => setCadastroMax(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          )}
          {cadastroAtivo && (
            <button type="button" onClick={() => { setCadastroDias(''); setCadastroMin(''); setCadastroMax('') }}
              className="text-xs text-muted-foreground hover:text-foreground">
              Limpar
            </button>
          )}
        </div>
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

  const statusMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          Status comercial{statusSel.length > 0 ? ` · ${statusSel.length}` : ''}
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Status comercial (organizações)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUS_COMERCIAL.map((s) => (
          <DropdownMenuCheckboxItem key={s} checked={statusSel.includes(s)}
            onCheckedChange={() => toggleStatus(s)} onSelect={(ev) => ev.preventDefault()}>
            {s}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const acompMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          Acompanhamento{acompSel.length > 0 ? ` · ${acompSel.length}` : ''}
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Acompanhamento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACOMP_ORDER.map((e) => {
          const meta = ACOMP_META[e]
          const Icon = meta.icon
          return (
            <DropdownMenuCheckboxItem key={e} checked={acompSel.includes(e)}
              onCheckedChange={() => toggleAcomp(e)} onSelect={(ev) => ev.preventDefault()}>
              <Icon className="size-4" style={{ color: meta.color }} /> {meta.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const classeMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          Classe{classesSel.length > 0 ? ` · ${classesSel.length}` : ''}
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Classe</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CLASSES.map((c) => (
          <DropdownMenuCheckboxItem key={c} checked={classesSel.includes(c)}
            onCheckedChange={() => toggleClasse(c)} onSelect={(ev) => ev.preventDefault()}>
            <ClasseBadge classe={c} />
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const ufMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          UF{ufSel.length > 0 ? ` · ${ufSel.length}` : ''}
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Estado (UF)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ufOptions.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem UF na base</div>
        ) : ufOptions.map((u) => (
          <DropdownMenuCheckboxItem key={u} checked={ufSel.includes(u)}
            onCheckedChange={() => toggleUf(u)} onSelect={(ev) => ev.preventDefault()}>
            {u}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
          {acompMenu}
          {classeMenu}
          {ufMenu}
          {statusMenu}
          <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
            placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
          {extraFiltrosMenu}
        </>
      }
    >
      {view === 'kanban' ? (
        <div className="p-4">
          <RelacionamentoBoard items={rows} includeInactiveStages={estagiosInativos} showCidade={showCidade} showGmv={showGmv} showCadastro={showCadastro} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-center">Acomp.</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">GMV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nenhum item.</TableCell></TableRow>
            ) : rows.map((it) => (
              <TableRow key={`${it.tipo}:${it.id}`} className="cursor-pointer" onClick={(e) => openItem(e, it.href)}>
                <TableCell><RelTipoBadge tipo={it.tipo} /></TableCell>
                <TableCell><span className="flex justify-center"><AcompanhamentoControl item={it} /></span></TableCell>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={it.nome}>{it.nome}</div></TableCell>
                <TableCell><ClasseBadge classe={it.classificacao} /></TableCell>
                <TableCell className="text-muted-foreground">{[it.cidade, it.uf].filter(Boolean).join('/') || '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{it.cadastro ? fmtDate(it.cadastro) : '—'}</TableCell>
                <TableCell><StageDot stage={it.funil_stage_id ? stageMap.get(it.funil_stage_id) : null} /></TableCell>
                <TableCell>{it.tipo === 'org' ? <StatusComercialBadge status={it.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{it.gmv != null ? fmtBRL(it.gmv) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {!isLoading && rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={8} className="font-medium">Total ({rows.length})</TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{fmtBRL(gmvTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      )}
    </ListView>
  )
}
