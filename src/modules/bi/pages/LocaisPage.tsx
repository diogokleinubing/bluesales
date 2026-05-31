import { useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RankingView } from '../components/RankingView'
import { useBiGroup } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { groupRowsToAgg } from '../lib/group-map'
import { METRIC_LABELS } from '../lib/controls'

export function LocaisPage() {
  const { year, metric } = useControls()
  const localQ = useBiGroup('local')
  const cidadeQ = useBiGroup('cidade')
  const ufQ = useBiGroup('uf')

  const porLocal = useMemo(
    () => groupRowsToAgg(localQ.data ?? [], metric, 'Sem local'),
    [localQ.data, metric],
  )
  const porCidade = useMemo(
    () => groupRowsToAgg(cidadeQ.data ?? [], metric, 'Sem cidade'),
    [cidadeQ.data, metric],
  )
  const porUf = useMemo(
    () => groupRowsToAgg(ufQ.data ?? [], metric, 'Sem UF'),
    [ufQ.data, metric],
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
            loading={localQ.isLoading}
          />
        </TabsContent>
        <TabsContent value="cidade" className="mt-4">
          <RankingView
            title="Cidade"
            groups={porCidade}
            metricLabel={metricLabel}
            drillParam="cidade"
            loading={cidadeQ.isLoading}
          />
        </TabsContent>
        <TabsContent value="uf" className="mt-4">
          <RankingView
            title="UF"
            groups={porUf}
            metricLabel={metricLabel}
            drillParam="uf"
            loading={ufQ.isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
