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

export interface GlobalControls {
  year: number
  metric: Metric
  dateBase: DateBase
  /** Múltipla escolha. Default = somente Site (E). */
  pdv: Pdv[]
}

export const CURRENT_YEAR = new Date().getFullYear()

export const DEFAULT_CONTROLS: GlobalControls = {
  year: CURRENT_YEAR,
  metric: 'gmv',
  dateBase: 'venda',
  pdv: ['E'],
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
      pdv:
        Array.isArray(parsed.pdv) && parsed.pdv.length > 0
          ? parsed.pdv
          : DEFAULT_CONTROLS.pdv,
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
