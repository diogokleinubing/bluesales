/** Paleta de cores para avatares (também oferecida na configuração do usuário). */
export const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#64748b',
]

/** Iniciais do nome + sobrenome (1ª e 2ª palavras) para o avatar. */
export function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Cor derivada do nome (fallback quando o usuário não definiu uma). */
export function corDoNome(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
