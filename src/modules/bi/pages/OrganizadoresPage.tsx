import { useMemo } from 'react'
import { RankingView } from '../components/RankingView'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import { filterSales } from '../lib/metrics'
import { groupBy } from '../lib/aggregate'
import { METRIC_LABELS } from '../lib/controls'

export function OrganizadoresPage() {
  const { sales, isLoading } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()

  const groups = useMemo(() => {
    const cur = filterSales(sales, { pdv, year, dateBase })
    return groupBy(cur, (s) => s.organizador, metric, 'Sem organizador')
  }, [sales, year, metric, dateBase, pdv])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizadores</h1>
        <p className="text-sm text-muted-foreground">
          Ranking de {year}. Clique para ver os eventos.
        </p>
      </div>
      <RankingView
        title="Organizador"
        groups={groups}
        metricLabel={METRIC_LABELS[metric]}
        drillParam="organizador"
        loading={isLoading}
      />
    </div>
  )
}
