import type { CrmProfile } from '../hooks/useProfile'

/** Gestor vê e edita tudo. */
export function canViewAll(profile: CrmProfile | null | undefined): boolean {
  return profile?.role === 'gestor'
}

/**
 * Pode editar um recurso? Gestor sempre; comercial só se for o dono
 * (owner_id / author_id igual ao seu id).
 */
export function canEdit(
  profile: CrmProfile | null | undefined,
  ownerId?: string | null,
): boolean {
  if (!profile) return false
  if (profile.role === 'gestor') return true
  return !!ownerId && ownerId === profile.id
}

export const PERMISSION_DENIED_MSG =
  'Você não tem permissão para editar este item.'
