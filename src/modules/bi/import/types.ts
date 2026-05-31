// Definições de campos esperados e tipos do fluxo de importação.

export type EventField =
  | 'codigo_evento'
  | 'organizador'
  | 'nome'
  | 'local'
  | 'data_evento'
  | 'cidade'
  | 'uf'

export type SaleField =
  | 'codigo_evento'
  | 'data_venda'
  | 'tipo_pdv'
  | 'valor_ingressos'
  | 'valor_conveniencia'
  | 'comissao_site'
  | 'valor_juros'
  | 'rebate'
  | 'mdr'
  | 'receita_intermediacao'

export interface FieldDef<F extends string> {
  field: F
  label: string
  required: boolean
  /** Sinônimos (normalizados) para auto-detecção do cabeçalho. */
  aliases: string[]
}

export const EVENT_FIELDS: FieldDef<EventField>[] = [
  { field: 'codigo_evento', label: 'Código do evento', required: true, aliases: ['codigo_evento', 'codigoevento', 'codigo', 'cod_evento', 'id_evento'] },
  { field: 'organizador', label: 'Organizador', required: false, aliases: ['organizador', 'produtor', 'cliente'] },
  { field: 'nome', label: 'Nome do evento', required: false, aliases: ['evento', 'nome', 'nome_evento', 'nomeevento'] },
  { field: 'local', label: 'Local', required: false, aliases: ['local', 'casa', 'venue', 'espaco'] },
  { field: 'data_evento', label: 'Data do evento', required: false, aliases: ['data_evento', 'dataevento', 'data', 'mes', 'mes_evento', 'competencia'] },
  { field: 'cidade', label: 'Cidade', required: false, aliases: ['cidade_evento', 'cidade', 'cidadeevento', 'municipio'] },
  { field: 'uf', label: 'UF', required: false, aliases: ['uf_evento', 'uf', 'estado', 'ufevento'] },
]

export const SALE_FIELDS: FieldDef<SaleField>[] = [
  { field: 'codigo_evento', label: 'Código do evento', required: true, aliases: ['codigo_evento', 'codigoevento', 'codigo', 'cod_evento', 'id_evento'] },
  { field: 'data_venda', label: 'Data da venda', required: false, aliases: ['data_venda', 'datavenda', 'data_hora', 'datahora', 'data_compra', 'competencia', 'data'] },
  { field: 'tipo_pdv', label: 'Tipo PDV', required: false, aliases: ['tipo_pdv', 'tipopdv', 'pdv', 'canal', 'tipo'] },
  { field: 'valor_ingressos', label: 'Valor ingressos', required: false, aliases: ['valor_ingressos', 'valoringressos', 'ingressos', 'valor_ingresso', 'face'] },
  { field: 'valor_conveniencia', label: 'Valor conveniência', required: false, aliases: ['valor_conveniencia', 'conveniencia', 'taxa', 'taxa_conveniencia'] },
  { field: 'comissao_site', label: 'Comissão site', required: false, aliases: ['comissao_site', 'comissaosite', 'comissao'] },
  { field: 'valor_juros', label: 'Valor juros', required: false, aliases: ['valor_juros', 'juros'] },
  { field: 'rebate', label: 'Rebate', required: false, aliases: ['rebate'] },
  { field: 'mdr', label: 'MDR', required: false, aliases: ['mdr'] },
  { field: 'receita_intermediacao', label: 'Receita intermediação', required: false, aliases: ['receita_intermediacao', 'intermediacao', 'receita_interm'] },
]

/** Mapeamento campo -> índice da coluna na planilha (-1 = não mapeado). */
export type ColumnMap<F extends string> = Record<F, number>

export interface SheetData {
  name: string
  headers: string[]
  rows: unknown[][]
}

export interface ParsedWorkbook {
  fileName: string
  sheets: SheetData[]
}

export type ImportMode = 'merge' | 'replace'

export interface ImportProgress {
  phase: string
  current: number
  total: number
}
