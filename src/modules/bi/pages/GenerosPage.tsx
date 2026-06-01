import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MultiLineChart } from '../components/charts'
import { RankingView } from '../components/RankingView'
import { useBiGroup, useBiMonthlyByGroup } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { groupRowsToAgg } from '../lib/group-map'
import { metricOf } from '../lib/rpc'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

const SEM = 'Sem gênero'

export function GenerosPage() {
  const { year, metric } = useControls()
  const navigate = useNavigate()
  const groupQ = useBiGroup('genero')

  const groups = useMemo(
    () => groupRowsToAgg(groupQ.data ?? [], metric, SEM),
    [groupQ.data, metric],
  )
  const topNames = useMemo(() => groups.slice(0, 5).map((g) => g.label), [groups])

  const monthlyQ = useBiMonthlyByGroup('genero', topNames)
  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, month) => {
      const base: Record<string, number> = { month }
      for (const k of topNames) base[k] = 0
      return base
    })
    for (const r of monthlyQ.data ?? []) {
      const key = r.key ?? SEM
      if (r.month >= 0 && r.month < 12 && key in rows[r.month])
        rows[r.month][key] = metricOf(r, metric)
    }
    return rows
  }, [monthlyQ.data, topNames, metric])

  const metricLabel = METRIC_LABELS[metric]
  const total = groups.reduce((a, g) => a + g.value, 0)
  const isLoading = groupQ.isLoading

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gêneros</h1>
        <p className="text-sm text-muted-foreground">
          Desempenho por gênero musical em {year}. Clique para ver os eventos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          : groups.slice(0, 8).map((g) => (
              <button
                key={g.key}
                onClick={() =>
                  navigate(`/bi/eventos?genero=${encodeURIComponent(g.label)}`)
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Evolução mensal · {metricLabel} (top 5 gêneros)
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

      <RankingView
        title="Gênero"
        groups={groups}
        metricLabel={metricLabel}
        drillParam="genero"
        loading={isLoading}
        topN={20}
      />
    </div>
  )
}
