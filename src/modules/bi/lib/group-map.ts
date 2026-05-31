import type { Metric } from './controls'
import { metricOf, type GroupRow } from './rpc'
import type { GroupAgg } from './aggregate'

/** Converte linhas da RPC bi_group para o formato usado pelo RankingView. */
export function groupRowsToAgg(
  rows: GroupRow[],
  metric: Metric,
  fallbackLabel: string,
): GroupAgg[] {
  return rows
    .map((r) => {
      const label = r.key && r.key.trim() ? r.key.trim() : fallbackLabel
      return {
        key: label,
        label,
        value: metricOf(r, metric),
        gmv: Number(r.gmv),
        receitaBt: Number(r.receita_bt),
        vendas: Number(r.qtd),
      }
    })
    .sort((a, b) => b.value - a.value)
}
