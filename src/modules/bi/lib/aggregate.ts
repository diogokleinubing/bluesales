import type { SaleEnriched } from './dataset'
import type { DateBase, Metric, Pdv } from './controls'
import { filterSales, metricValue, saleMonth } from './metrics'

export interface Kpis {
  gmv: number
  receitaBt: number
  receitaLiq: number
  vendas: number
  eventos: number
  ticketMedio: number
  mdr: number
  rebate: number
  takeRate: number // receitaBt / gmv
}

export function computeKpis(sales: SaleEnriched[]): Kpis {
  let gmv = 0
  let receitaBt = 0
  let receitaLiq = 0
  let mdr = 0
  let rebate = 0
  const eventos = new Set<string>()
  for (const s of sales) {
    gmv += s.gmv
    receitaBt += s.receita_bt
    receitaLiq += s.receita_liq
    mdr += s.mdr
    rebate += s.rebate
    eventos.add(s.codigo_evento)
  }
  const vendas = sales.length
  return {
    gmv,
    receitaBt,
    receitaLiq,
    vendas,
    eventos: eventos.size,
    ticketMedio: vendas > 0 ? gmv / vendas : 0,
    mdr,
    rebate,
    takeRate: gmv > 0 ? receitaBt / gmv : 0,
  }
}

/** Variação relativa (atual vs anterior). null se não há base. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

export interface MonthlyPoint {
  month: number // 0-11
  gmv: number
  receitaBt: number
  receitaLiq: number
  mdr: number
  rebate: number
  vendas: number
  value: number // métrica selecionada
}

export function monthlySeries(
  sales: SaleEnriched[],
  dateBase: DateBase,
  metric: Metric,
): MonthlyPoint[] {
  const points: MonthlyPoint[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    gmv: 0,
    receitaBt: 0,
    receitaLiq: 0,
    mdr: 0,
    rebate: 0,
    vendas: 0,
    value: 0,
  }))
  for (const s of sales) {
    const m = saleMonth(s, dateBase)
    if (m == null) continue
    const p = points[m]
    p.gmv += s.gmv
    p.receitaBt += s.receita_bt
    p.receitaLiq += s.receita_liq
    p.mdr += s.mdr
    p.rebate += s.rebate
    p.vendas += 1
    p.value += metricValue(s, metric)
  }
  return points
}

/** Composição da Receita BT (para o doughnut). */
export interface CompositionSlice {
  key: string
  label: string
  value: number
}

export function receitaComposition(sales: SaleEnriched[]): CompositionSlice[] {
  let conveniencia = 0
  let comissao = 0
  let juros = 0
  let intermediacao = 0
  for (const s of sales) {
    conveniencia += s.valor_conveniencia
    comissao += s.comissao_site
    juros += s.valor_juros
    intermediacao += s.receita_intermediacao
  }
  return [
    { key: 'conveniencia', label: 'Conveniência', value: conveniencia },
    { key: 'comissao', label: 'Comissão site', value: comissao },
    { key: 'juros', label: 'Juros', value: juros },
    { key: 'intermediacao', label: 'Intermediação', value: intermediacao },
  ]
}

/** Agregação genérica por uma chave textual, somando a métrica. */
export interface GroupAgg {
  key: string
  label: string
  value: number
  gmv: number
  receitaBt: number
  vendas: number
}

export function groupBy(
  sales: SaleEnriched[],
  keyFn: (s: SaleEnriched) => string | null,
  metric: Metric,
  fallbackLabel = '—',
): GroupAgg[] {
  const map = new Map<string, GroupAgg>()
  for (const s of sales) {
    const raw = keyFn(s)
    const key = raw && raw.trim() ? raw.trim() : fallbackLabel
    let g = map.get(key)
    if (!g) {
      g = { key, label: key, value: 0, gmv: 0, receitaBt: 0, vendas: 0 }
      map.set(key, g)
    }
    g.value += metricValue(s, metric)
    g.gmv += s.gmv
    g.receitaBt += s.receita_bt
    g.vendas += 1
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}

/** Eventos agregados (para a tela Eventos e o top 10). */
export interface EventAgg {
  codigo_evento: string
  nome: string | null
  segmento: string | null
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  data_evento: string | null
  vendas: number
  gmv: number
  receitaBt: number
  value: number
}

export function aggregateEvents(
  sales: SaleEnriched[],
  metric: Metric,
): EventAgg[] {
  const map = new Map<string, EventAgg>()
  for (const s of sales) {
    let e = map.get(s.codigo_evento)
    if (!e) {
      e = {
        codigo_evento: s.codigo_evento,
        nome: s.nome,
        segmento: s.segmento,
        organizador: s.organizador,
        local: s.local,
        cidade: s.cidade,
        uf: s.uf,
        data_evento: s.data_evento,
        vendas: 0,
        gmv: 0,
        receitaBt: 0,
        value: 0,
      }
      map.set(s.codigo_evento, e)
    }
    e.vendas += 1
    e.gmv += s.gmv
    e.receitaBt += s.receita_bt
    e.value += metricValue(s, metric)
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}

/** Lista de anos disponíveis na base, conforme a base de data. */
export function availableYears(
  sales: SaleEnriched[],
  dateBase: DateBase,
): number[] {
  const set = new Set<number>()
  for (const s of sales) {
    const d = dateBase === 'venda' ? s.data_venda : s.data_evento
    if (!d) continue
    const y = new Date(d).getFullYear()
    if (!Number.isNaN(y)) set.add(y)
  }
  return [...set].sort((a, b) => b - a)
}

export { filterSales }
export type { Pdv }
