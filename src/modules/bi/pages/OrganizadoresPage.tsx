import { useState } from 'react'
import { RankingView } from '../components/RankingView'
import { CompareToggle } from '../components/CompareToggle'
import { useGroupAnalysis } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'

export function OrganizadoresPage() {
  const { year, metric } = useControls()
  const [compare, setCompare] = useState(false)
  const { groups, loading } = useGroupAnalysis('organizador', 'Sem organizador', compare)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizadores</h1>
          <p className="text-sm text-muted-foreground">
            Ranking de {year}. Clique para ver os eventos.
          </p>
        </div>
        <CompareToggle checked={compare} onChange={setCompare} />
      </div>
      <RankingView
        title="Organizador"
        groups={groups}
        metricLabel={METRIC_LABELS[metric]}
        drillParam="organizador"
        loading={loading}
        crmLink
        compare={compare}
      />
    </div>
  )
}
