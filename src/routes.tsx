import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/modules/shared/AppLayout'
import { ControlsProvider } from '@/modules/shared/controls-context'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { AdminRoute } from '@/modules/auth/AdminRoute'
import { LoginPage } from '@/modules/auth/LoginPage'
import { lastRoute } from '@/modules/shared/navigation'

// --- BI (lazy: mantém Recharts/xlsx fora do bundle inicial) ---
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
const MeiosPagamentoPage = lazy(() =>
  import('@/modules/bi/pages/MeiosPagamentoPage').then((m) => ({ default: m.MeiosPagamentoPage })),
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

// --- Comercial (stubs) ---
const PainelPage = lazy(() =>
  import('@/modules/crm/pages/PainelPage').then((m) => ({ default: m.PainelPage })),
)
const ContasPage = lazy(() =>
  import('@/modules/crm/pages/ContasPage').then((m) => ({ default: m.ContasPage })),
)
const ContaDetailPage = lazy(() =>
  import('@/modules/crm/pages/ContaDetailPage').then((m) => ({ default: m.ContaDetailPage })),
)
const ContatosPage = lazy(() =>
  import('@/modules/crm/pages/ContatosPage').then((m) => ({ default: m.ContatosPage })),
)
const FunilPage = lazy(() =>
  import('@/modules/crm/pages/FunilPage').then((m) => ({ default: m.FunilPage })),
)
const AtividadesPage = lazy(() =>
  import('@/modules/crm/pages/AtividadesPage').then((m) => ({ default: m.AtividadesPage })),
)
const TarefasPage = lazy(() =>
  import('@/modules/crm/pages/TarefasPage').then((m) => ({ default: m.TarefasPage })),
)
const ReguaPage = lazy(() =>
  import('@/modules/crm/pages/ReguaPage').then((m) => ({ default: m.ReguaPage })),
)
const TimePage = lazy(() =>
  import('@/modules/crm/pages/TimePage').then((m) => ({ default: m.TimePage })),
)

// --- Ambiente ---
const ConfiguracoesPage = lazy(() =>
  import('@/modules/settings/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })),
)

/** Redireciona a raiz para a última tela visitada (fallback /bi/dashboard). */
function RootRedirect() {
  return <Navigate to={lastRoute()} replace />
}

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
      { index: true, element: <RootRedirect /> },

      // BI
      { path: 'bi/dashboard', element: <DashboardPage /> },
      { path: 'bi/mensal', element: <MensalPage /> },
      { path: 'bi/segmentos', element: <SegmentosPage /> },
      { path: 'bi/organizadores', element: <OrganizadoresPage /> },
      { path: 'bi/locais', element: <LocaisPage /> },
      { path: 'bi/eventos', element: <EventosPage /> },
      { path: 'bi/meios-pagamento', element: <MeiosPagamentoPage /> },
      { path: 'bi/ytd', element: <YtdPage /> },
      { path: 'bi/provisionamento', element: <ProvisionamentoPage /> },
      { path: 'bi/regras', element: <RegrasPage /> },
      { path: 'bi/importacao', element: <ImportacaoPage /> },
      { path: 'bi/base', element: <BasePage /> },

      // Comercial (stubs)
      { path: 'comercial/painel', element: <PainelPage /> },
      { path: 'comercial/contas', element: <ContasPage /> },
      { path: 'comercial/contas/:ref', element: <ContaDetailPage /> },
      { path: 'comercial/contatos', element: <ContatosPage /> },
      { path: 'comercial/funil', element: <FunilPage /> },
      { path: 'comercial/atividades', element: <AtividadesPage /> },
      { path: 'comercial/tarefas', element: <TarefasPage /> },
      { path: 'comercial/regua', element: <ReguaPage /> },
      { path: 'comercial/time', element: <TimePage /> },

      // Ambiente (somente admin)
      {
        path: 'configuracoes',
        element: (
          <AdminRoute>
            <ConfiguracoesPage />
          </AdminRoute>
        ),
      },

      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
