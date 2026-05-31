import { useMemo } from 'react'
import { RankingView } from '../components/RankingView'
import { useBiGroup } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { groupRowsToAgg } from '../lib/group-map'
import { METRIC_LABELS } from '../lib/controls'

export function OrganizadoresPage() {
  const { year, metric } = useControls()
  const query = useBiGroup('organizador')

  const groups = useMemo(
    () => groupRowsToAgg(query.data ?? [], metric, 'Sem organizador'),
    [query.data, metric],
  )

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
        loading={query.isLoading}
      />
    </div>
  )
}
