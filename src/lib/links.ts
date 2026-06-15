/** URL absoluta de um site: adiciona https:// quando falta o esquema. Null se vazio. */
export function siteUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

/**
 * URL do Instagram a partir de: link completo (com ou sem https), "@perfil"
 * ou só o nome do perfil. Monta sempre https://instagram.com/<perfil>.
 */
export function instagramUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  if (/instagram\.com/i.test(s)) return /^https?:\/\//i.test(s) ? s : `https://${s}`
  const handle = s.replace(/^@+/, '').replace(/^\/+|\/+$/g, '').trim()
  return handle ? `https://instagram.com/${handle}` : null
}
