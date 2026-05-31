import { useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RankingView } from '../components/RankingView'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import { filterSales } from '../lib/metrics'
import { groupBy } from '../lib/aggregate'
import { METRIC_LABELS } from '../lib/controls'

export function LocaisPage() {
  const { sales, isLoading } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()

  const cur = useMemo(
    () => filterSales(sales, { pdv, year, dateBase }),
    [sales, year, dateBase, pdv],
  )

  const porLocal = useMemo(
    () => groupBy(cur, (s) => s.local, metric, 'Sem local'),
    [cur, metric],
  )
  const porCidade = useMemo(
    () => groupBy(cur, (s) => s.cidade, metric, 'Sem cidade'),
    [cur, metric],
  )
  const porUf = useMemo(
    () => groupBy(cur, (s) => s.uf, metric, 'Sem UF'),
    [cur, metric],
  )

  const metricLabel = METRIC_LABELS[metric]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Locais</h1>
        <p className="text-sm text-muted-foreground">
          Desempenho por local, cidade e UF em {year}.
        </p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">Local</TabsTrigger>
          <TabsTrigger value="cidade">Cidade</TabsTrigger>
          <TabsTrigger value="uf">UF</TabsTrigger>
        </TabsList>
        <TabsContent value="local" className="mt-4">
          <RankingView
            title="Local"
            groups={porLocal}
            metricLabel={metricLabel}
            drillParam="local"
            loading={isLoading}
          />
        </TabsContent>
        <TabsContent value="cidade" className="mt-4">
          <RankingView
            title="Cidade"
            groups={porCidade}
            metricLabel={metricLabel}
            drillParam="cidade"
            loading={isLoading}
          />
        </TabsContent>
        <TabsContent value="uf" className="mt-4">
          <RankingView
            title="UF"
            groups={porUf}
            metricLabel={metricLabel}
            drillParam="uf"
            loading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
