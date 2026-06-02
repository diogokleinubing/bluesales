import { useMemo } from 'react'
import { useBiDashboard } from './useBi'

export interface KpiSet {
  gmv: number
  vendas: number
  eventos: number
  ticketMedio: number
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}

export interface MonthlyPoint {
  month: number
  gmv: number
  gmvPrev: number
}

export function useDashboard() {
  const query = useBiDashboard()
  const d = query.data

  const data = useMemo(() => {
    const cur = d?.cur
    const prev = d?.prev

    const kpis: KpiSet = {
      gmv: Number(cur?.gmv ?? 0),
      vendas: Number(cur?.qtd ?? 0),
      eventos: Number(cur?.eventos ?? 0),
      ticketMedio:
        Number(cur?.qtd ?? 0) > 0 ? Number(cur!.gmv) / Number(cur!.qtd) : 0,
    }
    const pv: KpiSet = {
      gmv: Number(prev?.gmv ?? 0),
      vendas: Number(prev?.qtd ?? 0),
      eventos: Number(prev?.eventos ?? 0),
      ticketMedio:
        Number(prev?.qtd ?? 0) > 0 ? Number(prev!.gmv) / Number(prev!.qtd) : 0,
    }
    const delta = {} as Record<keyof KpiSet, number | null>
    ;(Object.keys(kpis) as (keyof KpiSet)[]).forEach((k) => {
      delta[k] = pctChange(kpis[k], pv[k])
    })

    // Série mensal de GMV: ano atual + ano anterior (mesmo mês).
    const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, month) => ({
      month,
      gmv: 0,
      gmvPrev: 0,
    }))
    for (const m of d?.monthly ?? []) {
      if (m.month >= 0 && m.month < 12) monthly[m.month].gmv = Number(m.gmv)
    }
    for (const m of d?.prevMonthly ?? []) {
      if (m.month >= 0 && m.month < 12) monthly[m.month].gmvPrev = Number(m.gmv)
    }

    return { kpis, delta, monthly, lastMonth: d?.lastMonth ?? null }
  }, [d])

  return {
    ...data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
