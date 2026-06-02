import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

/** Restringe o acesso a um perfil. Quem não tem é redirecionado para a home. */
export function RoleRoute({
  role,
  children,
}: {
  role: 'admin' | 'gestor'
  children: React.ReactNode
}) {
  const { isAdmin, isGestor, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    )
  }
  const allowed = role === 'admin' ? isAdmin : isGestor
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Só admin acessa. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute role="admin">{children}</RoleRoute>
}
