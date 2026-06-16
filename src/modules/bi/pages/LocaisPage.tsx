import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { RankingView } from '../components/RankingView'
import { CompareToggle } from '../components/CompareToggle'
import { useGroupAnalysis } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'
import { norm } from '../lib/classify'

export function LocaisPage() {
  const { year, metric } = useControls()
  const [compare, setCompare] = useState(false)
  const [buscaLocal, setBuscaLocal] = useState('')
  const porLocal = useGroupAnalysis('local', 'Sem local', compare)
  const porCidade = useGroupAnalysis('cidade', 'Sem cidade', compare)
  const porUf = useGroupAnalysis('uf', 'Sem UF', compare)

  // Filtra os locais por nome em tempo real (afeta gráfico e tabela).
  const localGroups = useMemo(() => {
    const q = norm(buscaLocal.trim())
    if (!q) return porLocal.groups
    return porLocal.groups.filter((g) => norm(g.label).includes(q))
  }, [porLocal.groups, buscaLocal])

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
        <TabsContent value="local" className="mt-4 space-y-3">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={buscaLocal}
              onChange={(e) => setBuscaLocal(e.target.value)}
              placeholder="Buscar local…"
              className="pl-8"
            />
          </div>
          <RankingView
            title="Local"
            groups={localGroups}
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
