// Evento normalizado que TODO scraper deve retornar. O orquestrador cuida de
// filtrar (online/gratuito/regras) e persistir — o scraper só mapeia a fonte.
export interface RawEvent {
  url_evento: string // chave de dedupe — obrigatória
  nome: string
  data_inicio?: string | null // ISO
  data_fim?: string | null
  organizador_raw?: string | null
  organizador_url?: string | null
  local_raw?: string | null
  cidade?: string | null
  uf?: string | null
  preco_min?: number | null
  preco_max?: number | null
  gratuito?: boolean
  online?: boolean
  categoria?: string | null
  imagem_url?: string | null
  descricao?: string | null
  raw?: unknown // payload bruto da fonte (para auditoria)
}

export interface ScrapeContext {
  cidade: string
  uf: string
  janelaDias: number
}

// Assinatura de um scraper de fonte.
export type Scraper = (ctx: ScrapeContext) => Promise<RawEvent[]>
