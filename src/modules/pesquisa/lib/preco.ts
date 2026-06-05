import { fmtBRL } from '@/lib/format'

/** Formata uma faixa de preço (min–max) em R$. */
export function faixaPreco(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null && min !== max) return `${fmtBRL(min)} – ${fmtBRL(max)}`
  return fmtBRL(min ?? max)
}

/** Acumula a faixa de preço de um evento num agregado (mutável). */
export function acumulaPreco(
  a: { precoMin: number | null; precoMax: number | null },
  e: { preco_min: number | null; preco_max: number | null },
) {
  const pmin = e.preco_min ?? e.preco_max
  const pmax = e.preco_max ?? e.preco_min
  if (pmin != null) a.precoMin = a.precoMin == null ? pmin : Math.min(a.precoMin, pmin)
  if (pmax != null) a.precoMax = a.precoMax == null ? pmax : Math.max(a.precoMax, pmax)
}
