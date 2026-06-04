import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { getModule, moduleFromPath, type NavItem } from './nav'
import { ModuleDropdown } from './ModuleDropdown'
import { GlobalSearch } from '@/modules/crm/components/GlobalSearch'
import { UserMenu } from './UserMenu'

export function Sidebar() {
  const { pathname } = useLocation()
  const { isAdmin, isGestor } = useAuth()
  const moduleId = moduleFromPath(pathname)
  const mod = getModule(moduleId)

  const canSee = (item: NavItem) =>
    item.requires === 'admin'
      ? isAdmin
      : item.requires === 'gestor'
        ? isGestor
        : true

  const groups = mod.groups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0)

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Seletor de módulo (dropdown) + ícone do produto */}
      <div className="px-2.5 pt-3">
        <ModuleDropdown active={moduleId} />
      </div>

      {/* Busca ampla (apenas no Comercial) */}
      {moduleId === 'comercial' && (
        <div className="px-2.5 pt-2">
          <GlobalSearch />
        </div>
      )}

      {/* Menu contextual do módulo ativo */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Conta do usuário */}
      <UserMenu />
    </aside>
  )
}
