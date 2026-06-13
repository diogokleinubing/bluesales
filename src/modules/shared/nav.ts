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
  Presentation,
  Waypoints,
  Target,
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
  /** Cor do ícone (estilo ClickUp — um pouco de vida no menu). */
  color?: string
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
          { to: '/comercial/painel', label: 'Visão Geral', icon: Gauge, color: '#6366f1' },
          { to: '/comercial/atividades', label: 'Atividades', icon: Activity, color: '#f59e0b' },
        ],
      },
      {
        title: 'Operação',
        items: [
          { to: '/comercial/relacionamento', label: 'Relacionamento', icon: Waypoints, color: '#3b82f6' },
          { to: '/comercial/oportunidades', label: 'Oportunidades', icon: Filter, color: '#22c55e' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { to: '/comercial/organizacoes', label: 'Organizações', icon: Building2, color: '#ef4444' },
          { to: '/comercial/eventos', label: 'Eventos', icon: CalendarRange, color: '#f97316' },
          { to: '/comercial/locais', label: 'Locais', icon: MapPin, color: '#10b981' },
          { to: '/comercial/atracoes', label: 'Atrações', icon: Mic2, color: '#a855f7' },
          { to: '/comercial/contatos', label: 'Contatos', icon: Contact, color: '#0ea5e9' },
        ],
      },
      {
        title: 'Engajamento',
        items: [
          { to: '/comercial/apresentacoes', label: 'Apresentações', icon: Presentation, color: '#64748b' },
        ],
      },
      {
        title: 'Auditoria',
        items: [
          { to: '/comercial/logs', label: 'Logs', icon: ScrollText, color: '#64748b', requires: 'gestor' },
        ],
      },
      {
        title: 'Configuração',
        items: [
          { to: '/comercial/configuracao/funis', label: 'Funis', icon: RouteIcon, color: '#06b6d4' },
          { to: '/comercial/configuracao/plataformas', label: 'Plataformas', icon: Layers, color: '#0ea5e9' },
          { to: '/comercial/configuracao/objecoes', label: 'Objeções', icon: ShieldQuestion, color: '#ef4444' },
          { to: '/comercial/configuracao/tipos-local', label: 'Tipos de local', icon: MapPin, color: '#22c55e' },
          { to: '/comercial/configuracao/fit-score', label: 'Fit Score', icon: Target, color: '#ef4444' },
          { to: '/bi/regras', label: 'Segmentos', icon: SlidersHorizontal, color: '#d946ef' },
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
          { to: '/bi/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: '#3b82f6' },
          { to: '/bi/mensal', label: 'Mensal', icon: CalendarRange, color: '#f97316', requires: 'gestor' },
          { to: '/bi/analises', label: 'Análises', icon: Layers, color: '#8b5cf6' },
          { to: '/bi/meios-pagamento', label: 'Meios de pagamento', icon: CreditCard, color: '#14b8a6' },
          { to: '/bi/ytd', label: 'YTD comparativo', icon: TrendingUp, color: '#22c55e' },
          { to: '/bi/provisionamento', label: 'Provisionamento', icon: Wallet, color: '#f59e0b' },
        ],
      },
      {
        title: 'Configuração',
        items: [
          { to: '/bi/regras', label: 'Regras', icon: SlidersHorizontal, color: '#d946ef' },
          { to: '/bi/importacao', label: 'Importação', icon: Upload, color: '#0ea5e9' },
          { to: '/bi/base', label: 'Base de dados', icon: Database, color: '#64748b', requires: 'admin' },
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
          { to: '/pesquisa/configuracao/fontes', label: 'Sites', icon: Rss, color: '#f97316', requires: 'gestor' },
          { to: '/pesquisa/eventos', label: 'Eventos capturados', icon: CalendarSearch, color: '#3b82f6' },
          { to: '/pesquisa/organizadores', label: 'Organizadores', icon: Building2, color: '#8b5cf6' },
          { to: '/pesquisa/locais', label: 'Locais', icon: MapPin, color: '#10b981' },
          { to: '/pesquisa/agenda', label: 'Agenda oficial', icon: Mic2, color: '#a855f7' },
        ],
      },
      {
        // Título != 'Configuração' de propósito: assim a Pesquisa NÃO usa o
        // drill-in de configurações; estes itens ficam inline na home do
        // módulo, com uma divisória antes.
        title: 'Gestão',
        items: [
          { to: '/pesquisa/configuracao/filtros', label: 'Filtros de ignorar', icon: FilterX, color: '#ef4444', requires: 'gestor' },
          { to: '/pesquisa/configuracao/execucoes', label: 'Execuções', icon: ScrollText, color: '#64748b', requires: 'gestor' },
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

/** IDs de módulo válidos (para sanear o valor vindo do perfil). */
export const MODULE_IDS: ModuleId[] = MODULES.map((m) => m.id)

/**
 * Um módulo é acessível se não houver restrição (allowed = null/vazio = todos)
 * ou se ele estiver na lista permitida.
 */
export function isModuleAllowed(
  id: ModuleId,
  allowed: ModuleId[] | null,
): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(id)
}

/** Módulos visíveis dado o conjunto permitido (null/vazio = todos). */
export function visibleModules(allowed: ModuleId[] | null): ModuleDef[] {
  return MODULES.filter((m) => isModuleAllowed(m.id, allowed))
}
