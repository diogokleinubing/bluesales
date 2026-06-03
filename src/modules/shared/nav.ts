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
  CheckSquare,
  Route as RouteIcon,
  CreditCard,
  Mic2,
  MapPin,
  ShieldQuestion,
} from 'lucide-react'

export type ModuleId = 'bi' | 'comercial'

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
    id: 'comercial',
    label: 'Comercial',
    icon: Briefcase,
    home: '/comercial/painel',
    groups: [
      {
        title: 'Operação',
        items: [
          { to: '/comercial/painel', label: 'Painel', icon: Gauge },
          { to: '/comercial/organizacoes', label: 'Organizações', icon: Building2 },
          { to: '/comercial/contatos', label: 'Contatos', icon: Contact },
          { to: '/comercial/oportunidades', label: 'Oportunidades', icon: Filter },
          { to: '/comercial/atividades', label: 'Atividades', icon: Activity },
          { to: '/comercial/tarefas', label: 'Tarefas', icon: CheckSquare },
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
]

export function moduleFromPath(pathname: string): ModuleId {
  return pathname.startsWith('/comercial') ? 'comercial' : 'bi'
}

export function getModule(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[0]
}
