import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/modules/shared/AppLayout'
import { ControlsProvider } from '@/modules/shared/controls-context'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { AdminRoute, RoleRoute } from '@/modules/auth/AdminRoute'
import { LoginPage } from '@/modules/auth/LoginPage'
import { ConteudoPublico } from '@/modules/crm/pages/email/ConteudoPublico'
import { lastRoute } from '@/modules/shared/navigation'

// Carrega rotas lazy com auto-recuperação: se o chunk falhar ao baixar (chunk
// obsoleto após HMR no dev ou novo deploy em prod — "Failed to fetch
// dynamically imported module"), recarrega a página uma vez (o que o F5 fazia
// manualmente). A trava em sessionStorage evita loop de reload.
function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  const KEY = 'chunk-reloaded'
  return lazy(() =>
    factory().then(
      (m) => { sessionStorage.removeItem(KEY); return m },
      (err) => {
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, '1')
          window.location.reload()
          return new Promise<{ default: T }>(() => {}) // aguarda o reload, não renderiza erro
        }
        throw err
      },
    ),
  )
}

// --- BI (lazy: mantém Recharts/xlsx fora do bundle inicial) ---
const DashboardPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MensalPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/MensalPage').then((m) => ({ default: m.MensalPage })),
)
const AnalisesPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/AnalisesPage').then((m) => ({ default: m.AnalisesPage })),
)
const MeiosPagamentoPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/MeiosPagamentoPage').then((m) => ({ default: m.MeiosPagamentoPage })),
)
const YtdPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/YtdPage').then((m) => ({ default: m.YtdPage })),
)
const ProvisionamentoPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/ProvisionamentoPage').then((m) => ({ default: m.ProvisionamentoPage })),
)
const RegrasPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/RegrasPage').then((m) => ({ default: m.RegrasPage })),
)
const ImportacaoPage = lazyWithRetry(() =>
  import('@/modules/bi/pages/ImportacaoPage').then((m) => ({ default: m.ImportacaoPage })),
)
const BasePage = lazyWithRetry(() =>
  import('@/modules/bi/pages/BasePage').then((m) => ({ default: m.BasePage })),
)

// --- Comercial (CRM) ---
const PainelComercial = lazyWithRetry(() =>
  import('@/modules/crm/pages/Painel').then((m) => ({ default: m.PainelComercial })),
)
const Organizacoes = lazyWithRetry(() =>
  import('@/modules/crm/pages/Organizacoes').then((m) => ({ default: m.Organizacoes })),
)
const Relacionamento = lazyWithRetry(() =>
  import('@/modules/crm/pages/Relacionamento').then((m) => ({ default: m.Relacionamento })),
)
const OrganizacaoDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/OrganizacaoDetalhe').then((m) => ({ default: m.OrganizacaoDetalhe })),
)
const Contatos = lazyWithRetry(() =>
  import('@/modules/crm/pages/Contatos').then((m) => ({ default: m.Contatos })),
)
const ContatoDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/ContatoDetalhe').then((m) => ({ default: m.ContatoDetalhe })),
)
const Oportunidades = lazyWithRetry(() =>
  import('@/modules/crm/pages/Oportunidades').then((m) => ({ default: m.Oportunidades })),
)
const OportunidadeDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/OportunidadeDetalhe').then((m) => ({ default: m.OportunidadeDetalhe })),
)
const Atividades = lazyWithRetry(() =>
  import('@/modules/crm/pages/Atividades').then((m) => ({ default: m.Atividades })),
)
const Artistas = lazyWithRetry(() =>
  import('@/modules/crm/pages/Artistas').then((m) => ({ default: m.Artistas })),
)
const EventosCrm = lazyWithRetry(() =>
  import('@/modules/crm/pages/EventosCrm').then((m) => ({ default: m.EventosCrm })),
)
const Locais = lazyWithRetry(() =>
  import('@/modules/crm/pages/Locais').then((m) => ({ default: m.Locais })),
)
const LocalDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/LocalDetalhe').then((m) => ({ default: m.LocalDetalhe })),
)
const EventoDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/EventoDetalhe').then((m) => ({ default: m.EventoDetalhe })),
)
const EmailListas = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/EmailListas').then((m) => ({ default: m.EmailListas })),
)
const EmailListaDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/EmailListaDetalhe').then((m) => ({ default: m.EmailListaDetalhe })),
)
const EmailMensagens = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/EmailMensagens').then((m) => ({ default: m.EmailMensagens })),
)
const EmailMensagemDetalhe = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/EmailMensagemDetalhe').then((m) => ({ default: m.EmailMensagemDetalhe })),
)
const EmailTemplates = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/EmailTemplates').then((m) => ({ default: m.EmailTemplates })),
)
const ConteudoBiblioteca = lazyWithRetry(() =>
  import('@/modules/crm/pages/email/ConteudoBiblioteca').then((m) => ({ default: m.ConteudoBiblioteca })),
)
const Logs = lazyWithRetry(() =>
  import('@/modules/crm/pages/Logs').then((m) => ({ default: m.Logs })),
)
const FunisConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/Funis').then((m) => ({ default: m.FunisConfig })),
)
const PlataformasConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/Plataformas').then((m) => ({ default: m.PlataformasConfig })),
)
const ObjecoesConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/Objecoes').then((m) => ({ default: m.ObjecoesConfig })),
)
const TiposLocalConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/TiposLocal').then((m) => ({ default: m.TiposLocalConfig })),
)
const FitScoreConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/FitScore').then((m) => ({ default: m.FitScoreConfig })),
)
const SegmentosConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/Segmentos').then((m) => ({ default: m.SegmentosConfig })),
)
const GenerosConfig = lazyWithRetry(() =>
  import('@/modules/crm/pages/config/Generos').then((m) => ({ default: m.GenerosConfig })),
)
const Apresentacoes = lazyWithRetry(() =>
  import('@/modules/crm/pages/apresentacoes/Apresentacoes').then((m) => ({ default: m.Apresentacoes })),
)
const ApresentacoesBiblioteca = lazyWithRetry(() =>
  import('@/modules/crm/pages/apresentacoes/Biblioteca').then((m) => ({ default: m.ApresentacoesBiblioteca })),
)
const ApresentacaoEditor = lazyWithRetry(() =>
  import('@/modules/crm/pages/apresentacoes/ApresentacaoEditor').then((m) => ({ default: m.ApresentacaoEditor })),
)

// --- Módulo Pesquisa ---
const EventosCapturados = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/EventosCapturados').then((m) => ({ default: m.EventosCapturados })),
)
const OrganizadoresMercado = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/OrganizadoresMercado').then((m) => ({ default: m.OrganizadoresMercado })),
)
const LocaisMercado = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/LocaisMercado').then((m) => ({ default: m.LocaisMercado })),
)
const FontesConfig = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/FontesConfig').then((m) => ({ default: m.FontesConfig })),
)
const AgendaOficial = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/AgendaOficial').then((m) => ({ default: m.AgendaOficial })),
)
const FiltrosConfig = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/FiltrosConfig').then((m) => ({ default: m.FiltrosConfig })),
)
const ExecucoesConfig = lazyWithRetry(() =>
  import('@/modules/pesquisa/pages/ExecucoesConfig').then((m) => ({ default: m.ExecucoesConfig })),
)

// --- Módulo Projetos (mock front) ---
const ProjetosLayout = lazyWithRetry(() =>
  import('@/modules/projetos/ProjetosLayout').then((m) => ({ default: m.ProjetosLayout })),
)
const ProjetosAcoes = lazyWithRetry(() =>
  import('@/modules/projetos/pages/Acoes').then((m) => ({ default: m.Acoes })),
)
const ProjetosTarefas = lazyWithRetry(() =>
  import('@/modules/projetos/pages/Tarefas').then((m) => ({ default: m.Tarefas })),
)
const ProjetosObjetivos = lazyWithRetry(() =>
  import('@/modules/projetos/pages/Objetivos').then((m) => ({ default: m.Objetivos })),
)
const ProjetosAreas = lazyWithRetry(() =>
  import('@/modules/projetos/pages/Areas').then((m) => ({ default: m.Areas })),
)
const ProjetosPessoas = lazyWithRetry(() =>
  import('@/modules/projetos/pages/Pessoas').then((m) => ({ default: m.Pessoas })),
)

// --- Ambiente ---
const ConfiguracoesPage = lazyWithRetry(() =>
  import('@/modules/settings/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })),
)

/** Redireciona a raiz para a última tela visitada (fallback /comercial/painel). */
function RootRedirect() {
  return <Navigate to={lastRoute()} replace />
}

/** Redireciona para a aba de Análises preservando a querystring (drill-down). */
function AnalisesRedirect({ view }: { view: string }) {
  const { search } = useLocation()
  return <Navigate to={`/bi/analises/${view}${search}`} replace />
}

/**
 * A antiga tela de Eventos virou a aba "Maiores eventos" em Regras. Redireciona
 * os drill-downs (ex.: /bi/eventos?organizador=X) preservando a querystring.
 */
function RegrasEventosRedirect() {
  const { search } = useLocation()
  const qs = search ? `${search}&tab=eventos` : '?tab=eventos'
  return <Navigate to={`/bi/regras${qs}`} replace />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/conteudo/:codigo', element: <ConteudoPublico /> },
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
      // A antiga aba "Eventos" foi movida para Regras → Maiores eventos.
      { path: 'bi/analises/eventos', element: <RegrasEventosRedirect /> },
      { path: 'bi/analises/:view', element: <AnalisesPage /> },
      // Compatibilidade: rotas antigas redirecionam para a aba correspondente
      // preservando a querystring (drill-downs continuam funcionando).
      { path: 'bi/segmentos', element: <AnalisesRedirect view="segmentos" /> },
      { path: 'bi/generos', element: <AnalisesRedirect view="generos" /> },
      { path: 'bi/organizadores', element: <AnalisesRedirect view="organizadores" /> },
      { path: 'bi/locais', element: <AnalisesRedirect view="locais" /> },
      { path: 'bi/eventos', element: <RegrasEventosRedirect /> },
      {
        path: 'bi/meios-pagamento',
        element: (
          <RoleRoute role="gestor">
            <MeiosPagamentoPage />
          </RoleRoute>
        ),
      },
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
      { path: 'comercial/relacionamento', element: <Relacionamento /> },
      { path: 'comercial/organizacoes/:id', element: <OrganizacaoDetalhe /> },
      { path: 'comercial/contatos', element: <Contatos /> },
      { path: 'comercial/contatos/:id', element: <ContatoDetalhe /> },
      { path: 'comercial/oportunidades', element: <Oportunidades /> },
      { path: 'comercial/oportunidades/:id', element: <OportunidadeDetalhe /> },
      { path: 'comercial/atividades', element: <Atividades /> },
      { path: 'comercial/apresentacoes', element: <Apresentacoes /> },
      { path: 'comercial/apresentacoes/biblioteca', element: <ApresentacoesBiblioteca /> },
      { path: 'comercial/apresentacoes/:id', element: <ApresentacaoEditor /> },
      { path: 'comercial/atracoes', element: <Artistas /> },
      { path: 'comercial/artistas', element: <Navigate to="/comercial/atracoes" replace /> },
      { path: 'comercial/eventos', element: <EventosCrm /> },
      { path: 'comercial/eventos/:id', element: <EventoDetalhe /> },
      { path: 'comercial/locais', element: <Locais /> },
      { path: 'comercial/locais/:id', element: <LocalDetalhe /> },
      { path: 'comercial/email/listas', element: <EmailListas /> },
      { path: 'comercial/email/listas/:id', element: <EmailListaDetalhe /> },
      { path: 'comercial/email/mensagens', element: <EmailMensagens /> },
      { path: 'comercial/email/mensagens/:id', element: <EmailMensagemDetalhe /> },
      { path: 'comercial/email/conteudo', element: <ConteudoBiblioteca /> },
      { path: 'comercial/email/templates', element: <EmailTemplates /> },
      {
        path: 'comercial/logs',
        element: (
          <RoleRoute role="gestor">
            <Logs />
          </RoleRoute>
        ),
      },
      { path: 'comercial/configuracao/funis', element: <FunisConfig /> },
      { path: 'comercial/configuracao/plataformas', element: <PlataformasConfig /> },
      { path: 'comercial/configuracao/objecoes', element: <ObjecoesConfig /> },
      { path: 'comercial/configuracao/tipos-local', element: <TiposLocalConfig /> },
      { path: 'comercial/configuracao/segmentos', element: <SegmentosConfig /> },
      { path: 'comercial/configuracao/generos', element: <GenerosConfig /> },
      { path: 'comercial/configuracao/fit-score', element: <FitScoreConfig /> },

      // Módulo Projetos (mock front — estado em memória via ProjetosProvider)
      {
        path: 'projetos',
        element: <ProjetosLayout />,
        children: [
          { index: true, element: <Navigate to="/projetos/acoes" replace /> },
          { path: 'acoes', element: <ProjetosAcoes /> },
          { path: 'tarefas', element: <ProjetosTarefas /> },
          { path: 'objetivos', element: <ProjetosObjetivos /> },
          { path: 'areas', element: <ProjetosAreas /> },
          { path: 'pessoas', element: <ProjetosPessoas /> },
        ],
      },

      // Módulo Pesquisa
      { path: 'pesquisa/eventos', element: <EventosCapturados /> },
      { path: 'pesquisa/organizadores', element: <OrganizadoresMercado /> },
      { path: 'pesquisa/locais', element: <LocaisMercado /> },
      { path: 'pesquisa/agenda', element: <AgendaOficial /> },
      { path: 'pesquisa/configuracao/fontes', element: <FontesConfig /> },
      { path: 'pesquisa/configuracao/filtros', element: <FiltrosConfig /> },
      { path: 'pesquisa/configuracao/execucoes', element: <ExecucoesConfig /> },

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
