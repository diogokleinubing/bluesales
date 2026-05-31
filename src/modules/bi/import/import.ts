import { supabase } from '@/lib/supabase'
import type { EventRow, SaleRow } from '@/lib/database.types'
import { backfillEventLinks } from '../lib/rpc'
import {
  parseCodigo,
  parseEventDate,
  parseNumber,
  parsePdv,
  parseSaleDate,
} from './parse'
import type {
  ColumnMap,
  EventField,
  ImportMode,
  ImportProgress,
  SaleField,
  SheetData,
} from './types'

const CHUNK = 500

type EventInsert = Omit<EventRow, 'id' | 'created_at' | 'segmento'> & {
  segmento?: string | null
}
type SaleInsert = Omit<SaleRow, 'id' | 'gmv' | 'receita_bt' | 'receita_liq'>

export interface EventSheetInput {
  sheet: SheetData
  map: ColumnMap<EventField>
}
export interface SaleSheetInput {
  sheet: SheetData
  map: ColumnMap<SaleField>
}

export interface BuildResult {
  events: EventInsert[]
  sales: SaleInsert[]
  years: number[]
  skippedSales: number
  hasEvents: boolean
  hasSales: boolean
}

function cell(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : null
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

/**
 * Transforma as planilhas (uma ou várias, de eventos e/ou vendas) em registros.
 * Eventos e vendas podem vir separados; qualquer combinação é válida.
 */
export function buildRecords(
  orgId: string,
  eventSheets: EventSheetInput[],
  saleSheets: SaleSheetInput[],
): BuildResult {
  // Eventos — dedup por codigo_evento (último vence), de todas as planilhas.
  const eventsByCodigo = new Map<string, EventInsert>()
  for (const { sheet, map } of eventSheets) {
    for (const row of sheet.rows) {
      const codigo = parseCodigo(cell(row, map.codigo_evento))
      if (!codigo) continue
      eventsByCodigo.set(codigo, {
        org_id: orgId,
        codigo_evento: codigo,
        organizador: strOrNull(cell(row, map.organizador)),
        nome: strOrNull(cell(row, map.nome)),
        local: strOrNull(cell(row, map.local)),
        data_evento: parseEventDate(cell(row, map.data_evento)),
        cidade: strOrNull(cell(row, map.cidade)),
        uf: strOrNull(cell(row, map.uf)),
        segmento: null,
      })
    }
  }

  // Vendas — de todas as planilhas de vendas.
  const sales: SaleInsert[] = []
  const years = new Set<number>()
  let skippedSales = 0
  for (const { sheet, map } of saleSheets) {
    for (const row of sheet.rows) {
      const codigo = parseCodigo(cell(row, map.codigo_evento))
      if (!codigo) {
        skippedSales++
        continue
      }
      const dataVenda = parseSaleDate(cell(row, map.data_venda))
      if (dataVenda) years.add(new Date(dataVenda).getFullYear())
      sales.push({
        org_id: orgId,
        event_id: null,
        codigo_evento: codigo,
        data_venda: dataVenda,
        tipo_pdv: parsePdv(cell(row, map.tipo_pdv)),
        valor_ingressos: parseNumber(cell(row, map.valor_ingressos)),
        valor_conveniencia: parseNumber(cell(row, map.valor_conveniencia)),
        comissao_site: parseNumber(cell(row, map.comissao_site)),
        valor_juros: parseNumber(cell(row, map.valor_juros)),
        rebate: parseNumber(cell(row, map.rebate)),
        mdr: parseNumber(cell(row, map.mdr)),
        receita_intermediacao: parseNumber(cell(row, map.receita_intermediacao)),
        import_batch_id: null,
      })
    }
  }

  return {
    events: [...eventsByCodigo.values()],
    sales,
    years: [...years].sort(),
    skippedSales,
    hasEvents: eventSheets.length > 0,
    hasSales: saleSheets.length > 0,
  }
}

export interface RunImportArgs {
  orgId: string
  fileName: string
  build: BuildResult
  mode: ImportMode
  onProgress?: (p: ImportProgress) => void
}

export interface RunImportResult {
  batchId: string
  eventsUpserted: number
  salesInserted: number
  /** Vendas desta importação sem evento correspondente na base (event_id null). */
  orphanSales: number
  /** Vendas órfãs ANTERIORES reconectadas pelos eventos desta importação. */
  backfilled: number
  hadEvents: boolean
}

/** Aplica a importação no Supabase com vínculo resiliente evento<->venda. */
export async function runImport({
  orgId,
  fileName,
  build,
  mode,
  onProgress,
}: RunImportArgs): Promise<RunImportResult> {
  const { events, sales, years } = build

  // 1) Limpeza conforme o modo
  onProgress?.({ phase: 'Preparando base', current: 0, total: 1 })
  if (mode === 'replace') {
    await supabase.from('sales').delete().eq('org_id', orgId)
    await supabase.from('events').delete().eq('org_id', orgId)
  } else if (build.hasSales) {
    // merge: remove apenas as vendas dos anos presentes nos dados importados
    for (const y of years) {
      await supabase
        .from('sales')
        .delete()
        .eq('org_id', orgId)
        .gte('data_venda', `${y}-01-01`)
        .lt('data_venda', `${y + 1}-01-01`)
    }
  }
  onProgress?.({ phase: 'Preparando base', current: 1, total: 1 })

  // 2) Upsert de eventos (em chunks), por (org_id, codigo_evento)
  for (let i = 0; i < events.length; i += CHUNK) {
    const slice = events.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('events')
      .upsert(slice, { onConflict: 'org_id,codigo_evento' })
    if (error) throw new Error(`Erro ao gravar eventos: ${error.message}`)
    onProgress?.({
      phase: 'Gravando eventos',
      current: Math.min(i + CHUNK, events.length),
      total: events.length,
    })
  }

  // 3) Backfill: reconecta vendas órfãs anteriores aos eventos agora disponíveis.
  let backfilled = 0
  if (build.hasEvents) {
    backfilled = await backfillEventLinks(orgId)
  }

  // 4) Mapa codigo_evento -> event_id (para vincular as vendas desta importação)
  const codeToId = build.hasSales ? await fetchEventIdMap(orgId) : new Map()

  // 5) Cria o registro do lote
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({
      org_id: orgId,
      file_name: fileName,
      rows_imported: sales.length,
      years,
    })
    .select('id')
    .single()
  if (batchErr || !batch)
    throw new Error(`Erro ao registrar lote: ${batchErr?.message}`)
  const batchId = batch.id as string

  // 6) Insert de vendas (em chunks). Sem evento -> event_id null (órfã).
  let orphanSales = 0
  for (let i = 0; i < sales.length; i += CHUNK) {
    const slice = sales.slice(i, i + CHUNK).map((s) => {
      const eventId = codeToId.get(s.codigo_evento) ?? null
      if (!eventId) orphanSales++
      return { ...s, event_id: eventId, import_batch_id: batchId }
    })
    const { error } = await supabase.from('sales').insert(slice)
    if (error) throw new Error(`Erro ao gravar vendas: ${error.message}`)
    onProgress?.({
      phase: 'Gravando vendas',
      current: Math.min(i + CHUNK, sales.length),
      total: sales.length,
    })
  }

  return {
    batchId,
    eventsUpserted: events.length,
    salesInserted: sales.length,
    orphanSales,
    backfilled,
    hadEvents: build.hasEvents,
  }
}

/** Busca todos os pares (codigo_evento -> id) paginando além do limite de 1000. */
async function fetchEventIdMap(orgId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('id, codigo_evento')
      .eq('org_id', orgId)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Erro ao mapear eventos: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) map.set(r.codigo_evento as string, r.id as string)
    if (data.length < pageSize) break
    from += pageSize
  }
  return map
}
