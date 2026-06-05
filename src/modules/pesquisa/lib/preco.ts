import { fmtBRL } from '@/lib/format'

/** Formata uma faixa de preço (min–max) em R$. */
export function faixaPreco(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null && min !== max) return `${fmtBRL(min)} – ${fmtBRL(max)}`
  return fmtBRL(min ?? max)
}

/** Formata uma taxa percentual (ex.: 12.5 -> "12,5%"). */
export function fmtTaxa(taxa: number | null): string {
  if (taxa == null) return '—'
  return `${taxa.toFixed(1).replace('.', ',')}%`
}
