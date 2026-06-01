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

function isCsv(file: File): boolean {
  return (
    /\.csv$/i.test(file.name) ||
    file.type === 'text/csv' ||
    file.type === 'application/csv'
  )
}

/**
 * Lê um arquivo Excel (.xlsx) OU CSV no browser e devolve as planilhas como
 * matrizes (cabeçalho + linhas).
 *
 * - XLSX: via SheetJS com cellDates:true (datas viram Date nativo) e raw:true.
 * - CSV: parse próprio (UTF-8, delimitador auto, aspas), mantendo as células
 *   como STRING. Assim valores BR como "120,5" não são corrompidos pelo
 *   SheetJS (que interpretaria a vírgula como milhar) e os parsers de
 *   data/numero cuidam da tipagem.
 */
export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  if (isCsv(file)) {
    const text = await file.text()
    const matrix = parseCsv(text)
    const headerRow = matrix[0] ?? []
    const headers = headerRow.map((h) => (h == null ? '' : String(h).trim()))
    const rows = matrix.slice(1)
    const name = file.name.replace(/\.[^.]+$/, '') || 'CSV'
    return { fileName: file.name, sheets: [{ name, headers, rows }] }
  }

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

/** Detecta o delimitador mais provável a partir da primeira linha não vazia. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const candidates = [';', ',', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

/**
 * Parser de CSV simples e robusto: detecta o delimitador, trata aspas duplas
 * (incl. aspas escapadas "" e delimitadores/quebras dentro de aspas) e remove
 * BOM. Devolve uma matriz de strings (células vazias -> null).
 */
export function parseCsv(input: string): (string | null)[][] {
  const text = input.replace(/^﻿/, '')
  const delim = detectDelimiter(text)
  const rows: (string | null)[][] = []
  let row: (string | null)[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field.length ? field : null)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // ignora linhas totalmente vazias
    if (!(row.length === 1 && row[0] === null)) rows.push(row)
    row = []
  }

  // True logo após o delimitador/início de linha — ou seja, no começo do campo.
  let atFieldStart = true

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        // "" = aspa escapada; senão, fecha o campo quoted.
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    // Aspas só abrem campo quoted no INÍCIO do campo. Aspas soltas no meio/fim
    // (CSV mal-formado) são tratadas como texto literal — evita "engolir" o
    // delimitador e as próximas linhas.
    if (ch === '"' && atFieldStart) {
      inQuotes = true
      atFieldStart = false
      i++
      continue
    }
    if (ch === delim) {
      pushField()
      atFieldStart = true
      i++
      continue
    }
    if (ch === '\n') {
      pushRow()
      atFieldStart = true
      i++
      continue
    }
    if (ch === '\r') {
      // \r ou \r\n
      pushRow()
      atFieldStart = true
      if (text[i + 1] === '\n') i++
      i++
      continue
    }
    field += ch
    atFieldStart = false
    i++
  }
  // último campo/linha
  if (field.length > 0 || row.length > 0) pushRow()
  return rows
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

/**
 * Auto-mapeia colunas -> campos por sinônimo. -1 = não encontrado.
 * Duas fases para os aliases específicos vencerem os genéricos:
 *  1) match exato + aliases com 2+ tokens (ex.: "data_venda", "data do evento");
 *  2) fallback de aliases de 1 token (ex.: "data") só para campos ainda livres.
 * Assim "Data do Evento" não é roubada por um alias genérico "data".
 */
export function autoMap<F extends string>(
  headers: string[],
  defs: FieldDef<F>[],
): ColumnMap<F> {
  const normHeaders = headers.map(normalizeHeader)
  const headerTokens = headers.map(tokenize)
  const used = new Set<number>()
  const map = {} as ColumnMap<F>
  for (const def of defs) map[def.field] = -1

  const assign = (field: F, idx: number) => {
    map[field] = idx
    used.add(idx)
  }

  // Fase 1: exato + aliases específicos (>= 2 tokens)
  for (const def of defs) {
    let idx = -1
    for (const alias of def.aliases) {
      const found = normHeaders.indexOf(alias)
      if (found >= 0 && !used.has(found)) {
        idx = found
        break
      }
    }
    if (idx < 0) {
      idx = headerTokens.findIndex((ht, i) => {
        if (used.has(i)) return false
        return def.aliases.some((alias) => {
          const at = tokenize(alias)
          return at.length >= 2 && at.every((t) => ht.includes(t))
        })
      })
    }
    if (idx >= 0) assign(def.field, idx)
  }

  // Fase 2: fallback de aliases de 1 token, só para campos ainda não mapeados
  for (const def of defs) {
    if (map[def.field] >= 0) continue
    const idx = headerTokens.findIndex((ht, i) => {
      if (used.has(i)) return false
      return def.aliases.some((alias) => {
        const at = tokenize(alias)
        return at.length === 1 && ht.includes(at[0])
      })
    })
    if (idx >= 0) assign(def.field, idx)
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

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Constrói a data em UTC (e não local) para preservar o dia/mês de calendário.
 * Sem isso, "30/04 23:10" numa máquina em -03 viraria "01/05" ao serializar,
 * jogando a venda no mês errado.
 */
function makeDate(
  y: number,
  mon: number,
  day: number,
  hh?: string,
  mi?: string,
  ss?: string,
): Date | null {
  const ts = Date.UTC(
    y,
    mon - 1,
    day,
    Number(hh ?? 0),
    Number(mi ?? 0),
    Number(ss ?? 0),
  )
  return Number.isNaN(ts) ? null : new Date(ts)
}

/**
 * Parseia uma data em string nos formatos usados:
 * - ISO ANO-primeiro com traço/ponto: `YYYY-MM-DD` ou `YY-MM-DD` (+ hora opcional).
 *   Ano de 2 dígitos vira 20YY (ex.: "26-05-15" -> 2026-05-15).
 * - BR DIA-primeiro com barra: `DD/MM/AAAA` (+ hora opcional).
 * - Fallback: new Date(s).
 * O separador desambigua: traço/ponto = ano primeiro; barra = dia primeiro.
 */
export function parseDateString(input: string): Date | null {
  const s = input.trim()
  if (!s) return null

  // ISO ano-primeiro (traço ou ponto): [YY]YY-MM-DD [HH:MM[:SS]]
  let m = s.match(
    /^(\d{2,4})[-.](\d{1,2})[-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (m) {
    let y = Number(m[1])
    if (m[1].length <= 2) y += 2000
    return makeDate(y, Number(m[2]), Number(m[3]), m[4], m[5], m[6])
  }

  // BR dia-primeiro (barra): DD/MM/[YY]YY [HH:MM[:SS]]
  m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (m) {
    let y = Number(m[3])
    if (m[3].length <= 2) y += 2000
    return makeDate(y, Number(m[2]), Number(m[1]), m[4], m[5], m[6])
  }

  // Competência MM/AAAA (mês/ano) -> dia 1. Ex.: "05/2026".
  m = s.match(/^(\d{1,2})\/(\d{4})$/)
  if (m) return makeDate(Number(m[2]), Number(m[1]), 1)

  // Ano-mês AAAA-MM ou YY-MM (sem dia) -> dia 1.
  m = s.match(/^(\d{2,4})[-.](\d{1,2})$/)
  if (m) {
    let y = Number(m[1])
    if (m[1].length <= 2) y += 2000
    return makeDate(y, Number(m[2]), 1)
  }

  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Data do evento -> "YYYY-MM-01". Aceita ano-mês, data completa, Date. */
export function parseEventDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) || value.getFullYear() < 2000) return null
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-01`
  }
  const s = String(value).trim()
  // Ano-mês sem dia: YYYY-MM ou YY-MM
  let m = s.match(/^(\d{2,4})[-/.](\d{1,2})$/)
  if (m) {
    let y = Number(m[1])
    if (m[1].length <= 2) y += 2000
    return `${y}-${pad2(Number(m[2]))}-01`
  }
  // MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[2]}-${pad2(Number(m[1]))}-01`
  // Data completa em qualquer formato suportado (UTC para preservar o mês)
  const d = parseDateString(s)
  if (d && d.getUTCFullYear() >= 2000) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`
  }
  return null
}

/** Datetime de venda. Descarta anos < 2000 (corrompidos em 1900). */
export function parseSaleDate(value: unknown): string | null {
  if (value == null || value === '') return null
  let d: Date | null = null
  if (value instanceof Date) {
    // Reconstrói em UTC a partir dos componentes locais (preserva dia/mês).
    d = Number.isNaN(value.getTime())
      ? null
      : makeDate(
          value.getFullYear(),
          value.getMonth() + 1,
          value.getDate(),
          String(value.getHours()),
          String(value.getMinutes()),
          String(value.getSeconds()),
        )
  } else if (typeof value === 'number') {
    // fallback: serial Excel (caso cellDates não tenha convertido)
    d = XLSX.SSF ? excelSerialToDate(value) : null
  } else {
    d = parseDateString(String(value))
  }
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return null
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

/**
 * Normaliza a forma de pagamento para o código canônico:
 * CC = Cartão de Crédito, PIX = Pix, CD = Cartão de Débito, BB = Boleto Bancário.
 * Aceita os próprios códigos ou descrições por extenso. null se desconhecido.
 */
export function parseFormaPagamento(value: unknown): string | null {
  if (value == null || value === '') return null
  const s = String(value).trim().toLowerCase()
  if (!s) return null
  if (s === 'cc') return 'CC'
  if (s === 'cd') return 'CD'
  if (s === 'pix') return 'PIX'
  if (s === 'bb') return 'BB'
  if (s.includes('pix')) return 'PIX'
  if (s.includes('debito') || s.includes('débito') || s.includes('debit'))
    return 'CD'
  if (s.includes('credito') || s.includes('crédito') || s.includes('credit'))
    return 'CC'
  if (s.includes('boleto') || s.includes('bancario') || s.includes('bancário'))
    return 'BB'
  return null
}

/** Número de parcelas (>=1). null se vazio/inválido. */
export function parseParcelas(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Math.trunc(Number(String(value).replace(/\D/g, '')))
  return Number.isFinite(n) && n > 0 ? n : null
}
