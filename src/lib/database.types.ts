// Tipos das tabelas do Supabase (escritos à mão, espelham supabase/migrations).
// Quando o schema mudar, atualizar aqui — ou gerar via:
//   npx supabase gen types typescript --linked > src/lib/database.types.ts

export type Status = 'Ativo' | 'Risco' | 'Perdido' | 'Novo'
export type TipoPdv = 'E' | 'D' | 'I'

export interface OrgRow {
  id: string
  nome: string
  created_at: string
}

export interface EventRow {
  id: string
  org_id: string
  codigo_evento: string
  organizador: string | null
  nome: string | null
  local: string | null
  data_evento: string | null // date (YYYY-MM-DD)
  cidade: string | null
  uf: string | null
  segmento: string | null
  familia: string | null
  created_at: string
}

export interface EventFamilyOverrideRow {
  id: string
  org_id: string
  codigo_evento: string
  familia: string
}

export interface SaleRow {
  id: number
  org_id: string
  event_id: string | null
  codigo_evento: string
  data_venda: string | null // timestamptz
  tipo_pdv: TipoPdv | null
  valor_ingressos: number
  valor_conveniencia: number
  comissao_site: number
  valor_juros: number
  rebate: number
  mdr: number
  receita_intermediacao: number
  forma_pagamento: string | null
  parcelas: number | null
  operadora: string | null
  import_batch_id: string | null
  // Colunas geradas (read-only):
  gmv: number
  receita_bt: number
  receita_liq: number
}

export interface ProfileRow {
  id: string
  email: string | null
  is_admin: boolean
  created_at: string
}

export interface LoginEventRow {
  id: number
  user_id: string | null
  email: string | null
  user_agent: string | null
  created_at: string
}

export interface ImportBatchRow {
  id: string
  org_id: string
  file_name: string | null
  rows_imported: number | null
  years: number[] | null
  created_at: string
}

export interface SegmentRow {
  id: string
  org_id: string
  nome: string
}

export interface KeywordRuleRow {
  id: string
  org_id: string
  keyword: string
  segmento: string
  ordem: number
}

export interface VenueRuleRow {
  id: string
  org_id: string
  keyword: string
  segmento: string
  ordem: number
}

export interface VenueSegmentMapRow {
  id: string
  org_id: string
  local: string
  segmento: string
}

export interface EventSegmentOverrideRow {
  id: string
  org_id: string
  codigo_evento: string
  segmento: string
}

export interface ProvisioningRow {
  id: string
  org_id: string
  base_year: number
  target_year: number
  item_key: string
  nome: string | null
  status: Status
  forecast: number
  created_at: string
  updated_at: string
}
