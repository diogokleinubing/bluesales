import { useQuery } from '@tanstack/react-query'
import { useDefaultOrg } from '@/lib/org'
import { useControls } from '@/modules/shared/controls-context'
import type { DateBase, Pdv } from '../lib/controls'
import * as rpc from '../lib/rpc'

const STALE = 5 * 60 * 1000

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
      const [cur, prev, monthly, segments, topEvents] = await Promise.all([
        rpc.biSummary(orgId!, year, dateBase, pdv),
        rpc.biSummary(orgId!, year - 1, dateBase, pdv),
        rpc.biMonthly(orgId!, year, dateBase, pdv),
        rpc.biGroup(orgId!, year, dateBase, pdv, 'segmento'),
        rpc.biEvents(orgId!, year, dateBase, pdv, { limit: 10 }),
      ])
      return { cur, prev, monthly, segments, topEvents }
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
