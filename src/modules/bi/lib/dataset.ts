import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDefaultOrg } from '@/lib/org'
import type { TipoPdv } from '@/lib/database.types'

/**
 * DECISÃO DE ARQUITETURA
 * ----------------------
 * O volume atual (~5k vendas) é pequeno, então buscamos TODAS as vendas
 * enriquecidas (join com eventos) uma única vez, cacheamos via TanStack Query
 * e fazemos todas as agregações no client (funções puras em aggregate.ts).
 * Isso simplifica os filtros combinados (ano, métrica, base de data, PDV,
 * comparativo YoY, drill-down) sem múltiplas idas ao banco.
 *
 * Se o volume crescer muito, migrar agregações pesadas para views/RPC no
 * Postgres — os consumidores (hooks de tela) já isolam isso.
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
  // Atributos do evento (podem faltar se a venda não casar com um evento)
  nome: string | null
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  data_evento: string | null
  segmento: string | null
}

const SELECT = `
  id, codigo_evento, data_venda, tipo_pdv,
  valor_ingressos, valor_conveniencia, comissao_site, valor_juros,
  rebate, mdr, receita_intermediacao, gmv, receita_bt, receita_liq,
  event:events(nome, organizador, local, cidade, uf, data_evento, segmento)
`

interface RawRow {
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
  event: {
    nome: string | null
    organizador: string | null
    local: string | null
    cidade: string | null
    uf: string | null
    data_evento: string | null
    segmento: string | null
  } | null
}

const PAGE = 1000

async function fetchAllSales(orgId: string): Promise<SaleEnriched[]> {
  const all: SaleEnriched[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('sales')
      .select(SELECT)
      .eq('org_id', orgId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as RawRow[]
    for (const r of rows) {
      all.push({
        id: r.id,
        codigo_evento: r.codigo_evento,
        data_venda: r.data_venda,
        tipo_pdv: r.tipo_pdv,
        valor_ingressos: r.valor_ingressos,
        valor_conveniencia: r.valor_conveniencia,
        comissao_site: r.comissao_site,
        valor_juros: r.valor_juros,
        rebate: r.rebate,
        mdr: r.mdr,
        receita_intermediacao: r.receita_intermediacao,
        gmv: r.gmv,
        receita_bt: r.receita_bt,
        receita_liq: r.receita_liq,
        nome: r.event?.nome ?? null,
        organizador: r.event?.organizador ?? null,
        local: r.event?.local ?? null,
        cidade: r.event?.cidade ?? null,
        uf: r.event?.uf ?? null,
        data_evento: r.event?.data_evento ?? null,
        segmento: r.event?.segmento ?? null,
      })
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

export function useDataset() {
  const org = useDefaultOrg()
  const orgId = org.data?.id
  const query = useQuery({
    enabled: !!orgId,
    queryKey: ['dataset', orgId],
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchAllSales(orgId!),
  })
  return {
    ...query,
    orgId,
    sales: query.data ?? [],
  }
}
