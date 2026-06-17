import { supabase } from '@/lib/supabase'
import type { EventRow, SaleRow } from '@/lib/database.types'
import {
  backfillEventLinks,
  clearRollup,
  deleteSalesYear,
  pruneRollupYear,
  refreshRollupCodigos,
  refreshPaymentsRollup,
  refreshParcelamentoRollup,
} from '../lib/rpc'
import {
  parseCodigo,
  parseEventDate,
  parseFormaPagamento,
  parseOperadora,
  parseNumber,
  parseParcelas,
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

type EventInsert = Omit<
  EventRow,
  | 'id'
  | 'created_at'
  | 'organizador'
  | 'organizador_org_id'
  | 'segmento'
  | 'segmento_manual'
  | 'genero'
  | 'genero_manual'
  | 'familia'
> & {
  segmento?: string | null
  familia?: string | null
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

/** Código inteiro positivo; vazio/0/negativo -> null. */
function intOrNull(v: unknown): number | null {
  if (v == null) return null
  const d = String(v).trim().replace(/[^\d-]/g, '')
  if (!d) return null
  const n = Number(d)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
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
        codigo_organizador: intOrNull(cell(row, map.codigo_organizador)),
        nome: strOrNull(cell(row, map.nome)),
        local: strOrNull(cell(row, map.local)),
        data_evento: parseEventDate(cell(row, map.data_evento)),
        cidade: strOrNull(cell(row, map.cidade)),
        uf: strOrNull(cell(row, map.uf)),
        segmento: null,
      })
    }
  }

  // Vendas — de todas as planilhas de vendas. A data do evento NÃO vem aqui;
  // ela é importada na base de Eventos.
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
      // UTC: data_venda é ISO UTC; getFullYear (local) jogaria 01/jan no ano
      // anterior em fuso negativo, limpando o ano errado no modo merge.
      if (dataVenda) years.add(new Date(dataVenda).getUTCFullYear())
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
        forma_pagamento: parseFormaPagamento(cell(row, map.forma_pagamento)),
        parcelas: parseParcelas(cell(row, map.parcelas)),
        operadora: parseOperadora(cell(row, map.operadora)),
        import_batch_id: null,
      })
    }
  }

  const events = [...eventsByCodigo.values()]
  return {
    events,
    sales,
    years: [...years].sort(),
    skippedSales,
    hasEvents: events.length > 0,
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
    // merge: remove apenas as vendas dos anos presentes nos dados importados.
    // Via RPC no servidor (em lotes, sem timeout). Se falhar, ABORTA — antes
    // o erro era silencioso e as vendas eram reinseridas, multiplicando tudo.
    for (const y of years) {
      await deleteSalesYear(orgId, y)
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

  // 2.1) Resolve organizador_org_id (codigo_organizador -> organização).
  if (build.hasEvents) {
    const { error: rErr } = await supabase.rpc('resolve_event_organizers', { p_org: orgId })
    if (rErr) throw new Error(`Erro ao vincular organizadores: ${rErr.message}`)
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

  // 7) Manutenção incremental do rollup (escala para milhões de vendas).
  //    Só recomputa os códigos tocados — nunca o rollup inteiro.
  const touched = new Set<string>()
  for (const e of events) touched.add(e.codigo_evento)
  for (const s of sales) touched.add(s.codigo_evento)

  if (mode === 'replace') {
    await clearRollup(orgId)
  } else if (build.hasSales) {
    // merge: as vendas dos anos importados foram apagadas em todos os códigos;
    // limpa o rollup desses anos antes de recompor os códigos tocados.
    for (const y of years) await pruneRollupYear(orgId, y)
  }

  const codigos = [...touched]
  const ROLLUP_BATCH = 800
  for (let i = 0; i < codigos.length; i += ROLLUP_BATCH) {
    await refreshRollupCodigos(orgId, codigos.slice(i, i + ROLLUP_BATCH))
    onProgress?.({
      phase: 'Consolidando dados',
      current: Math.min(i + ROLLUP_BATCH, codigos.length),
      total: codigos.length,
    })
  }

  // Rollup de meios de pagamento (rebuild completo — tabela pequena por org).
  if (build.hasSales) {
    onProgress?.({ phase: 'Consolidando pagamentos', current: 0, total: 1 })
    await refreshPaymentsRollup()
    await refreshParcelamentoRollup()
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
