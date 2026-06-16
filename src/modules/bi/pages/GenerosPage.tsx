import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MultiLineChart } from '../components/charts'
import { RankingView } from '../components/RankingView'
import { CompareToggle } from '../components/CompareToggle'
import { useGroupAnalysis, useBiMonthlyByGroup } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { metricOf } from '../lib/rpc'
import { METRIC_LABELS } from '../lib/controls'

const FALLBACK = 'Sem gênero'

export function GenerosPage() {
  const { year, metric } = useControls()
  const [compare, setCompare] = useState(false)
  const { groups, loading: isLoading } = useGroupAnalysis('genero', FALLBACK, compare)

  const topNames = useMemo(() => groups.slice(0, 5).map((g) => g.label), [groups])

  const monthlyQ = useBiMonthlyByGroup('genero', topNames)
  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, month) => {
      const base: Record<string, number> = { month }
      for (const k of topNames) base[k] = 0
      return base
    })
    for (const r of monthlyQ.data ?? []) {
      const key = r.key ?? FALLBACK
      if (r.month >= 0 && r.month < 12 && key in rows[r.month])
        rows[r.month][key] = metricOf(r, metric)
    }
    return rows
  }, [monthlyQ.data, topNames, metric])

  const metricLabel = METRIC_LABELS[metric]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gêneros</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho por gênero musical em {year}. Clique para ver os eventos.
          </p>
        </div>
        <CompareToggle checked={compare} onChange={setCompare} />
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
        compare={compare}
      />
    </div>
  )
}
