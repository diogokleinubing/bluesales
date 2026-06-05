import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  CalendarRange,
  Layers,
  TrendingUp,
  Wallet,
  SlidersHorizontal,
  Upload,
  Database,
  BarChart3,
  Briefcase,
  Gauge,
  Building2,
  Contact,
  Filter,
  Activity,
  Route as RouteIcon,
  CreditCard,
  Mic2,
  MapPin,
  ShieldQuestion,
  Radar,
  CalendarSearch,
  Rss,
  FilterX,
  ScrollText,
} from 'lucide-react'

export type ModuleId = 'bi' | 'comercial' | 'pesquisa'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Marca correspondência por prefixo (rotas com querystring/params). */
  end?: boolean
  /** Restringe a exibição do item a um perfil. */
  requires?: 'admin' | 'gestor'
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export interface ModuleDef {
  id: ModuleId
  label: string
  icon: LucideIcon
  /** Rota inicial padrão do módulo. */
  home: string
  groups: NavGroup[]
}

export const MODULES: ModuleDef[] = [
  {
    id: 'comercial',
    label: 'Comercial',
    icon: Briefcase,
    home: '/comercial/painel',
    groups: [
      {
        title: 'Visão geral',
        items: [
          { to: '/comercial/painel', label: 'Visão Geral', icon: Gauge },
        ],
      },
      {
        title: 'Operação',
        items: [
          { to: '/comercial/organizacoes', label: 'Organizações', icon: Building2 },
          { to: '/comercial/oportunidades', label: 'Oportunidades', icon: Filter },
          { to: '/comercial/contatos', label: 'Contatos', icon: Contact },
        ],
      },
      {
        title: 'Engajamento',
        items: [
          { to: '/comercial/atividades', label: 'Atividades', icon: Activity },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { to: '/comercial/artistas', label: 'Artistas', icon: Mic2 },
          { to: '/comercial/eventos', label: 'Eventos', icon: CalendarRange },
          { to: '/comercial/locais', label: 'Locais', icon: MapPin },
        ],
      },
      {
        title: 'Configuração',
        items: [
          { to: '/comercial/configuracao/funis', label: 'Funis', icon: RouteIcon },
          { to: '/comercial/configuracao/plataformas', label: 'Plataformas', icon: Layers },
          { to: '/comercial/configuracao/objecoes', label: 'Objeções', icon: ShieldQuestion },
          { to: '/bi/regras', label: 'Segmentos', icon: SlidersHorizontal },
        ],
      },
    ],
  },
  {
    id: 'bi',
    label: 'BI',
    icon: BarChart3,
    home: '/bi/dashboard',
    groups: [
      {
        title: 'Visão geral',
        items: [
          { to: '/bi/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/bi/mensal', label: 'Mensal', icon: CalendarRange, requires: 'gestor' },
          { to: '/bi/analises', label: 'Análises', icon: Layers },
          { to: '/bi/meios-pagamento', label: 'Meios de pagamento', icon: CreditCard },
          { to: '/bi/ytd', label: 'YTD comparativo', icon: TrendingUp },
          { to: '/bi/provisionamento', label: 'Provisionamento', icon: Wallet },
        ],
      },
      {
        title: 'Configuração',
        items: [
          { to: '/bi/regras', label: 'Regras', icon: SlidersHorizontal },
          { to: '/bi/importacao', label: 'Importação', icon: Upload },
          { to: '/bi/base', label: 'Base de dados', icon: Database, requires: 'admin' },
        ],
      },
    ],
  },
  {
    id: 'pesquisa',
    label: 'Pesquisa',
    icon: Radar,
    home: '/pesquisa/eventos',
    groups: [
      {
        title: 'Operação',
        items: [
          { to: '/pesquisa/configuracao/fontes', label: 'Sites', icon: Rss, requires: 'gestor' },
          { to: '/pesquisa/eventos', label: 'Eventos capturados', icon: CalendarSearch },
          { to: '/pesquisa/organizadores', label: 'Organizadores', icon: Building2 },
          { to: '/pesquisa/locais', label: 'Locais', icon: MapPin },
        ],
      },
      {
        // Título != 'Configuração' de propósito: assim a Pesquisa NÃO usa o
        // drill-in de configurações; estes itens ficam inline na home do
        // módulo, com uma divisória antes.
        title: 'Gestão',
        items: [
          { to: '/pesquisa/configuracao/filtros', label: 'Filtros de ignorar', icon: FilterX, requires: 'gestor' },
          { to: '/pesquisa/configuracao/execucoes', label: 'Execuções', icon: ScrollText, requires: 'gestor' },
        ],
      },
    ],
  },
]

export function moduleFromPath(pathname: string): ModuleId {
  if (pathname.startsWith('/comercial')) return 'comercial'
  if (pathname.startsWith('/pesquisa')) return 'pesquisa'
  return 'bi'
}

export function getModule(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[0]
}
