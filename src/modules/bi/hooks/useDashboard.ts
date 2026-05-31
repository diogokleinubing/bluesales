import { useMemo } from 'react'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import {
  aggregateEvents,
  computeKpis,
  groupBy,
  monthlySeries,
  pctChange,
  receitaComposition,
  type EventAgg,
  type Kpis,
} from '../lib/aggregate'
import { filterSales } from '../lib/metrics'

export interface DashboardData {
  kpis: Kpis
  prevKpis: Kpis
  delta: Record<keyof Kpis, number | null>
  monthly: ReturnType<typeof monthlySeries>
  composition: ReturnType<typeof receitaComposition>
  topEvents: EventAgg[]
  segments: ReturnType<typeof groupBy>
}

export function useDashboard() {
  const { sales, isLoading, isError, error } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()

  const data = useMemo<DashboardData>(() => {
    const cur = filterSales(sales, { pdv, year, dateBase })
    const prev = filterSales(sales, { pdv, year: year - 1, dateBase })

    const kpis = computeKpis(cur)
    const prevKpis = computeKpis(prev)
    const delta = {} as Record<keyof Kpis, number | null>
    ;(Object.keys(kpis) as (keyof Kpis)[]).forEach((k) => {
      delta[k] = pctChange(kpis[k], prevKpis[k])
    })

    return {
      kpis,
      prevKpis,
      delta,
      monthly: monthlySeries(cur, dateBase, metric),
      composition: receitaComposition(cur),
      topEvents: aggregateEvents(cur, metric).slice(0, 10),
      segments: groupBy(cur, (s) => s.segmento, metric, 'Sem segmento'),
    }
  }, [sales, year, metric, dateBase, pdv])

  return { ...data, isLoading, isError, error }
}
