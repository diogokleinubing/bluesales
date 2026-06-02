import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RankingView } from '../components/RankingView'
import { CompareToggle } from '../components/CompareToggle'
import { useGroupAnalysis } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'

export function LocaisPage() {
  const { year, metric } = useControls()
  const [compare, setCompare] = useState(false)
  const porLocal = useGroupAnalysis('local', 'Sem local', compare)
  const porCidade = useGroupAnalysis('cidade', 'Sem cidade', compare)
  const porUf = useGroupAnalysis('uf', 'Sem UF', compare)

  const metricLabel = METRIC_LABELS[metric]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locais</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho por local, cidade e UF em {year}.
          </p>
        </div>
        <CompareToggle checked={compare} onChange={setCompare} />
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
            groups={porLocal.groups}
            metricLabel={metricLabel}
            drillParam="local"
            loading={porLocal.loading}
            compare={compare}
          />
        </TabsContent>
        <TabsContent value="cidade" className="mt-4">
          <RankingView
            title="Cidade"
            groups={porCidade.groups}
            metricLabel={metricLabel}
            drillParam="cidade"
            loading={porCidade.loading}
            compare={compare}
          />
        </TabsContent>
        <TabsContent value="uf" className="mt-4">
          <RankingView
            title="UF"
            groups={porUf.groups}
            metricLabel={metricLabel}
            drillParam="uf"
            loading={porUf.loading}
            compare={compare}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
