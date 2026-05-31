import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/modules/shared/AppLayout'
import { ControlsProvider } from '@/modules/shared/controls-context'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { LoginPage } from '@/modules/auth/LoginPage'
import { DashboardPage } from '@/modules/bi/pages/DashboardPage'
import { MensalPage } from '@/modules/bi/pages/MensalPage'
import { SegmentosPage } from '@/modules/bi/pages/SegmentosPage'
import { OrganizadoresPage } from '@/modules/bi/pages/OrganizadoresPage'
import { LocaisPage } from '@/modules/bi/pages/LocaisPage'
import { EventosPage } from '@/modules/bi/pages/EventosPage'
import { YtdPage } from '@/modules/bi/pages/YtdPage'
import { ProvisionamentoPage } from '@/modules/bi/pages/ProvisionamentoPage'
import { RegrasPage } from '@/modules/bi/pages/RegrasPage'
import { ImportacaoPage } from '@/modules/bi/pages/ImportacaoPage'
import { BasePage } from '@/modules/bi/pages/BasePage'

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
