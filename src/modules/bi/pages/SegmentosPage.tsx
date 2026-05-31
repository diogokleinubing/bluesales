import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MultiLineChart } from '../components/charts'
import { RankingView } from '../components/RankingView'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import { filterSales } from '../lib/metrics'
import { groupBy, monthlyByGroup } from '../lib/aggregate'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

export function SegmentosPage() {
  const { sales, isLoading } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()
  const navigate = useNavigate()

  const cur = useMemo(
    () => filterSales(sales, { pdv, year, dateBase }),
    [sales, year, dateBase, pdv],
  )

  const groups = useMemo(
    () => groupBy(cur, (s) => s.segmento, metric, 'Sem segmento'),
    [cur, metric],
  )

  const topNames = useMemo(() => groups.slice(0, 5).map((g) => g.label), [groups])

  const monthly = useMemo(
    () =>
      monthlyByGroup(
        cur,
        dateBase,
        metric,
        (s) => s.segmento,
        'Sem segmento',
        topNames,
      ),
    [cur, dateBase, metric, topNames],
  )

  const metricLabel = METRIC_LABELS[metric]
  const total = groups.reduce((a, g) => a + g.value, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segmentos</h1>
        <p className="text-sm text-muted-foreground">
          Desempenho por segmento em {year}. Clique para ver os eventos.
        </p>
      </div>

      {/* Cards por segmento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          : groups.slice(0, 8).map((g) => (
              <button
                key={g.key}
                onClick={() =>
                  navigate(`/eventos?segmento=${encodeURIComponent(g.label)}`)
                }
                className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary"
              >
                <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {fmtBRL(g.value)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtInt(g.vendas)} vendas ·{' '}
                  {fmtPct(total > 0 ? g.value / total : 0)}
                </div>
              </button>
            ))}
      </div>

      {/* Evolução mensal por segmento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Evolução mensal · {metricLabel} (top 5 segmentos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <MultiLineChart data={monthly} series={topNames} />
          )}
        </CardContent>
      </Card>

      {/* Tabela detalhada + ranking */}
      <RankingView
        title="Segmento"
        groups={groups}
        metricLabel={metricLabel}
        drillParam="segmento"
        loading={isLoading}
        topN={20}
      />
    </div>
  )
}
