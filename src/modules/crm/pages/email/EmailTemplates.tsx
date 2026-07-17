import { Navigate } from 'react-router-dom'

// A galeria de templates foi movida para a tela de Conteúdo (aba Templates).
// Mantido como redirect para links/bookmarks antigos.
export function EmailTemplates() {
  return <Navigate to="/comercial/email/conteudo?tab=templates" replace />
}
