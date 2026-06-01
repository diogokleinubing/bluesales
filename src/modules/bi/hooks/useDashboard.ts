import { useMemo } from 'react'
import { useBiDashboard } from './useBi'
import { useControls } from '@/modules/shared/controls-context'
import { metricOf } from '../lib/rpc'

export interface KpiSet {
  gmv: number
  receitaBt: number
  receitaLiq: number
  vendas: number
  eventos: number
  ticketMedio: number
  mdr: number
  rebate: number
  takeRate: number
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}

export function useDashboard() {
  const { metric } = useControls()
  const query = useBiDashboard()
  const d = query.data

  const data = useMemo(() => {
    const cur = d?.cur
    const prev = d?.prev
    const kpis: KpiSet = {
      gmv: Number(cur?.gmv ?? 0),
      receitaBt: Number(cur?.receita_bt ?? 0),
      receitaLiq: Number(cur?.receita_liq ?? 0),
      vendas: Number(cur?.qtd ?? 0),
      eventos: Number(cur?.eventos ?? 0),
      ticketMedio: Number(cur?.qtd ?? 0) > 0 ? Number(cur!.gmv) / Number(cur!.qtd) : 0,
      mdr: Number(cur?.mdr ?? 0),
      rebate: Number(cur?.rebate ?? 0),
      takeRate: Number(cur?.gmv ?? 0) > 0 ? Number(cur!.receita_bt) / Number(cur!.gmv) : 0,
    }
    const pv: KpiSet = {
      gmv: Number(prev?.gmv ?? 0),
      receitaBt: Number(prev?.receita_bt ?? 0),
      receitaLiq: Number(prev?.receita_liq ?? 0),
      vendas: Number(prev?.qtd ?? 0),
      eventos: Number(prev?.eventos ?? 0),
      ticketMedio: Number(prev?.qtd ?? 0) > 0 ? Number(prev!.gmv) / Number(prev!.qtd) : 0,
      mdr: Number(prev?.mdr ?? 0),
      rebate: Number(prev?.rebate ?? 0),
      takeRate: Number(prev?.gmv ?? 0) > 0 ? Number(prev!.receita_bt) / Number(prev!.gmv) : 0,
    }
    const delta = {} as Record<keyof KpiSet, number | null>
    ;(Object.keys(kpis) as (keyof KpiSet)[]).forEach((k) => {
      delta[k] = pctChange(kpis[k], pv[k])
    })

    const monthly = (d?.monthly ?? []).reduce(
      (acc, m) => {
        acc[m.month] = {
          month: m.month,
          gmv: Number(m.gmv),
          receitaBt: Number(m.receita_bt),
          value: metricOf(m, metric),
        }
        return acc
      },
      Array.from({ length: 12 }, (_, month) => ({
        month,
        gmv: 0,
        receitaBt: 0,
        value: 0,
      })),
    )

    const composition = [
      { key: 'conveniencia', label: 'Conveniência', value: Number(cur?.conveniencia ?? 0) },
      { key: 'comissao', label: 'Comissão site', value: Number(cur?.comissao ?? 0) },
      { key: 'juros', label: 'Juros', value: Number(cur?.juros ?? 0) },
      { key: 'intermediacao', label: 'Intermediação', value: Number(cur?.intermediacao ?? 0) },
    ]

    const topEvents = (d?.topEvents ?? []).map((e) => ({
      codigo_evento: e.codigo_evento,
      nome: e.nome,
      value: metricOf(e, metric),
    }))

    const segments = (d?.segments ?? [])
      .map((g) => ({
        key: g.key ?? 'Sem segmento',
        label: g.key ?? 'Sem segmento',
        value: metricOf(g, metric),
      }))
      .sort((a, b) => b.value - a.value)

    const generos = (d?.generos ?? [])
      .map((g) => ({
        key: g.key ?? 'Sem gênero',
        label: g.key ?? 'Sem gênero',
        value: metricOf(g, metric),
      }))
      .sort((a, b) => b.value - a.value)

    return { kpis, delta, monthly, composition, topEvents, segments, generos }
  }, [d, metric])

  return {
    ...data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
