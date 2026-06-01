import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Nível de garantia de autenticação (MFA). aal2 = 2FA verificado. */
type Aal = 'aal1' | 'aal2' | null

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  /** Usuário já tem um fator TOTP verificado cadastrado? */
  hasMfa: boolean
  /** A sessão atual já passou pelo 2FA (aal2)? */
  mfaSatisfied: boolean
  /** Precisa cadastrar 2FA (logado, sem fator) — força enrolamento. */
  needsMfaEnroll: boolean
  /** Precisa inserir o código 2FA (tem fator, sessão em aal1). */
  needsMfaChallenge: boolean
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshMfa: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasMfa, setHasMfa] = useState(false)
  const [aal, setAal] = useState<Aal>(null)

  const refreshMfa = useCallback(async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = (factors?.totp ?? []).some((f) => f.status === 'verified')
    setHasMfa(verified)
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setAal((aalData?.currentLevel as Aal) ?? null)
  }, [])

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setIsAdmin(false)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', uid)
      .maybeSingle()
    setIsAdmin(!!data?.is_admin)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) {
        await Promise.all([
          loadProfile(data.session.user.id),
          refreshMfa(),
        ])
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadProfile(newSession.user.id)
        refreshMfa()
      } else {
        setIsAdmin(false)
        setHasMfa(false)
        setAal(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile, refreshMfa])

  const mfaSatisfied = aal === 'aal2'
  const needsMfaEnroll = !!session && !hasMfa
  const needsMfaChallenge = !!session && hasMfa && aal === 'aal1'

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAdmin,
      hasMfa,
      mfaSatisfied,
      needsMfaEnroll,
      needsMfaChallenge,
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error: error?.message ?? null }
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
      refreshMfa,
    }),
    [
      session,
      loading,
      isAdmin,
      hasMfa,
      mfaSatisfied,
      needsMfaEnroll,
      needsMfaChallenge,
      refreshMfa,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
