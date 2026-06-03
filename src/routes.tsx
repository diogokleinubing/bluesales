import { lazy } from 'react'
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/modules/shared/AppLayout'
import { ControlsProvider } from '@/modules/shared/controls-context'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { AdminRoute, RoleRoute } from '@/modules/auth/AdminRoute'
import { LoginPage } from '@/modules/auth/LoginPage'
import { lastRoute } from '@/modules/shared/navigation'

// --- BI (lazy: mantém Recharts/xlsx fora do bundle inicial) ---
const DashboardPage = lazy(() =>
  import('@/modules/bi/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MensalPage = lazy(() =>
  import('@/modules/bi/pages/MensalPage').then((m) => ({ default: m.MensalPage })),
)
const AnalisesPage = lazy(() =>
  import('@/modules/bi/pages/AnalisesPage').then((m) => ({ default: m.AnalisesPage })),
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

// --- Comercial (CRM) ---
const PainelComercial = lazy(() =>
  import('@/modules/crm/pages/Painel').then((m) => ({ default: m.PainelComercial })),
)
const Organizacoes = lazy(() =>
  import('@/modules/crm/pages/Organizacoes').then((m) => ({ default: m.Organizacoes })),
)
const OrganizacaoDetalhe = lazy(() =>
  import('@/modules/crm/pages/OrganizacaoDetalhe').then((m) => ({ default: m.OrganizacaoDetalhe })),
)
const Contatos = lazy(() =>
  import('@/modules/crm/pages/Contatos').then((m) => ({ default: m.Contatos })),
)
const ContatoDetalhe = lazy(() =>
  import('@/modules/crm/pages/ContatoDetalhe').then((m) => ({ default: m.ContatoDetalhe })),
)
const Oportunidades = lazy(() =>
  import('@/modules/crm/pages/Oportunidades').then((m) => ({ default: m.Oportunidades })),
)
const OportunidadeDetalhe = lazy(() =>
  import('@/modules/crm/pages/OportunidadeDetalhe').then((m) => ({ default: m.OportunidadeDetalhe })),
)
const Atividades = lazy(() =>
  import('@/modules/crm/pages/Atividades').then((m) => ({ default: m.Atividades })),
)
const Tarefas = lazy(() =>
  import('@/modules/crm/pages/Tarefas').then((m) => ({ default: m.Tarefas })),
)
const Artistas = lazy(() =>
  import('@/modules/crm/pages/Artistas').then((m) => ({ default: m.Artistas })),
)
const EventosCrm = lazy(() =>
  import('@/modules/crm/pages/EventosCrm').then((m) => ({ default: m.EventosCrm })),
)
const Locais = lazy(() =>
  import('@/modules/crm/pages/Locais').then((m) => ({ default: m.Locais })),
)
const FunisConfig = lazy(() =>
  import('@/modules/crm/pages/config/Funis').then((m) => ({ default: m.FunisConfig })),
)
const PlataformasConfig = lazy(() =>
  import('@/modules/crm/pages/config/Plataformas').then((m) => ({ default: m.PlataformasConfig })),
)
const ObjecoesConfig = lazy(() =>
  import('@/modules/crm/pages/config/Objecoes').then((m) => ({ default: m.ObjecoesConfig })),
)

// --- Ambiente ---
const ConfiguracoesPage = lazy(() =>
  import('@/modules/settings/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })),
)

/** Redireciona a raiz para a última tela visitada (fallback /bi/dashboard). */
function RootRedirect() {
  return <Navigate to={lastRoute()} replace />
}

/** Redireciona para a aba de Análises preservando a querystring (drill-down). */
function AnalisesRedirect({ view }: { view: string }) {
  const { search } = useLocation()
  return <Navigate to={`/bi/analises/${view}${search}`} replace />
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
      {
        path: 'bi/mensal',
        element: (
          <RoleRoute role="gestor">
            <MensalPage />
          </RoleRoute>
        ),
      },
      // Análises unificadas (abas internas).
      { path: 'bi/analises', element: <Navigate to="/bi/analises/segmentos" replace /> },
      { path: 'bi/analises/:view', element: <AnalisesPage /> },
      // Compatibilidade: rotas antigas redirecionam para a aba correspondente
      // preservando a querystring (drill-downs continuam funcionando).
      { path: 'bi/segmentos', element: <AnalisesRedirect view="segmentos" /> },
      { path: 'bi/generos', element: <AnalisesRedirect view="generos" /> },
      { path: 'bi/organizadores', element: <AnalisesRedirect view="organizadores" /> },
      { path: 'bi/locais', element: <AnalisesRedirect view="locais" /> },
      { path: 'bi/eventos', element: <AnalisesRedirect view="eventos" /> },
      { path: 'bi/meios-pagamento', element: <MeiosPagamentoPage /> },
      { path: 'bi/ytd', element: <YtdPage /> },
      { path: 'bi/provisionamento', element: <ProvisionamentoPage /> },
      { path: 'bi/regras', element: <RegrasPage /> },
      { path: 'bi/importacao', element: <ImportacaoPage /> },
      {
        path: 'bi/base',
        element: (
          <RoleRoute role="admin">
            <BasePage />
          </RoleRoute>
        ),
      },

      // Comercial (stubs)
      { path: 'comercial/painel', element: <PainelComercial /> },
      { path: 'comercial/organizacoes', element: <Organizacoes /> },
      { path: 'comercial/organizacoes/:id', element: <OrganizacaoDetalhe /> },
      { path: 'comercial/contatos', element: <Contatos /> },
      { path: 'comercial/contatos/:id', element: <ContatoDetalhe /> },
      { path: 'comercial/oportunidades', element: <Oportunidades /> },
      { path: 'comercial/oportunidades/:id', element: <OportunidadeDetalhe /> },
      { path: 'comercial/atividades', element: <Atividades /> },
      { path: 'comercial/tarefas', element: <Tarefas /> },
      { path: 'comercial/artistas', element: <Artistas /> },
      { path: 'comercial/eventos', element: <EventosCrm /> },
      { path: 'comercial/locais', element: <Locais /> },
      { path: 'comercial/configuracao/funis', element: <FunisConfig /> },
      { path: 'comercial/configuracao/plataformas', element: <PlataformasConfig /> },
      { path: 'comercial/configuracao/objecoes', element: <ObjecoesConfig /> },

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
