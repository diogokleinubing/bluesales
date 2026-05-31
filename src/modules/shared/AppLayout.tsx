import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Sidebar } from './Sidebar'
import { BiFilters } from './BiFilters'
import { rememberRoute } from './navigation'

export function AppLayout() {
  const location = useLocation()
  const isBi = location.pathname.startsWith('/bi/')

  // Persiste a última rota visitada (global e por módulo).
  useEffect(() => {
    if (
      location.pathname.startsWith('/bi/') ||
      location.pathname.startsWith('/comercial/')
    ) {
      rememberRoute(location.pathname, location.search)
    }
  }, [location.pathname, location.search])

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
