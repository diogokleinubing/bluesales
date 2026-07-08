import { Suspense, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './Sidebar'
import { BiFilters } from './BiFilters'
import { rememberRoute } from './navigation'
import {
  accessibleModules,
  findNavItemByPath,
  firstVisibleRoute,
  getModule,
  itemVisible,
  moduleFromPath,
  moduleVisible,
  type AccessCtx,
} from './nav'

export function AppLayout() {
  const location = useLocation()
  const { isAdmin, isGestor, allowedModules, allowedMenus, signOut } = useAuth()
  const isBi = location.pathname.startsWith('/bi/')

  const ctx: AccessCtx = { isAdmin, isGestor, allowedModules, allowedMenus }
  const mods = accessibleModules(ctx)

  // Rota atual permitida? (item de menu casado por prefixo, ou visão do módulo)
  const onModulePath = /^\/(bi|comercial|pesquisa|projetos)\//.test(location.pathname)
  const match = findNavItemByPath(location.pathname)
  const routeAllowed = !onModulePath
    ? true
    : match
      ? itemVisible(match.item, match.moduleId, ctx)
      : moduleVisible(getModule(moduleFromPath(location.pathname)), ctx)
  const blocked = onModulePath && !routeAllowed

  // Persiste a última rota visitada (global e por módulo) — exceto bloqueadas.
  useEffect(() => {
    if (onModulePath && !blocked) {
      rememberRoute(location.pathname, location.search)
    }
  }, [location.pathname, location.search, onModulePath, blocked])

  // Usuário sem nenhum módulo/menu liberado.
  if (mods.length === 0) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-lg font-medium text-foreground">Sem acesso liberado</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Nenhum módulo ou menu está liberado para o seu usuário. Fale com um administrador.
        </p>
        <button
          onClick={signOut}
          className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sair
        </button>
      </div>
    )
  }

  if (blocked) return <Navigate to={firstVisibleRoute(ctx)} replace />

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filtros globais só nas rotas do BI */}
        {isBi && <BiFilters />}
        <main className="flex-1 overflow-y-auto bg-[var(--content-bg)] p-6">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
