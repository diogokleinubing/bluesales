import { supabase } from '@/lib/supabase'
import type { Metric, Pdv, DateBase } from './controls'

// Wrappers tipados das funções de agregação (consolidador no Postgres).
// Todas filtram por org e devolvem apenas o resultado agregado.

export interface MetricSums {
  gmv: number
  /** GMV apenas das vendas do Site (tipo_pdv='E'). Pode faltar em algumas RPCs. */
  gmv_online?: number
  receita_bt: number
  receita_liq: number
  mdr: number
  rebate: number
}

/** Valor da métrica selecionada a partir de uma linha com somas. */
export function metricOf(row: MetricSums, metric: Metric): number {
  switch (metric) {
    case 'gmv':
      return Number(row.gmv)
    case 'receita_bt':
      return Number(row.receita_bt)
    case 'receita_liq':
      return Number(row.receita_liq)
    case 'mdr':
      return Number(row.mdr)
    case 'rebate':
      return Number(row.rebate)
  }
}

/** PDV[] -> array para a RPC (null = sem filtro). */
function pdvArg(pdv: Pdv[]): string[] | null {
  return pdv.length > 0 ? pdv : null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

export interface Summary extends MetricSums {
  conveniencia: number
  comissao: number
  juros: number
  intermediacao: number
  qtd: number
  eventos: number
}

export async function biYears(orgId: string, dateBase: DateBase) {
  return rpc<number[]>('bi_years', { p_org: orgId, p_datebase: dateBase })
}

export async function biSummary(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
  monthMax: number | null = null,
): Promise<Summary> {
  const rows = await rpc<Summary[]>('bi_summary', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
    p_month_max: monthMax,
  })
  return (
    rows[0] ?? {
      gmv: 0, gmv_online: 0, receita_bt: 0, receita_liq: 0, mdr: 0, rebate: 0,
      conveniencia: 0, comissao: 0, juros: 0, intermediacao: 0, qtd: 0, eventos: 0,
    }
  )
}

export interface MonthlyRow extends MetricSums {
  month: number
  qtd: number
}

export async function biMonthly(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
): Promise<MonthlyRow[]> {
  return rpc<MonthlyRow[]>('bi_monthly', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
  })
}

export interface GroupRow extends MetricSums {
  key: string | null
  qtd: number
}

export async function biGroup(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
  dim: string,
  monthMax: number | null = null,
): Promise<GroupRow[]> {
  return rpc<GroupRow[]>('bi_group', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
    p_dim: dim,
    p_month_max: monthMax,
  })
}

export interface MonthlyGroupRow extends MetricSums {
  month: number
  key: string | null
}

export async function biMonthlyByGroup(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
  dim: string,
  keys: string[],
): Promise<MonthlyGroupRow[]> {
  return rpc<MonthlyGroupRow[]>('bi_monthly_by_group', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
    p_dim: dim,
    p_keys: keys,
  })
}

export interface EventRow extends MetricSums {
  codigo_evento: string
  nome: string | null
  segmento: string | null
  genero: string | null
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  data_evento: string | null
  qtd: number
  total_count: number
}

export interface BiEventsParams {
  search?: string
  segmento?: string
  genero?: string
  organizador?: string
  local?: string
  cidade?: string
  uf?: string
  codigo?: string
  order?: Metric
  limit?: number
  offset?: number
}

export async function biEvents(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
  params: BiEventsParams = {},
): Promise<EventRow[]> {
  return rpc<EventRow[]>('bi_events', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
    p_search: params.search || null,
    p_segmento: params.segmento || null,
    p_genero: params.genero || null,
    p_organizador: params.organizador || null,
    p_local: params.local || null,
    p_cidade: params.cidade || null,
    p_uf: params.uf || null,
    p_codigo: params.codigo || null,
    p_order: params.order ?? 'gmv',
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  })
}

export interface PopularVenue {
  local: string
  eventos: number
}

export async function biPopularVenues(
  orgId: string,
  search: string,
  limit = 200,
): Promise<PopularVenue[]> {
  return rpc<PopularVenue[]>('bi_popular_venues', {
    p_org: orgId,
    p_search: search || null,
    p_limit: limit,
  })
}

/** Maiores eventos por GMV em toda a base (year=null). */
export async function biBiggestEvents(
  orgId: string,
  search: string,
  limit = 200,
): Promise<EventRow[]> {
  return rpc<EventRow[]>('bi_events', {
    p_org: orgId,
    p_year: null,
    p_datebase: 'venda',
    p_pdv: null,
    p_search: search || null,
    p_segmento: null,
    p_genero: null,
    p_organizador: null,
    p_local: null,
    p_cidade: null,
    p_uf: null,
    p_codigo: null,
    p_order: 'gmv',
    p_limit: limit,
    p_offset: 0,
  })
}

export interface EventOption {
  dim: string
  value: string
}

export async function biEventOptions(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
): Promise<EventOption[]> {
  return rpc<EventOption[]>('bi_event_options', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
  })
}

export interface YtdMonthlyRow extends MetricSums {
  month: number
  is_target: boolean
}

export async function biYtdMonthly(
  orgId: string,
  targetYear: number,
  mStart: number,
  mEnd: number,
  dateBase: DateBase,
  pdv: Pdv[],
): Promise<YtdMonthlyRow[]> {
  return rpc<YtdMonthlyRow[]>('bi_ytd_monthly', {
    p_org: orgId,
    p_target_year: targetYear,
    p_mstart: mStart,
    p_mend: mEnd,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
  })
}

export interface YtdGroupRow extends MetricSums {
  key: string | null
  is_target: boolean
}

export async function biYtdGroup(
  orgId: string,
  targetYear: number,
  mStart: number,
  mEnd: number,
  dateBase: DateBase,
  pdv: Pdv[],
  dim: string,
): Promise<YtdGroupRow[]> {
  return rpc<YtdGroupRow[]>('bi_ytd_group', {
    p_org: orgId,
    p_target_year: targetYear,
    p_mstart: mStart,
    p_mend: mEnd,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
    p_dim: dim,
  })
}

export interface ProvStatRow {
  organizador: string
  gmv_base: number
  ytd: number
}

export async function biProvStats(
  orgId: string,
  baseYear: number,
  targetYear: number,
  dateBase: DateBase,
  pdv: Pdv[],
): Promise<ProvStatRow[]> {
  return rpc<ProvStatRow[]>('bi_prov_stats', {
    p_org: orgId,
    p_base_year: baseYear,
    p_target_year: targetYear,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
  })
}

export async function biMonthsElapsed(
  orgId: string,
  year: number,
  dateBase: DateBase,
  pdv: Pdv[],
): Promise<number> {
  return rpc<number>('bi_months_elapsed', {
    p_org: orgId,
    p_year: year,
    p_datebase: dateBase,
    p_pdv: pdvArg(pdv),
  })
}

export interface BaseYearRow {
  year: number
  qtd: number
  gmv: number
}

export async function biBaseSummary(orgId: string): Promise<BaseYearRow[]> {
  return rpc<BaseYearRow[]>('bi_base_summary', { p_org: orgId })
}

export interface BaseTotals {
  qtd: number
  eventos: number
  gmv: number
}

export async function biBaseTotals(orgId: string): Promise<BaseTotals> {
  const rows = await rpc<BaseTotals[]>('bi_base_totals', { p_org: orgId })
  return rows[0] ?? { qtd: 0, eventos: 0, gmv: 0 }
}

export async function refreshRollup(): Promise<void> {
  await rpc<null>('refresh_sales_rollup', {})
}

/** Recomputa o rollup só para os códigos informados (incremental, em lote). */
export async function refreshRollupCodigos(
  orgId: string,
  codigos: string[],
): Promise<void> {
  if (codigos.length === 0) return
  await rpc<null>('refresh_rollup_codigos', { p_org: orgId, p_codigos: codigos })
}

/** Remove o rollup de um ano (ao apagar os dados desse ano). */
export async function pruneRollupYear(
  orgId: string,
  year: number,
): Promise<void> {
  await rpc<null>('prune_rollup_year', { p_org: orgId, p_year: year })
}

/**
 * Apaga todas as vendas de um ano (no servidor, em lotes, sem timeout) e já
 * remove o rollup do ano. Retorna a quantidade aproximada de vendas removidas.
 */
export async function deleteSalesYear(
  orgId: string,
  year: number,
): Promise<number> {
  return rpc<number>('delete_sales_year', { p_org: orgId, p_year: year })
}

/** Limpa todo o rollup da org (modo replace). */
export async function clearRollup(orgId: string): Promise<void> {
  await rpc<null>('clear_rollup', { p_org: orgId })
}

/** Reconecta vendas órfãs (event_id null) aos eventos. Retorna qtd vinculada. */
export async function backfillEventLinks(orgId: string): Promise<number> {
  return rpc<number>('backfill_event_links', { p_org: orgId })
}

// --- Meios de pagamento ---

export async function refreshPaymentsRollup(): Promise<void> {
  await rpc<null>('refresh_payments_rollup', {})
}

export async function biPaymentYears(orgId: string): Promise<number[]> {
  return rpc<number[]>('bi_payment_years', { p_org: orgId })
}

export type PaymentDim = 'forma' | 'operadora' | 'parcelas'
export type PaymentJuros = 'all' | 'com' | 'sem'

export interface PaymentGroupRow extends MetricSums {
  key: string | null
  qtd: number
}

export async function biPaymentsGroup(
  orgId: string,
  year: number,
  pdv: Pdv[],
  dim: PaymentDim,
  juros: PaymentJuros = 'all',
): Promise<PaymentGroupRow[]> {
  return rpc<PaymentGroupRow[]>('bi_payments_group', {
    p_org: orgId,
    p_year: year,
    p_pdv: pdv.length > 0 ? pdv : null,
    p_dim: dim,
    p_juros: juros,
  })
}

export interface RecurringYtdRow {
  familia: string
  total_prev: number
  ytd_prev: number
  ytd_cur: number
  abertura_prev: number | null
  evento_mes_cur: number | null
}

/** Comparativo YTD por família (eventos recorrentes), por data de venda. */
export async function biRecurringYtd(
  orgId: string,
  year: number,
  pdv: Pdv[],
  monthMax: number | null,
): Promise<RecurringYtdRow[]> {
  return rpc<RecurringYtdRow[]>('bi_recurring_ytd', {
    p_org: orgId,
    p_year: year,
    p_pdv: pdvArg(pdv),
    p_month_max: monthMax,
  })
}
