import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDefaultOrg } from '@/lib/org'
import { useControls } from '@/modules/shared/controls-context'
import type { DateBase, Pdv } from '../lib/controls'
import * as rpc from '../lib/rpc'
import { groupRowsToAgg, gmvByKey } from '../lib/group-map'
import type { GroupAgg } from '../lib/aggregate'

const STALE = 5 * 60 * 1000

/** Último mês (1-12) com vendas, a partir das linhas mensais (month 0-based). */
export function lastMonthWithSales(
  monthly: { month: number; qtd: number }[] | undefined,
): number | null {
  if (!monthly || monthly.length === 0) return null
  let max = -1
  for (const r of monthly) if (Number(r.qtd) > 0 && r.month > max) max = r.month
  return max < 0 ? null : max + 1
}

/** org id default (todas as queries dependem dele). */
export function useOrgId() {
  return useDefaultOrg().data?.id
}

export function useBiYears(dateBase: DateBase) {
  const orgId = useOrgId()
  return useQuery({
    enabled: !!orgId,
    queryKey: ['bi', 'years', orgId, dateBase],
    staleTime: STALE,
    queryFn: () => rpc.biYears(orgId!, dateBase),
  })
}

/** KPIs do ano selecionado + ano anterior (para o comparativo). */
export function useBiDashboard() {
  const orgId = useOrgId()
  const { year, dateBase, pdv } = useControls()
  return useQuery({
    enabled: !!orgId,
    staleTime: STALE,
    queryKey: ['bi', 'dashboard', orgId, year, dateBase, pdv],
    queryFn: async () => {
      const [cur, prev, monthly, segments, generos, topEvents] =
        await Promise.all([
          rpc.biSummary(orgId!, year, dateBase, pdv),
          rpc.biSummary(orgId!, year - 1, dateBase, pdv),
          rpc.biMonthly(orgId!, year, dateBase, pdv),
          rpc.biGroup(orgId!, year, dateBase, pdv, 'segmento'),
          rpc.biGroup(orgId!, year, dateBase, pdv, 'genero'),
          rpc.biEvents(orgId!, year, dateBase, pdv, { limit: 10 }),
        ])
      return { cur, prev, monthly, segments, generos, topEvents }
    },
  })
}

export function useBiMonthly() {
  const orgId = useOrgId()
  const { year, dateBase, pdv } = useControls()
  return useQuery({
    enabled: !!orgId,
    staleTime: STALE,
    queryKey: ['bi', 'monthly', orgId, year, dateBase, pdv],
    queryFn: () => rpc.biMonthly(orgId!, year, dateBase, pdv),
  })
}

export function useBiGroup(dim: string) {
  const orgId = useOrgId()
  const { year, dateBase, pdv } = useControls()
  return useQuery({
    enabled: !!orgId,
    staleTime: STALE,
    queryKey: ['bi', 'group', orgId, year, dateBase, pdv, dim],
    queryFn: () => rpc.biGroup(orgId!, year, dateBase, pdv, dim),
  })
}

/**
 * Análise por dimensão (Segmentos/Gêneros/Organizadores/Locais) com colunas
 * GMV Total/On-Line e comparativo opcional com o ano anterior, até o último
 * mês com vendas do ano atual.
 */
export function useGroupAnalysis(
  dim: string,
  fallbackLabel: string,
  compare: boolean,
): { groups: GroupAgg[]; loading: boolean } {
  const orgId = useOrgId()
  const { year, dateBase, pdv, metric } = useControls()

  const curQ = useQuery({
    enabled: !!orgId,
    staleTime: STALE,
    queryKey: ['bi', 'group', orgId, year, dateBase, pdv, dim],
    queryFn: () => rpc.biGroup(orgId!, year, dateBase, pdv, dim),
  })

  const monthlyQ = useQuery({
    enabled: !!orgId && compare,
    staleTime: STALE,
    queryKey: ['bi', 'monthly', orgId, year, dateBase, pdv],
    queryFn: () => rpc.biMonthly(orgId!, year, dateBase, pdv),
  })
  const lastMonth = lastMonthWithSales(monthlyQ.data)

  const prevQ = useQuery({
    enabled: !!orgId && compare && lastMonth != null,
    staleTime: STALE,
    queryKey: ['bi', 'group-prev', orgId, year - 1, dateBase, pdv, dim, lastMonth],
    queryFn: () =>
      rpc.biGroup(orgId!, year - 1, dateBase, pdv, dim, lastMonth),
  })

  const groups = useMemo(() => {
    const prevByKey =
      compare && prevQ.data ? gmvByKey(prevQ.data, fallbackLabel) : undefined
    return groupRowsToAgg(curQ.data ?? [], metric, fallbackLabel, prevByKey)
  }, [curQ.data, metric, fallbackLabel, compare, prevQ.data])

  const loading =
    curQ.isLoading ||
    (compare && (monthlyQ.isLoading || (lastMonth != null && prevQ.isLoading)))

  return { groups, loading }
}

export function useBiMonthlyByGroup(dim: string, keys: string[]) {
  const orgId = useOrgId()
  const { year, dateBase, pdv } = useControls()
  return useQuery({
    enabled: !!orgId && keys.length > 0,
    staleTime: STALE,
    queryKey: ['bi', 'monthly-group', orgId, year, dateBase, pdv, dim, keys],
    queryFn: () => rpc.biMonthlyByGroup(orgId!, year, dateBase, pdv, dim, keys),
  })
}

export function useBiBase() {
  const orgId = useOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: STALE,
    queryKey: ['bi', 'base', orgId],
    queryFn: async () => {
      const [years, totals] = await Promise.all([
        rpc.biBaseSummary(orgId!),
        rpc.biBaseTotals(orgId!),
      ])
      return { years, totals }
    },
  })
}

export type { DateBase, Pdv }
