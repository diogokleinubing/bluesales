import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KpiCard } from '../components/KpiCard'
import { GrowthBars, MultiLineChart } from '../components/charts'
import { MONTH_LABELS } from '../components/chart-theme'
import { useControls } from '@/modules/shared/controls-context'
import { useBiYears, useOrgId } from '../hooks/useBi'
import { biYtdMonthly, biYtdGroup, biMonthsElapsed, biEvents, type BiEventsParams } from '../lib/rpc'
import { cn } from '@/lib/utils'
import {
  buildYtdResult,
  mergeEventYears,
  YTD_VIEW_LABELS,
  YTD_VIEW_PARAM,
  type YtdView,
} from '../lib/ytd'
import { type Metric, type DateBase, type Pdv } from '../lib/controls'
import { fmtBRL, fmtDelta } from '@/lib/format'

export function YtdPage() {
  const { year, dateBase: gDateBase, pdv } = useControls()
  const orgId = useOrgId()
  const navigate = useNavigate()

  const yearsQuery = useBiYears(gDateBase)
  const years = useMemo(() => {
    const ys = yearsQuery.data ?? []
    return ys.length ? ys : [year]
  }, [yearsQuery.data, year])

  const [targetYear, setTargetYear] = useState(year)
  const [monthStart, setMonthStart] = useState(0)
  const [monthEnd, setMonthEnd] = useState(11)
  const [dateBase, setDateBase] = useState<DateBase>(gDateBase)
  const [view, setView] = useState<YtdView>('organizador')
  const metric: Metric = 'gmv' // fixo em GMV (Métrica removida)

  // Linhas expandidas (mostram os eventos do grupo dentro da própria linha).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Default: abre no último ano com vendas e no último mês com vendas.
  const latestYear = years[0]
  const initMonthsQuery = useQuery({
    enabled: !!orgId && years.length > 0,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'ytd-init-months', orgId, latestYear, gDateBase, pdv],
    queryFn: () => biMonthsElapsed(orgId!, latestYear, gDateBase, pdv),
  })
  const [didInit, setDidInit] = useState(false)
  useEffect(() => {
    if (didInit) return
    if (!yearsQuery.data || yearsQuery.data.length === 0) return
    if (initMonthsQuery.data == null) return
    setTargetYear(latestYear)
    setMonthStart(0)
    setMonthEnd(Math.min(11, Math.max(0, initMonthsQuery.data - 1)))
    setDidInit(true)
  }, [didInit, yearsQuery.data, initMonthsQuery.data, latestYear])

  const ytdQuery = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'ytd', orgId, targetYear, monthStart, monthEnd, dateBase, view, pdv],
    queryFn: async () => {
      const [monthly, groups] = await Promise.all([
        biYtdMonthly(orgId!, targetYear, monthStart, monthEnd, dateBase, pdv),
        biYtdGroup(orgId!, targetYear, monthStart, monthEnd, dateBase, pdv, view),
      ])
      return { monthly, groups }
    },
  })
  const isLoading = ytdQuery.isLoading

  const result = useMemo(
    () =>
      buildYtdResult(
        ytdQuery.data?.monthly ?? [],
        ytdQuery.data?.groups ?? [],
        metric,
        monthStart,
        monthEnd,
      ),
    [ytdQuery.data, metric, monthStart, monthEnd],
  )

  const baseYear = targetYear - 1
  const lineData = result.monthly.map((m) => ({
    month: m.month,
    [String(targetYear)]: m.targetAcc,
    [String(baseYear)]: m.baseAcc,
  }))

  function drill(label: string) {
    if (label && label !== '—')
      navigate(`/bi/eventos?${YTD_VIEW_PARAM[view]}=${encodeURIComponent(label)}`)
  }

  // Ordenação da tabela por clique no cabeçalho.
  type SortKey = 'label' | 'target' | 'base' | 'deltaAbs' | 'deltaPct'
  const [sortKey, setSortKey] = useState<SortKey>('target')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'label' ? 'asc' : 'desc')
    }
  }

  // Na visão "Evento recorrente", mostra só famílias realmente recorrentes:
  // com edição no ano-alvo E no ano-base (apareceu em 2+ anos). Isso descarta
  // o grupo "—" (sem agrupamento) e eventos de edição única que ganharam uma
  // família automática pela sugestão.
  const viewRows = useMemo(
    () =>
      view === 'familia'
        ? result.byView.filter(
            (g) => g.key && g.key !== '—' && g.target > 0 && g.base > 0,
          )
        : result.byView,
    [result.byView, view],
  )

  const sortedRows = useMemo(() => {
    const rows = [...viewRows]
    rows.sort((a, b) => {
      let cmp: number
      if (sortKey === 'label') {
        cmp = a.label.localeCompare(b.label, 'pt-BR')
      } else {
        const av = a[sortKey] ?? 0
        const bv = b[sortKey] ?? 0
        cmp = av - bv
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [viewRows, sortKey, sortDir])

  function SortHead({
    k,
    align = 'left',
    children,
  }: {
    k: SortKey
    align?: 'left' | 'right'
    children: React.ReactNode
  }) {
    const active = sortKey === k
    return (
      <TableHead
        className={cn(
          'cursor-pointer select-none whitespace-nowrap',
          align === 'right' && 'text-right',
        )}
        onClick={() => toggleSort(k)}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1',
            align === 'right' && 'flex-row-reverse',
            active ? 'text-foreground' : '',
          )}
        >
          {children}
          {active &&
            (sortDir === 'asc' ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            ))}
        </span>
      </TableHead>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          YTD Comparativo
        </h1>
        <p className="text-sm text-muted-foreground">
          {targetYear} vs {baseYear} · {MONTH_LABELS[Math.min(monthStart, monthEnd)]}–
          {MONTH_LABELS[Math.max(monthStart, monthEnd)]}
        </p>
      </div>

      {/* Controles próprios */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <Ctrl label="Ano-alvo">
            <MiniSelect
              value={String(targetYear)}
              onChange={(v) => setTargetYear(Number(v))}
              options={years.map((y) => [String(y), String(y)])}
            />
          </Ctrl>
          <Ctrl label="Mês início">
            <MiniSelect
              value={String(monthStart)}
              onChange={(v) => setMonthStart(Number(v))}
              options={MONTH_LABELS.map((m, i) => [String(i), m])}
            />
          </Ctrl>
          <Ctrl label="Mês fim">
            <MiniSelect
              value={String(monthEnd)}
              onChange={(v) => setMonthEnd(Number(v))}
              options={MONTH_LABELS.map((m, i) => [String(i), m])}
            />
          </Ctrl>
          <Ctrl label="Base de data">
            <MiniSelect
              value={dateBase}
              onChange={(v) => setDateBase(v as DateBase)}
              options={[
                ['venda', 'Mês da Venda'],
                ['evento', 'Mês do Evento'],
              ]}
            />
          </Ctrl>
          <Ctrl label="Visão">
            <MiniSelect
              value={view}
              onChange={(v) => setView(v as YtdView)}
              options={Object.entries(YTD_VIEW_LABELS)}
            />
          </Ctrl>
        </CardContent>
      </Card>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={`Total ${targetYear}`} value={fmtBRL(result.totalTarget)} loading={isLoading} />
        <KpiCard label={`Total ${baseYear}`} value={fmtBRL(result.totalBase)} loading={isLoading} />
        <KpiCard
          label="Crescimento"
          value={result.deltaPct == null ? '—' : fmtDelta(result.deltaPct)}
          loading={isLoading}
        />
        <KpiCard label="Diferença" value={fmtBRL(result.deltaAbs)} loading={isLoading} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Acumulado no período">
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <MultiLineChart
              data={lineData}
              series={[String(targetYear), String(baseYear)]}
            />
          )}
        </ChartCard>
        <ChartCard title="Crescimento % por mês">
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <GrowthBars data={result.monthly} />
          )}
        </ChartCard>
      </div>

      {/* Tabela completa */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="label">{YTD_VIEW_LABELS[view]}</SortHead>
                  <SortHead k="base" align="right">
                    {baseYear}
                  </SortHead>
                  <SortHead k="target" align="right">
                    {targetYear}
                  </SortHead>
                  <SortHead k="deltaAbs" align="right">
                    Δ R$
                  </SortHead>
                  <SortHead k="deltaPct" align="right">
                    Δ %
                  </SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((g) => {
                  const canExpand = view !== 'familia' && g.key !== '—'
                  const isExpanded = expanded.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(g.key)}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                                aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                              >
                                {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              </button>
                            ) : (
                              <span className="inline-block w-4" />
                            )}
                            <button
                              className="text-left font-medium hover:text-primary hover:underline"
                              onClick={() => drill(g.label)}
                            >
                              {g.label}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(g.base)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(g.target)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            g.deltaAbs >= 0 ? 'text-[var(--success)]' : 'text-destructive'
                          }`}
                        >
                          {fmtBRL(g.deltaAbs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {g.deltaPct == null ? '—' : fmtDelta(g.deltaPct)}
                        </TableCell>
                      </TableRow>
                      {canExpand && isExpanded && (
                        <GroupEventRows
                          orgId={orgId}
                          view={view}
                          groupKey={g.key}
                          targetYear={targetYear}
                          baseYear={baseYear}
                          monthStart={monthStart}
                          monthEnd={monthEnd}
                          dateBase={dateBase}
                          pdv={pdv}
                        />
                      )}
                    </Fragment>
                  )
                })}
                {sortedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {view === 'familia'
                        ? 'Nenhum evento agrupado no período. Agrupe em Regras → Eventos recorrentes.'
                        : 'Sem dados no período.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Filtro do bi_events correspondente à dimensão da visão atual. */
function eventsFilterForView(view: YtdView, key: string): BiEventsParams {
  switch (view) {
    case 'organizador':
      return { organizador: key }
    case 'segmento':
      return { segmento: key }
    case 'cidade':
      return { cidade: key }
    case 'uf':
      return { uf: key }
    case 'local':
      return { local: key }
    case 'familia':
      return { search: key }
  }
}

/** Sub-linhas de um grupo expandido: eventos com os dois anos lado a lado. */
function GroupEventRows({
  orgId,
  view,
  groupKey,
  targetYear,
  baseYear,
  monthStart,
  monthEnd,
  dateBase,
  pdv,
}: {
  orgId: string | undefined
  view: YtdView
  groupKey: string
  targetYear: number
  baseYear: number
  monthStart: number
  monthEnd: number
  dateBase: DateBase
  pdv: Pdv[]
}) {
  const months = useMemo(() => {
    const lo = Math.min(monthStart, monthEnd)
    const hi = Math.max(monthStart, monthEnd)
    const arr: number[] = []
    for (let m = lo; m <= hi; m++) arr.push(m)
    return arr
  }, [monthStart, monthEnd])

  const q = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'ytd-group-events', orgId, view, groupKey, targetYear, monthStart, monthEnd, dateBase, pdv],
    queryFn: async () => {
      const filter = eventsFilterForView(view, groupKey)
      const [t, b] = await Promise.all([
        biEvents(orgId!, targetYear, dateBase, pdv, { ...filter, months, limit: 300 }),
        biEvents(orgId!, baseYear, dateBase, pdv, { ...filter, months, limit: 300 }),
      ])
      return mergeEventYears(t, b, 'gmv')
    },
  })

  if (q.isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="bg-muted/20 py-3 pl-11 text-sm text-muted-foreground">
          Carregando eventos…
        </TableCell>
      </TableRow>
    )
  }
  if (q.isError) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="bg-muted/20 py-3 pl-11 text-sm text-destructive">
          Não foi possível carregar os eventos.
        </TableCell>
      </TableRow>
    )
  }
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="bg-muted/20 py-3 pl-11 text-sm text-muted-foreground">
          Sem eventos no período.
        </TableCell>
      </TableRow>
    )
  }
  return (
    <>
      {rows.map((ev) => {
        const delta = ev.target - ev.base
        return (
          <TableRow key={ev.key} className="bg-muted/20">
            <TableCell className="pl-11">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm">{ev.nome}</span>
                {ev.multiano && (
                  <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    recorrente
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {ev.base > 0 ? fmtBRL(ev.base) : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {ev.target > 0 ? fmtBRL(ev.target) : '—'}
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular-nums',
                ev.multiano ? (delta >= 0 ? 'text-[var(--success)]' : 'text-destructive') : 'text-muted-foreground',
              )}
            >
              {ev.multiano ? fmtBRL(delta) : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {ev.multiano && ev.base > 0 ? fmtDelta((ev.target - ev.base) / Math.abs(ev.base)) : '—'}
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}

function Ctrl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function MiniSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
