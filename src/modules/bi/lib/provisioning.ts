import type { Status } from '@/lib/database.types'

export const OUTROS_KEY = '__OUTROS__'

export interface OrgStat {
  organizador: string
  gmvBase: number // GMV no ano-base (ano completo)
  ytd: number // GMV acumulado no ano-alvo
  baseYtg: number // GMV do ano-base nos meses seguintes ao YTD (FY − YTD do ano-base)
}

export interface ProvItem {
  itemKey: string
  nome: string
  status: Status
  gmvBase: number
  ytd: number
  baseYtg: number
  forecast: number // efetivo usado nos totais (manual, se houver; senão = gmvBase)
  forecastManual: number | null // valor inserido manualmente (null = usa padrão)
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
