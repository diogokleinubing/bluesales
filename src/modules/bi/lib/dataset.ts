import type { TipoPdv } from '@/lib/database.types'

/**
 * Tipo de uma venda enriquecida (venda + atributos do evento).
 *
 * NOTA: a partir do consolidador, NÃO buscamos mais todas as vendas no client.
 * As agregações rodam no Postgres (functions bi_* em rpc.ts) sobre a
 * materialized view sales_rollup. Este tipo permanece apenas porque algumas
 * funções utilitárias puras (aggregate/metrics/ytd/provisioning) ainda o usam
 * em testes/derivações pontuais.
 */
export interface SaleEnriched {
  id: number
  codigo_evento: string
  data_venda: string | null
  tipo_pdv: TipoPdv | null
  valor_ingressos: number
  valor_conveniencia: number
  comissao_site: number
  valor_juros: number
  rebate: number
  mdr: number
  receita_intermediacao: number
  gmv: number
  receita_bt: number
  receita_liq: number
  nome: string | null
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  data_evento: string | null
  segmento: string | null
}
