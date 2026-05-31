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
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Relatórios',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/mensal', label: 'Mensal', icon: CalendarRange },
      { to: '/segmentos', label: 'Segmentos', icon: Layers },
      { to: '/organizadores', label: 'Organizadores', icon: Users },
      { to: '/locais', label: 'Locais', icon: MapPin },
      { to: '/eventos', label: 'Eventos', icon: Ticket },
      { to: '/ytd', label: 'YTD Comparativo', icon: TrendingUp },
      { to: '/provisionamento', label: 'Provisionamento', icon: Wallet },
    ],
  },
  {
    title: 'Configuração',
    items: [
      { to: '/regras', label: 'Regras', icon: SlidersHorizontal },
      { to: '/importacao', label: 'Importação', icon: Upload },
      { to: '/base', label: 'Armazenamento/Base', icon: Database },
    ],
  },
]
