import type { Metric } from './controls'
import { metricOf, type GroupRow } from './rpc'
import type { GroupAgg } from './aggregate'

/** Converte linhas da RPC bi_group para o formato usado pelo RankingView. */
export function groupRowsToAgg(
  rows: GroupRow[],
  metric: Metric,
  fallbackLabel: string,
  prevByKey?: Map<string, number>,
): GroupAgg[] {
  return rows
    .map((r) => {
      const label = r.key && r.key.trim() ? r.key.trim() : fallbackLabel
      return {
        key: label,
        label,
        value: metricOf(r, metric),
        gmv: Number(r.gmv),
        gmvOnline: Number(r.gmv_online ?? 0),
        receitaBt: Number(r.receita_bt),
        vendas: Number(r.qtd),
        eventos: Number(r.eventos ?? 0),
        cidade: r.cidade ?? null,
        uf: r.uf ?? null,
        gmvPrev: prevByKey?.get(label),
      }
    })
    .sort((a, b) => b.value - a.value)
}

/** Mapa label -> GMV total, a partir de linhas de bi_group (ano anterior). */
export function gmvByKey(
  rows: GroupRow[],
  fallbackLabel: string,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const label = r.key && r.key.trim() ? r.key.trim() : fallbackLabel
    m.set(label, Number(r.gmv))
  }
  return m
}
