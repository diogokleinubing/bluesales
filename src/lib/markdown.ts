import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

/**
 * Converte markdown em HTML sanitizado (seguro para injetar via
 * dangerouslySetInnerHTML). Usado na landing pública de conteúdo e no preview do
 * editor de matérias. Roda no browser (DOMPurify usa o DOM).
 */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) return ''
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] })
}
