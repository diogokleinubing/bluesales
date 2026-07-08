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
import { MODULE_IDS, type ModuleId } from '@/modules/shared/nav'

/** Nível de garantia de autenticação (MFA). aal2 = 2FA verificado. */
type Aal = 'aal1' | 'aal2' | null

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  isGestor: boolean
  /**
   * Módulos que o usuário pode ver. `null` = todos (sem restrição).
   * Admin sempre recebe `null` (vê tudo).
   */
  allowedModules: ModuleId[] | null
  /**
   * Rotas de menu liberadas (fonte da permissão fina). `null` = sem restrição
   * de menu (cai no gate de `allowedModules`). `[]` = nenhum menu. Admin = `null`.
   */
  allowedMenus: string[] | null
  /** Usuário já tem um fator TOTP verificado cadastrado? */
  hasMfa: boolean
  /** A sessão atual já passou pelo 2FA (aal2)? */
  mfaSatisfied: boolean
  /** Precisa cadastrar 2FA (logado, sem fator) — força enrolamento. */
  needsMfaEnroll: boolean
  /** Precisa inserir o código 2FA (tem fator, sessão em aal1). */
  needsMfaChallenge: boolean
  /** Senha foi resetada pelo admin — precisa definir uma nova. */
  needsPasswordChange: boolean
  /** Recarrega o perfil (papel admin + flag de troca de senha). */
  refreshProfile: () => Promise<void>
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
  const [isGestor, setIsGestor] = useState(false)
  const [modules, setModules] = useState<string[] | null>(null)
  const [menus, setMenus] = useState<string[] | null>(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
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
      setIsGestor(false)
      setModules(null)
      setMenus(null)
      setMustChangePassword(false)
      return
    }
    // select('*') é resiliente: funciona mesmo antes de a coluna `menus` existir
    // no banco (nesse caso `menus` vem undefined → sem restrição).
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
    setIsAdmin(!!data?.is_admin)
    setIsGestor(!!data?.is_gestor)
    setModules((data?.modules as string[] | null) ?? null)
    setMenus((data?.menus as string[] | null) ?? null)
    setMustChangePassword(!!data?.must_change_password)
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
        setIsGestor(false)
        setModules(null)
        setMenus(null)
        setMustChangePassword(false)
        setHasMfa(false)
        setAal(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile, refreshMfa])

  const mfaSatisfied = aal === 'aal2'
  const needsMfaEnroll = !!session && !hasMfa
  // 2FA é SEMPRE exigido a cada nova sessão (aal1 -> desafio -> aal2), para que
  // a sessão seja aal2 e o RLS libere os dados. A "validade" é a duração da
  // sessão do Supabase (time-box), não "lembrar dispositivo".
  const needsMfaChallenge = !!session && hasMfa && aal === 'aal1'
  const needsPasswordChange = !!session && mustChangePassword

  // Admin vê tudo (null). Senão, sanea a lista do perfil contra os IDs válidos;
  // lista vazia/sem itens válidos vira null = sem restrição (vê todos).
  const allowedModules = useMemo<ModuleId[] | null>(() => {
    if (isAdmin) return null
    const valid = (modules ?? []).filter((m): m is ModuleId =>
      (MODULE_IDS as string[]).includes(m),
    )
    return valid.length ? valid : null
  }, [isAdmin, modules])

  // Menus liberados são a fonte fina da permissão. Admin vê tudo (null).
  const allowedMenus = useMemo<string[] | null>(
    () => (isAdmin ? null : menus),
    [isAdmin, menus],
  )

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session?.user?.id],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAdmin,
      isGestor,
      allowedModules,
      allowedMenus,
      hasMfa,
      mfaSatisfied,
      needsMfaEnroll,
      needsMfaChallenge,
      needsPasswordChange,
      refreshProfile,
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
      isGestor,
      allowedModules,
      allowedMenus,
      hasMfa,
      mfaSatisfied,
      needsMfaEnroll,
      needsMfaChallenge,
      needsPasswordChange,
      refreshProfile,
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
