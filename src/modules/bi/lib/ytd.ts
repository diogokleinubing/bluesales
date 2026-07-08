import type { SaleEnriched } from './dataset'
import type { DateBase, Metric, Pdv } from './controls'
import { matchesPdv, metricValue, saleMonth, saleYear } from './metrics'
import type { EventRow, YtdGroupRow, YtdMonthlyRow } from './rpc'

export type YtdView =
  | 'organizador'
  | 'segmento'
  | 'cidade'
  | 'uf'
  | 'local'
  | 'familia'

export const YTD_VIEW_LABELS: Record<YtdView, string> = {
  organizador: 'Organizador',
  segmento: 'Segmento',
  cidade: 'Cidade',
  uf: 'UF',
  local: 'Local',
  familia: 'Evento recorrente',
}

export const YTD_VIEW_PARAM: Record<YtdView, string> = {
  organizador: 'organizador',
  segmento: 'segmento',
  cidade: 'cidade',
  uf: 'uf',
  local: 'local',
  familia: 'q',
}

function viewKey(sale: SaleEnriched, view: YtdView): string | null {
  switch (view) {
    case 'organizador':
      return sale.organizador
    case 'segmento':
      return sale.segmento ?? 'Sem segmento'
    case 'cidade':
      return sale.cidade
    case 'uf':
      return sale.uf
    case 'local':
      return sale.local
    case 'familia':
      return null // família vive no servidor; o YTD agrupa via RPC (bi_ytd_group)
  }
}

export interface YtdParams {
  targetYear: number
  monthStart: number // 0-11
  monthEnd: number // 0-11
  dateBase: DateBase
  metric: Metric
  view: YtdView
  pdv: Pdv[]
}

export interface YtdMonthly {
  month: number
  target: number
  base: number
  targetAcc: number
  baseAcc: number
  growth: number | null // (target-base)/base
}

export interface YtdGroup {
  key: string
  label: string
  target: number
  base: number
  deltaAbs: number
  deltaPct: number | null
}

export interface YtdResult {
  totalTarget: number
  totalBase: number
  deltaAbs: number
  deltaPct: number | null
  monthly: YtdMonthly[]
  byView: YtdGroup[]
}

/** Monta o resultado YTD a partir das linhas das RPCs bi_ytd_*. */
export function buildYtdResult(
  monthlyRows: YtdMonthlyRow[],
  groupRows: YtdGroupRow[],
  metric: Metric,
  monthStart: number,
  monthEnd: number,
): YtdResult {
  const metricKey = metric
  const lo = Math.min(monthStart, monthEnd)
  const hi = Math.max(monthStart, monthEnd)

  const tByMonth = new Array(12).fill(0)
  const bByMonth = new Array(12).fill(0)
  for (const r of monthlyRows) {
    const v = Number(r[metricKey] ?? 0)
    if (r.month < 0 || r.month > 11) continue
    if (r.is_target) tByMonth[r.month] += v
    else bByMonth[r.month] += v
  }

  const monthly: YtdMonthly[] = []
  let tAcc = 0
  let bAcc = 0
  let totalTarget = 0
  let totalBase = 0
  for (let m = lo; m <= hi; m++) {
    tAcc += tByMonth[m]
    bAcc += bByMonth[m]
    totalTarget += tByMonth[m]
    totalBase += bByMonth[m]
    monthly.push({
      month: m,
      target: tByMonth[m],
      base: bByMonth[m],
      targetAcc: tAcc,
      baseAcc: bAcc,
      growth: bByMonth[m] !== 0 ? (tByMonth[m] - bByMonth[m]) / Math.abs(bByMonth[m]) : null,
    })
  }

  const gMap = new Map<string, { target: number; base: number }>()
  for (const r of groupRows) {
    const key = (r.key as string | null)?.trim() || '—'
    const v = Number(r[metricKey] ?? 0)
    const g = gMap.get(key) ?? { target: 0, base: 0 }
    if (r.is_target) g.target += v
    else g.base += v
    gMap.set(key, g)
  }
  const byView: YtdGroup[] = [...gMap.entries()]
    .map(([key, g]) => ({
      key,
      label: key,
      target: g.target,
      base: g.base,
      deltaAbs: g.target - g.base,
      deltaPct: g.base !== 0 ? (g.target - g.base) / Math.abs(g.base) : null,
    }))
    .sort((a, b) => b.target - a.target)

  return {
    totalTarget,
    totalBase,
    deltaAbs: totalTarget - totalBase,
    deltaPct: totalBase !== 0 ? (totalTarget - totalBase) / Math.abs(totalBase) : null,
    monthly,
    byView,
  }
}

/** Evento (ou família recorrente) com valores dos dois anos, para a expansão do YTD. */
export interface EventComparo {
  /** Chave de pareamento (família, quando houver; senão o código da edição). */
  key: string
  nome: string
  familia: string | null
  base: number
  target: number
  /** Apareceu nos dois anos (família recorrente) → linha comparativa. */
  multiano: boolean
}

/**
 * Junta eventos do ano-alvo e do ano-base pareando pela **família recorrente**
 * (edições da mesma família nos dois anos viram uma linha comparativa). Eventos
 * sem família ficam só num dos anos.
 */
export function mergeEventYears(
  targetRows: EventRow[],
  baseRows: EventRow[],
  metric: Metric,
): EventComparo[] {
  const map = new Map<string, EventComparo>()
  const fam = (e: EventRow) => (e.familia && e.familia.trim()) || null
  const pairKey = (e: EventRow) => (fam(e) ? `fam:${fam(e)!.toLowerCase()}` : `cod:${e.codigo_evento}`)
  const label = (e: EventRow) => fam(e) || e.nome || e.codigo_evento
  const add = (e: EventRow, year: 'base' | 'target') => {
    const k = pairKey(e)
    const cur = map.get(k) ?? { key: k, nome: label(e), familia: fam(e), base: 0, target: 0, multiano: false }
    cur[year] += Number(e[metric] ?? 0)
    map.set(k, cur)
  }
  for (const e of targetRows) add(e, 'target')
  for (const e of baseRows) add(e, 'base')
  return [...map.values()]
    .map((r) => ({ ...r, multiano: r.base > 0 && r.target > 0 }))
    .sort((a, b) => b.target - a.target || b.base - a.base || a.nome.localeCompare(b.nome, 'pt-BR'))
}

function inRange(month: number, start: number, end: number): boolean {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return month >= lo && month <= hi
}

/** Compara o período [monthStart, monthEnd] do ano-alvo vs o ano anterior. */
export function ytdCompare(
  sales: SaleEnriched[],
  p: YtdParams,
): YtdResult {
  const baseYear = p.targetYear - 1
  const monthlyTarget = new Array(12).fill(0)
  const monthlyBase = new Array(12).fill(0)
  const groupTarget = new Map<string, number>()
  const groupBase = new Map<string, number>()

  for (const s of sales) {
    if (!matchesPdv(s, p.pdv)) continue
    const m = saleMonth(s, p.dateBase)
    if (m == null || !inRange(m, p.monthStart, p.monthEnd)) continue
    const y = saleYear(s, p.dateBase)
    const val = metricValue(s, p.metric)
    const gk = viewKey(s, p.view)
    const key = gk && gk.trim() ? gk.trim() : '—'
    if (y === p.targetYear) {
      monthlyTarget[m] += val
      groupTarget.set(key, (groupTarget.get(key) ?? 0) + val)
    } else if (y === baseYear) {
      monthlyBase[m] += val
      groupBase.set(key, (groupBase.get(key) ?? 0) + val)
    }
  }

  const lo = Math.min(p.monthStart, p.monthEnd)
  const hi = Math.max(p.monthStart, p.monthEnd)
  const monthly: YtdMonthly[] = []
  let tAcc = 0
  let bAcc = 0
  let totalTarget = 0
  let totalBase = 0
  for (let m = lo; m <= hi; m++) {
    tAcc += monthlyTarget[m]
    bAcc += monthlyBase[m]
    totalTarget += monthlyTarget[m]
    totalBase += monthlyBase[m]
    monthly.push({
      month: m,
      target: monthlyTarget[m],
      base: monthlyBase[m],
      targetAcc: tAcc,
      baseAcc: bAcc,
      growth: monthlyBase[m] !== 0 ? (monthlyTarget[m] - monthlyBase[m]) / Math.abs(monthlyBase[m]) : null,
    })
  }

  const keys = new Set([...groupTarget.keys(), ...groupBase.keys()])
  const byView: YtdGroup[] = [...keys]
    .map((key) => {
      const target = groupTarget.get(key) ?? 0
      const base = groupBase.get(key) ?? 0
      return {
        key,
        label: key,
        target,
        base,
        deltaAbs: target - base,
        deltaPct: base !== 0 ? (target - base) / Math.abs(base) : null,
      }
    })
    .sort((a, b) => b.target - a.target)

  return {
    totalTarget,
    totalBase,
    deltaAbs: totalTarget - totalBase,
    deltaPct: totalBase !== 0 ? (totalTarget - totalBase) / Math.abs(totalBase) : null,
    monthly,
    byView,
  }
}
