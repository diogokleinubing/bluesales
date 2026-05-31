import type { SaleEnriched } from './dataset'
import type { DateBase, Metric, Pdv } from './controls'

/** Valor da métrica selecionada para uma venda. */
export function metricValue(sale: SaleEnriched, metric: Metric): number {
  switch (metric) {
    case 'gmv':
      return sale.gmv
    case 'receita_bt':
      return sale.receita_bt
    case 'receita_liq':
      return sale.receita_liq
    case 'mdr':
      return sale.mdr
    case 'rebate':
      return sale.rebate
  }
}

/** Data relevante (string ISO/date) conforme a base de data escolhida. */
export function baseDate(sale: SaleEnriched, dateBase: DateBase): string | null {
  return dateBase === 'venda' ? sale.data_venda : sale.data_evento
}

/** Ano da venda conforme a base de data (null se sem data). */
export function saleYear(sale: SaleEnriched, dateBase: DateBase): number | null {
  const d = baseDate(sale, dateBase)
  if (!d) return null
  const y = new Date(d).getFullYear()
  return Number.isNaN(y) ? null : y
}

/** Mês (0-11) da venda conforme a base de data (null se sem data). */
export function saleMonth(
  sale: SaleEnriched,
  dateBase: DateBase,
): number | null {
  const d = baseDate(sale, dateBase)
  if (!d) return null
  const m = new Date(d).getMonth()
  return Number.isNaN(m) ? null : m
}

/** Aplica o filtro de PDV (múltipla escolha). */
export function matchesPdv(sale: SaleEnriched, pdv: Pdv[]): boolean {
  if (pdv.length === 0) return true
  return sale.tipo_pdv != null && pdv.includes(sale.tipo_pdv)
}

/** Filtra o dataset por PDV e (opcionalmente) por ano na base de data. */
export function filterSales(
  sales: SaleEnriched[],
  opts: { pdv: Pdv[]; year?: number; dateBase: DateBase },
): SaleEnriched[] {
  return sales.filter((s) => {
    if (!matchesPdv(s, opts.pdv)) return false
    if (opts.year != null && saleYear(s, opts.dateBase) !== opts.year)
      return false
    return true
  })
}
