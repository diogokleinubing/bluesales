import { NEWSLETTER_SECOES } from './newsletterProduto'

export interface TemplateDef {
  id: string
  nome: string
  descricao: string
  secoes: typeof NEWSLETTER_SECOES
}

/** Templates disponíveis para as mensagens (definidos em código). */
export const TEMPLATES: TemplateDef[] = [
  {
    id: 'newsletter-produto',
    nome: 'Newsletter de Produto',
    descricao: 'Novidades de produto e dicas de uso, com "Saiba mais" para páginas de conteúdo.',
    secoes: NEWSLETTER_SECOES,
  },
]

export function getTemplate(id: string | null | undefined): TemplateDef | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
