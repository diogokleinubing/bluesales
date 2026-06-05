import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { getModule, moduleFromPath, type NavItem } from './nav'
import { ModuleDropdown } from './ModuleDropdown'
import { GlobalSearch } from '@/modules/crm/components/GlobalSearch'
import { UserMenu } from './UserMenu'
import { APP_VERSION } from '@/lib/version'

const CONFIG_TITLE = 'Configuração'

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
  )

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

  const configGroup = groups.find((g) => g.title === CONFIG_TITLE)
  const mainGroups = groups.filter((g) => g.title !== CONFIG_TITLE)

  const onConfigPath = !!configGroup?.items.some((i) => pathname.startsWith(i.to))
  const [view, setView] = useState<'main' | 'config'>(onConfigPath ? 'config' : 'main')
  useEffect(() => { setView('main') }, [moduleId])
  useEffect(() => { if (onConfigPath) setView('config') }, [onConfigPath])

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-2.5 pt-3">
        <ModuleDropdown active={moduleId} />
      </div>

      {moduleId === 'comercial' && (
        <div className="px-2.5 pt-2">
          <GlobalSearch />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {view === 'config' && configGroup ? (
          <div className="space-y-1">
            <button
              onClick={() => setView('main')}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <ChevronLeft className="size-4" /> Voltar
            </button>
            <div className="-mx-3 my-2 border-t border-sidebar-border" />
            <ul className="space-y-1">
              {configGroup.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={itemClass}>
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-1">
            {mainGroups.map((group, gi) => (
              <div key={group.title}>
                {gi > 0 && <div className="-mx-3 my-2 border-t border-sidebar-border" />}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} className={itemClass}>
                        <item.icon className="size-4" />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {configGroup && (
              <>
                <div className="-mx-3 my-2 border-t border-sidebar-border" />
                <button
                  onClick={() => setView('config')}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <Settings className="size-4" />
                  <span className="flex-1 text-left">Configurações</span>
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      <div className="px-4 pb-1 pt-1 text-center text-[11px] text-muted-foreground">
        Versão {APP_VERSION}
      </div>

      <UserMenu />
    </aside>
  )
}
