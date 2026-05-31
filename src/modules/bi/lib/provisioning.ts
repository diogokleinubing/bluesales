import type { SaleEnriched } from './dataset'
import type { DateBase, Pdv } from './controls'
import type { Status } from '@/lib/database.types'
import { matchesPdv, saleMonth, saleYear } from './metrics'

export const OUTROS_KEY = '__OUTROS__'

export interface OrgStat {
  organizador: string
  gmvBase: number // GMV no ano-base
  ytd: number // GMV acumulado no ano-alvo
  runRate: number // YTD anualizado
}

export interface ProvisioningInput {
  baseYear: number
  targetYear: number
  dateBase: DateBase
  pdv: Pdv[]
}

/** Estatísticas por organizador + nº de meses com dados no ano-alvo. */
export function computeOrgStats(
  sales: SaleEnriched[],
  input: ProvisioningInput,
): { stats: OrgStat[]; monthsElapsed: number } {
  const base = new Map<string, number>()
  const ytd = new Map<string, number>()
  let maxMonth = -1

  for (const s of sales) {
    if (!matchesPdv(s, input.pdv)) continue
    const y = saleYear(s, input.dateBase)
    const org = s.organizador?.trim() || 'Sem organizador'
    if (y === input.baseYear) {
      base.set(org, (base.get(org) ?? 0) + s.gmv)
    } else if (y === input.targetYear) {
      ytd.set(org, (ytd.get(org) ?? 0) + s.gmv)
      const m = saleMonth(s, input.dateBase)
      if (m != null && m > maxMonth) maxMonth = m
    }
  }

  const monthsElapsed = maxMonth >= 0 ? maxMonth + 1 : 12
  const orgs = new Set([...base.keys(), ...ytd.keys()])
  const stats: OrgStat[] = [...orgs]
    .map((organizador) => {
      const y = ytd.get(organizador) ?? 0
      return {
        organizador,
        gmvBase: base.get(organizador) ?? 0,
        ytd: y,
        runRate: (y / monthsElapsed) * 12,
      }
    })
    .sort((a, b) => b.gmvBase - a.gmvBase)

  return { stats, monthsElapsed }
}

export interface ProvItem {
  itemKey: string
  nome: string
  status: Status
  gmvBase: number
  ytd: number
  runRate: number
  forecast: number
  isNovo: boolean
  isOutros: boolean
}

export interface WaterfallStep {
  name: string
  delta: number // assinado
  absolute?: boolean // barra "cheia" (Base/Total)
}

/** Decompõe a previsão em passos de waterfall. */
export function buildWaterfall(items: ProvItem[]): {
  steps: WaterfallStep[]
  base: number
  total: number
} {
  let base = 0
  let perdas = 0
  let reducoes = 0
  let crescimento = 0
  let demais = 0
  let novos = 0

  for (const it of items) {
    const eff = it.status === 'Perdido' ? 0 : it.forecast
    if (it.isNovo) {
      novos += eff
      continue
    }
    base += it.gmvBase
    if (it.isOutros) {
      demais += eff - it.gmvBase
      continue
    }
    if (it.status === 'Perdido') {
      perdas += -it.gmvBase
      continue
    }
    const delta = eff - it.gmvBase
    if (delta < 0) reducoes += delta
    else crescimento += delta
  }

  const total = base + perdas + reducoes + crescimento + demais + novos
  const steps: WaterfallStep[] = [
    { name: 'Base', delta: base, absolute: true },
    { name: 'Perdas', delta: perdas },
    { name: 'Reduções', delta: reducoes },
    { name: 'Crescimento', delta: crescimento },
    { name: 'Demais', delta: demais },
    { name: 'Novos', delta: novos },
    { name: 'Previsão', delta: total, absolute: true },
  ]
  return { steps, base, total }
}

/** Converte os passos em barras (offset + altura) para o gráfico. */
export interface WaterfallBar {
  name: string
  offset: number
  height: number
  positive: boolean
  value: number
}

export function waterfallBars(steps: WaterfallStep[]): WaterfallBar[] {
  let cum = 0
  return steps.map((s) => {
    if (s.absolute) {
      const bar: WaterfallBar = {
        name: s.name,
        offset: 0,
        height: s.delta,
        positive: s.delta >= 0,
        value: s.delta,
      }
      cum = s.delta
      return bar
    }
    const start = cum
    const end = cum + s.delta
    cum = end
    return {
      name: s.name,
      offset: Math.min(start, end),
      height: Math.abs(s.delta),
      positive: s.delta >= 0,
      value: s.delta,
    }
  })
}
