// Formatação centralizada em pt-BR.

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** R$ 1.234,56 */
export function fmtBRL(value: number | null | undefined): string {
  return brl.format(Number(value ?? 0))
}

const brl0 = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** R$ 1.235 (sem centavos) */
export function fmtBRL0(value: number | null | undefined): string {
  return brl0.format(Number(value ?? 0))
}

/** Forma compacta: "R$ 1,2M", "R$ 340,0K", "R$ 980". */
export function fmtShort(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000)
    return `${sign}R$ ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (abs >= 1_000_000)
    return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000)
    return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')}K`
  return `${sign}R$ ${abs.toFixed(0)}`
}

/** Número inteiro com separador de milhar pt-BR. */
export function fmtInt(value: number | null | undefined): string {
  return int.format(Number(value ?? 0))
}

/** Percentual: 0.1234 -> "12,3%". `digits` controla casas decimais. */
export function fmtPct(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0) * 100
  return `${n.toFixed(digits).replace('.', ',')}%`
}

/** Variação percentual com sinal: 0.12 -> "+12,0%". */
export function fmtDelta(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0) * 100
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits).replace('.', ',')}%`
}

const monthNames = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/** "mar/2026" a partir de um índice de mês (0-11) e ano. */
export function fmtMonth(monthIndex: number, year?: number): string {
  const m = monthNames[monthIndex] ?? '?'
  return year ? `${m}/${year}` : m
}

/** Data curta pt-BR: "30/05/2026". Aceita Date, string ISO ou null. */
export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}
