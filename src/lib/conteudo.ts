/** Domínio público das páginas de conteúdo (landing das matérias da newsletter). */
export const CONTEUDO_BASE_URL = 'https://conteudo.blueticket.com.br'

/** URL pública de uma matéria pelo código (usada nos links "Saiba mais" e no editor). */
export function conteudoUrl(codigo: string): string {
  return `${CONTEUDO_BASE_URL}/conteudo/${codigo}`
}

/** Extrai o código de uma URL de conteúdo (…/conteudo/<codigo>), p/ tracking de cliques. */
export function codigoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/\/conteudo\/([^/?#]+)/)
  return m ? m[1] : null
}
