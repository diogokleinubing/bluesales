import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
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
import {
  ComparisonBars,
  GrowthBars,
  MultiLineChart,
} from '../components/charts'
import { MONTH_LABELS } from '../components/chart-theme'
import { useControls } from '@/modules/shared/controls-context'
import { useBiYears, useOrgId } from '../hooks/useBi'
import { biYtdMonthly, biYtdGroup, biMonthsElapsed } from '../lib/rpc'
import { cn } from '@/lib/utils'
import {
  buildYtdResult,
  YTD_VIEW_LABELS,
  YTD_VIEW_PARAM,
  type YtdView,
} from '../lib/ytd'
import { METRIC_LABELS, type Metric, type DateBase } from '../lib/controls'
import { fmtBRL, fmtDelta } from '@/lib/format'

export function YtdPage() {
  const { year, metric: gMetric, dateBase: gDateBase, pdv } = useControls()
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
  const [metric, setMetric] = useState<Metric>(gMetric)

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
      navigate(`/eventos?${YTD_VIEW_PARAM[view]}=${encodeURIComponent(label)}`)
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

  // Na visão "Evento recorrente", mostra só os que têm família (agrupados);
  // o grupo "—" reúne os eventos sem agrupamento e é ocultado.
  const viewRows = useMemo(
    () =>
      view === 'familia'
        ? result.byView.filter((g) => g.key && g.key !== '—')
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
          <Ctrl label="Métrica">
            <MiniSelect
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
              options={Object.entries(METRIC_LABELS)}
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

      <ChartCard title={`Comparativo por ${YTD_VIEW_LABELS[view]} (top 15)`}>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <ComparisonBars
            data={sortedRows.slice(0, 15).map((g) => ({
              label: g.label,
              target: g.target,
              base: g.base,
            }))}
            targetLabel={String(targetYear)}
            baseLabel={String(baseYear)}
            onClickBar={drill}
          />
        )}
      </ChartCard>

      {/* Tabela completa */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="label">{YTD_VIEW_LABELS[view]}</SortHead>
                  <SortHead k="target" align="right">
                    {targetYear}
                  </SortHead>
                  <SortHead k="base" align="right">
                    {baseYear}
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
                {sortedRows.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell>
                      <button
                        className="text-left font-medium hover:text-primary hover:underline"
                        onClick={() => drill(g.label)}
                      >
                        {g.label}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL(g.target)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL(g.base)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        g.deltaAbs >= 0
                          ? 'text-[var(--success)]'
                          : 'text-destructive'
                      }`}
                    >
                      {fmtBRL(g.deltaAbs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {g.deltaPct == null ? '—' : fmtDelta(g.deltaPct)}
                    </TableCell>
                  </TableRow>
                ))}
                {result.byView.length === 0 && (
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
