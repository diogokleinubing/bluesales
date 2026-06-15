import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RankingView } from '../components/RankingView'
import { CompareToggle } from '../components/CompareToggle'
import { useGroupAnalysis, useOrgId } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'
import { norm } from '../lib/classify'
import { biOrgClienteDesde } from '../lib/rpc'

export function OrganizadoresPage() {
  const { year, metric } = useControls()
  const orgId = useOrgId()
  const [compare, setCompare] = useState(false)
  const { groups, loading } = useGroupAnalysis('organizador', 'Sem organizador', compare)

  // Ano "cliente desde" por organizador (principal). Vem da RPC bi_org_cliente_desde,
  // que usa a MESMA resolução do bi_group (sub -> principal) e devolve o MENOR ano
  // do grupo (principal + subs). Chave = nome da principal, igual ao rótulo da
  // listagem; normalizamos só por segurança.
  const { data: desdeByKey } = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'org-cliente-desde', orgId],
    queryFn: async () => {
      const rows = await biOrgClienteDesde(orgId!)
      const m = new Map<string, number>()
      for (const r of rows) if (r.cliente_desde != null) m.set(norm(r.key), r.cliente_desde)
      return m
    },
  })
  const desdeOf = useMemo(
    () => (desdeByKey ? (label: string) => desdeByKey.get(norm(label)) ?? null : undefined),
    [desdeByKey],
  )

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
        desde={desdeOf}
      />
    </div>
  )
}
