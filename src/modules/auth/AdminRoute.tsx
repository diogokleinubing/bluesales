import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

/** Só admin acessa. Não-admin é redirecionado para a home. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    )
  }
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
