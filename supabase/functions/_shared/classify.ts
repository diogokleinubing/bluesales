// Porte Deno de normalização + filtro de ignorar (espelha src/lib/classify.ts).
// Mantenha em sincronia com a versão do frontend.

export function norm(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_\s]+/g, ' ')
    .trim()
}

/**
 * Decodifica escapes de strings vindas de JSON/JS embutido no HTML:
 * `\uXXXX` (inclui pares surrogate) e `\/`. Ex.: "PRODUÇÕES" -> "PRODUÇÕES".
 */
export function decodeEscapes(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
}

/** % médio de taxa a partir de pares (preço, taxa). Null se não houver dados. */
export function avgTaxaPct(items: { price: number; tax: number }[]): number | null {
  const pcts = items
    .filter((i) => Number.isFinite(i.price) && i.price > 0 && Number.isFinite(i.tax) && i.tax >= 0)
    .map((i) => (i.tax / i.price) * 100)
  if (!pcts.length) return null
  return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
}

const PAISES_BRASIL = new Set(['bra', 'br', 'brasil', 'brazil'])

/** Normaliza país: variações de Brasil -> 'Brasil'; demais mantêm o original. */
export function normPais(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  if (PAISES_BRASIL.has(norm(raw))) return 'Brasil'
  return raw.trim()
}

export type IgnoreTipo = 'nome_evento' | 'local' | 'organizador'

export interface IgnoreRule {
  tipo: IgnoreTipo
  keyword: string
  ativo?: boolean
}

function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

function matchesKeyword(textNorm: string, kwNorm: string): boolean {
  if (!kwNorm) return false
  let from = 0
  for (;;) {
    const i = textNorm.indexOf(kwNorm, from)
    if (i < 0) return false
    const before = i === 0 ? '' : textNorm[i - 1]
    const afterIdx = i + kwNorm.length
    const after = afterIdx >= textNorm.length ? '' : textNorm[afterIdx]
    if (
      (before === '' || !isWordChar(before)) &&
      (after === '' || !isWordChar(after))
    ) {
      return true
    }
    from = i + 1
  }
}

const CAMPO_LABEL: Record<IgnoreTipo, string> = {
  nome_evento: 'nome',
  local: 'local',
  organizador: 'organizador',
}

export function shouldIgnore(
  ev: { nome?: string | null; local?: string | null; organizador?: string | null },
  rules: IgnoreRule[],
): { ignore: boolean; motivo: string | null } {
  const fields: Record<IgnoreTipo, string> = {
    nome_evento: norm(ev.nome),
    local: norm(ev.local),
    organizador: norm(ev.organizador),
  }
  for (const r of rules) {
    if (r.ativo === false) continue
    const text = fields[r.tipo]
    if (!text) continue
    if (matchesKeyword(text, norm(r.keyword))) {
      return { ignore: true, motivo: `${CAMPO_LABEL[r.tipo]} contém "${r.keyword}"` }
    }
  }
  return { ignore: false, motivo: null }
}
