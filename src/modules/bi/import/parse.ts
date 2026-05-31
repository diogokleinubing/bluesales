import * as XLSX from 'xlsx'
import {
  EVENT_FIELDS,
  SALE_FIELDS,
  type ColumnMap,
  type EventField,
  type FieldDef,
  type ParsedWorkbook,
  type SaleField,
  type SheetData,
} from './types'
import { tokenize } from './detect'
import type { TipoPdv } from '@/lib/database.types'

// ----------------------------------------------------------------------------
// Leitura do arquivo
// ----------------------------------------------------------------------------

/**
 * Lê o .xlsx no browser. IMPORTANTE: cellDates:true para receber Date nativo
 * nas datas (e não o serial do Excel). O sheet_to_json usa raw:true para não
 * receber strings localizadas tipo "Jan-26" que quebram o parsing.
 */
export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })

  const sheets: SheetData[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      blankrows: false,
      defval: null,
    })
    const headerRow = (matrix[0] ?? []) as unknown[]
    const headers = headerRow.map((h) => (h == null ? '' : String(h).trim()))
    const rows = matrix.slice(1) as unknown[][]
    return { name, headers, rows }
  })

  return { fileName: file.name, sheets }
}

// ----------------------------------------------------------------------------
// Detecção de abas e colunas
// ----------------------------------------------------------------------------

export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

/** Heurística para identificar a aba de eventos / vendas pelo nome. */
export function detectSheet(
  sheets: SheetData[],
  kind: 'eventos' | 'vendas',
): string | null {
  const needles =
    kind === 'eventos'
      ? ['evento', 'event']
      : ['venda', 'vendas', 'sale', 'transac']
  const found = sheets.find((s) => {
    const n = normalizeHeader(s.name)
    return needles.some((k) => n.includes(k))
  })
  return found?.name ?? null
}

/** Auto-mapeia colunas -> campos por sinônimo. -1 = não encontrado. */
export function autoMap<F extends string>(
  headers: string[],
  defs: FieldDef<F>[],
): ColumnMap<F> {
  const normHeaders = headers.map(normalizeHeader)
  const headerTokens = headers.map(tokenize)
  const used = new Set<number>()
  const map = {} as ColumnMap<F>
  for (const def of defs) {
    let idx = -1
    // 1) match exato por alias (forma normalizada)
    for (const alias of def.aliases) {
      const found = normHeaders.indexOf(alias)
      if (found >= 0 && !used.has(found)) {
        idx = found
        break
      }
    }
    // 2) match por subconjunto de tokens (tolera "Código do Evento" etc.)
    if (idx < 0) {
      idx = headerTokens.findIndex((ht, i) => {
        if (used.has(i)) return false
        return def.aliases.some((alias) => {
          const at = tokenize(alias)
          return at.length > 0 && at.every((t) => ht.includes(t))
        })
      })
    }
    if (idx >= 0) used.add(idx)
    map[def.field] = idx
  }
  return map
}

export function autoMapEvents(headers: string[]): ColumnMap<EventField> {
  return autoMap(headers, EVENT_FIELDS)
}
export function autoMapSales(headers: string[]): ColumnMap<SaleField> {
  return autoMap(headers, SALE_FIELDS)
}

/** "Impressão digital" do conjunto de colunas, para cachear o mapeamento. */
export function columnsFingerprint(headers: string[]): string {
  return headers.map(normalizeHeader).filter(Boolean).sort().join('|')
}

// ----------------------------------------------------------------------------
// Limpeza / conversão de valores
// ----------------------------------------------------------------------------

/** "YYYY-MM" (ou Date) -> "YYYY-MM-01". Retorna null se inválido. */
export function parseEventDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) || value.getFullYear() < 2000) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  const s = String(value).trim()
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/)
  if (m) {
    const month = String(Number(m[2])).padStart(2, '0')
    return `${m[1]}-${month}-01`
  }
  return null
}

/** Datetime de venda. Descarta anos < 2000 (corrompidos em 1900). */
export function parseSaleDate(value: unknown): string | null {
  if (value == null || value === '') return null
  let d: Date | null = null
  if (value instanceof Date) {
    d = value
  } else if (typeof value === 'number') {
    // fallback: serial Excel (caso cellDates não tenha convertido)
    d = XLSX.SSF ? excelSerialToDate(value) : null
  } else {
    const parsed = new Date(String(value))
    d = Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (!d || Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null
  return d.toISOString()
}

function excelSerialToDate(serial: number): Date {
  // Excel epoch (com o bug do ano bissexto de 1900)
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const frac = serial - Math.floor(serial)
  const ms = Math.round(frac * 86400) * 1000
  return new Date(utcValue * 1000 + ms)
}

/** Normaliza tipo de PDV para E/D/I; valores inválidos -> null. */
export function parsePdv(value: unknown): TipoPdv | null {
  if (value == null) return null
  if (value instanceof Date) return null
  const s = String(value).trim().toUpperCase()
  if (s === 'E' || s === 'D' || s === 'I') return s as TipoPdv
  return null
}

/** Código do evento sempre como string normalizada. */
export function parseCodigo(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return String(Math.trunc(value))
  const s = String(value).trim()
  return s.length ? s : null
}

/** Converte para número, tolerando vírgula decimal e símbolos de moeda. */
export function parseNumber(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const s = String(value)
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // separador de milhar
    .replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
