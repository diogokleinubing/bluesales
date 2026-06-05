import { Suspense, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './Sidebar'
import { BiFilters } from './BiFilters'
import { rememberRoute } from './navigation'
import { isModuleAllowed, moduleFromPath, visibleModules } from './nav'

export function AppLayout() {
  const location = useLocation()
  const { allowedModules } = useAuth()
  const isBi = location.pathname.startsWith('/bi/')

  // Rota pertence a um módulo e o usuário não tem acesso a ele?
  const onModulePath = /^\/(bi|comercial|pesquisa)\//.test(location.pathname)
  const blocked =
    onModulePath &&
    !isModuleAllowed(moduleFromPath(location.pathname), allowedModules)
  const fallbackHome = visibleModules(allowedModules)[0]?.home ?? '/'

  // Persiste a última rota visitada (global e por módulo) — exceto bloqueadas.
  useEffect(() => {
    if (onModulePath && !blocked) {
      rememberRoute(location.pathname, location.search)
    }
  }, [location.pathname, location.search, onModulePath, blocked])

  if (blocked) return <Navigate to={fallbackHome} replace />

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filtros globais só nas rotas do BI */}
        {isBi && <BiFilters />}
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
