import { supabase } from '@/lib/supabase'
import type { EventRow, SaleRow } from '@/lib/database.types'
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

export interface BuildResult {
  events: EventInsert[]
  sales: SaleInsert[]
  years: number[]
  skippedSales: number
}

function cell(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : null
}

/** Transforma as linhas cruas das abas em registros prontos para o banco. */
export function buildRecords(
  orgId: string,
  eventsSheet: SheetData,
  eventsMap: ColumnMap<EventField>,
  salesSheet: SheetData,
  salesMap: ColumnMap<SaleField>,
): BuildResult {
  // Eventos — dedup por codigo_evento (último vence).
  const eventsByCodigo = new Map<string, EventInsert>()
  for (const row of eventsSheet.rows) {
    const codigo = parseCodigo(cell(row, eventsMap.codigo_evento))
    if (!codigo) continue
    eventsByCodigo.set(codigo, {
      org_id: orgId,
      codigo_evento: codigo,
      organizador: strOrNull(cell(row, eventsMap.organizador)),
      nome: strOrNull(cell(row, eventsMap.nome)),
      local: strOrNull(cell(row, eventsMap.local)),
      data_evento: parseEventDate(cell(row, eventsMap.data_evento)),
      cidade: strOrNull(cell(row, eventsMap.cidade)),
      uf: strOrNull(cell(row, eventsMap.uf)),
      segmento: null,
    })
  }

  // Vendas
  const sales: SaleInsert[] = []
  const years = new Set<number>()
  let skippedSales = 0
  for (const row of salesSheet.rows) {
    const codigo = parseCodigo(cell(row, salesMap.codigo_evento))
    if (!codigo) {
      skippedSales++
      continue
    }
    const dataVenda = parseSaleDate(cell(row, salesMap.data_venda))
    if (dataVenda) years.add(new Date(dataVenda).getFullYear())
    sales.push({
      org_id: orgId,
      event_id: null,
      codigo_evento: codigo,
      data_venda: dataVenda,
      tipo_pdv: parsePdv(cell(row, salesMap.tipo_pdv)),
      valor_ingressos: parseNumber(cell(row, salesMap.valor_ingressos)),
      valor_conveniencia: parseNumber(cell(row, salesMap.valor_conveniencia)),
      comissao_site: parseNumber(cell(row, salesMap.comissao_site)),
      valor_juros: parseNumber(cell(row, salesMap.valor_juros)),
      rebate: parseNumber(cell(row, salesMap.rebate)),
      mdr: parseNumber(cell(row, salesMap.mdr)),
      receita_intermediacao: parseNumber(
        cell(row, salesMap.receita_intermediacao),
      ),
      import_batch_id: null,
    })
  }

  return {
    events: [...eventsByCodigo.values()],
    sales,
    years: [...years].sort(),
    skippedSales,
  }
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
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
}

/** Aplica a importação no Supabase (events -> sales -> import_batch). */
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
  } else {
    // merge: remove apenas as vendas dos anos presentes no arquivo
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

  // 3) Mapa codigo_evento -> event_id (para vincular as vendas)
  const codeToId = await fetchEventIdMap(orgId)

  // 4) Cria o registro do lote
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

  // 5) Insert de vendas (em chunks), com event_id e batch
  for (let i = 0; i < sales.length; i += CHUNK) {
    const slice = sales.slice(i, i + CHUNK).map((s) => ({
      ...s,
      event_id: codeToId.get(s.codigo_evento) ?? null,
      import_batch_id: batchId,
    }))
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
