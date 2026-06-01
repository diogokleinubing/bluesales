import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { MfaGate } from './MfaGate'
import { ForcePasswordChange } from './ForcePasswordChange'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const {
    session,
    loading,
    needsMfaEnroll,
    needsMfaChallenge,
    needsPasswordChange,
  } = useAuth()
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

  // 2FA obrigatório: enrolar (novo usuário) ou desafiar (sessão aal1).
  if (needsMfaEnroll || needsMfaChallenge) {
    return <MfaGate />
  }

  // Senha resetada pelo admin: força a definição de uma nova senha.
  if (needsPasswordChange) {
    return <ForcePasswordChange />
  }

  return <>{children}</>
}
