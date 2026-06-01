import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  CalendarRange,
  Layers,
  Users,
  MapPin,
  Ticket,
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
  UsersRound,
  CreditCard,
} from 'lucide-react'

export type ModuleId = 'bi' | 'comercial'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Marca correspondência por prefixo (rotas com querystring/params). */
  end?: boolean
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
        title: 'Análises',
        items: [
          { to: '/bi/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/bi/mensal', label: 'Mensal', icon: CalendarRange },
          { to: '/bi/segmentos', label: 'Segmentos', icon: Layers },
          { to: '/bi/organizadores', label: 'Organizadores', icon: Users },
          { to: '/bi/locais', label: 'Locais', icon: MapPin },
          { to: '/bi/eventos', label: 'Eventos', icon: Ticket },
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
          { to: '/bi/base', label: 'Base de dados', icon: Database },
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
          { to: '/comercial/painel', label: 'Painel comercial', icon: Gauge },
          { to: '/comercial/contas', label: 'Contas', icon: Building2 },
          { to: '/comercial/contatos', label: 'Contatos', icon: Contact },
          { to: '/comercial/funil', label: 'Funil de relacionamento', icon: Filter },
          { to: '/comercial/atividades', label: 'Atividades', icon: Activity },
          { to: '/comercial/tarefas', label: 'Tarefas', icon: CheckSquare },
        ],
      },
      {
        title: 'Configuração',
        items: [
          { to: '/comercial/regua', label: 'Régua de relacionamento', icon: RouteIcon },
          { to: '/comercial/time', label: 'Time', icon: UsersRound },
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
