import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/modules/shared/AppLayout'
import { ControlsProvider } from '@/modules/shared/controls-context'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { LoginPage } from '@/modules/auth/LoginPage'

// Páginas carregadas sob demanda (mantém Recharts/xlsx fora do bundle inicial).
const DashboardPage = lazy(() =>
  import('@/modules/bi/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MensalPage = lazy(() =>
  import('@/modules/bi/pages/MensalPage').then((m) => ({ default: m.MensalPage })),
)
const SegmentosPage = lazy(() =>
  import('@/modules/bi/pages/SegmentosPage').then((m) => ({ default: m.SegmentosPage })),
)
const OrganizadoresPage = lazy(() =>
  import('@/modules/bi/pages/OrganizadoresPage').then((m) => ({ default: m.OrganizadoresPage })),
)
const LocaisPage = lazy(() =>
  import('@/modules/bi/pages/LocaisPage').then((m) => ({ default: m.LocaisPage })),
)
const EventosPage = lazy(() =>
  import('@/modules/bi/pages/EventosPage').then((m) => ({ default: m.EventosPage })),
)
const YtdPage = lazy(() =>
  import('@/modules/bi/pages/YtdPage').then((m) => ({ default: m.YtdPage })),
)
const ProvisionamentoPage = lazy(() =>
  import('@/modules/bi/pages/ProvisionamentoPage').then((m) => ({ default: m.ProvisionamentoPage })),
)
const RegrasPage = lazy(() =>
  import('@/modules/bi/pages/RegrasPage').then((m) => ({ default: m.RegrasPage })),
)
const ImportacaoPage = lazy(() =>
  import('@/modules/bi/pages/ImportacaoPage').then((m) => ({ default: m.ImportacaoPage })),
)
const BasePage = lazy(() =>
  import('@/modules/bi/pages/BasePage').then((m) => ({ default: m.BasePage })),
)

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <ControlsProvider>
          <AppLayout />
        </ControlsProvider>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'mensal', element: <MensalPage /> },
      { path: 'segmentos', element: <SegmentosPage /> },
      { path: 'organizadores', element: <OrganizadoresPage /> },
      { path: 'locais', element: <LocaisPage /> },
      { path: 'eventos', element: <EventosPage /> },
      { path: 'ytd', element: <YtdPage /> },
      { path: 'provisionamento', element: <ProvisionamentoPage /> },
      { path: 'regras', element: <RegrasPage /> },
      { path: 'importacao', element: <ImportacaoPage /> },
      { path: 'base', element: <BasePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
