import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
