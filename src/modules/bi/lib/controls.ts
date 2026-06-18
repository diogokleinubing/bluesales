// Tipos e constantes dos controles globais (barra superior).

export type Metric = 'gmv' | 'receita_bt' | 'receita_liq' | 'mdr' | 'rebate'

export const METRIC_LABELS: Record<Metric, string> = {
  gmv: 'GMV',
  receita_bt: 'Receita BT',
  receita_liq: 'Receita Líquida BT',
  mdr: 'MDR',
  rebate: 'Rebate',
}

/** Base de agrupamento por período. */
export type DateBase = 'venda' | 'evento'

export const DATE_BASE_LABELS: Record<DateBase, string> = {
  venda: 'Mês da Venda',
  evento: 'Mês do Evento',
}

/** Tipo de PDV: E = Site/Ecommerce, D = PDV Digital, I = PDV Físico. */
export type Pdv = 'E' | 'D' | 'I'

export const PDV_LABELS: Record<Pdv, string> = {
  E: 'Site',
  D: 'PDV Digital',
  I: 'PDV Físico',
}

export const ALL_PDV: Pdv[] = ['E', 'D', 'I']

export const ALL_MONTHS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export const MONTH_NAMES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

export interface GlobalControls {
  year: number
  metric: Metric
  dateBase: DateBase
  /** Múltipla escolha. Default = somente Site (E). */
  pdv: Pdv[]
  /** Meses (1-12) a considerar. Default = todos. */
  months: number[]
}

export const CURRENT_YEAR = new Date().getFullYear()

export const DEFAULT_CONTROLS: GlobalControls = {
  year: CURRENT_YEAR,
  metric: 'gmv',
  dateBase: 'venda',
  pdv: ['E'],
  months: ALL_MONTHS,
}

/** Array para a RPC: null quando todos os 12 meses (sem filtro). */
export function monthsArg(months: number[]): number[] | null {
  if (!months || months.length === 0 || months.length >= 12) return null
  return [...months].sort((a, b) => a - b)
}

const STORAGE_KEY = 'bt:global-controls'

export function loadControls(): GlobalControls {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONTROLS
    const parsed = JSON.parse(raw) as Partial<GlobalControls>
    return {
      ...DEFAULT_CONTROLS,
      ...parsed,
      metric: 'gmv', // conceito abandonado: todos os relatórios fixos em GMV
      pdv:
        Array.isArray(parsed.pdv) && parsed.pdv.length > 0
          ? parsed.pdv
          : DEFAULT_CONTROLS.pdv,
      months:
        Array.isArray(parsed.months) && parsed.months.length > 0
          ? parsed.months
          : DEFAULT_CONTROLS.months,
    }
  } catch {
    return DEFAULT_CONTROLS
  }
}

export function saveControls(controls: GlobalControls): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(controls))
  } catch {
    // ignora falhas de storage
  }
}
