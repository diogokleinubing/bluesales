import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { getModule, moduleFromPath, type NavItem } from './nav'
import { ModuleDropdown } from './ModuleDropdown'
import { GlobalSearch } from '@/modules/crm/components/GlobalSearch'
import { UserMenu } from './UserMenu'
import { DISPLAY_VERSION } from '@/lib/version'

const CONFIG_TITLE = 'Configuração'
const COLLAPSE_KEY = 'bs-sidebar-collapsed'

const itemClass = (collapsed: boolean) => ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md py-1.5 text-sm transition-colors',
    collapsed ? 'justify-center px-2' : 'px-3',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
  )

export function Sidebar() {
  const { pathname } = useLocation()
  const { isAdmin, isGestor } = useAuth()
  const moduleId = moduleFromPath(pathname)
  const mod = getModule(moduleId)

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

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

  const ic = itemClass(collapsed)

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-1 pt-3', collapsed ? 'flex-col px-1.5' : 'px-2.5')}>
        <div className={cn('min-w-0', collapsed ? '' : 'flex-1')}>
          <ModuleDropdown active={moduleId} collapsed={collapsed} />
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {moduleId === 'comercial' && !collapsed && (
        <div className="px-2.5 pt-2">
          <GlobalSearch />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {view === 'config' && configGroup ? (
          <div className="space-y-1">
            <button
              onClick={() => setView('main')}
              title={collapsed ? 'Voltar' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground',
                collapsed ? 'justify-center px-2' : 'px-3',
              )}
            >
              <ChevronLeft className="size-4 shrink-0" /> {!collapsed && 'Voltar'}
            </button>
            <div className="-mx-3 my-2 border-t border-sidebar-border" />
            <ul className="space-y-1">
              {configGroup.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={ic} title={collapsed ? item.label : undefined}>
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed && item.label}
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
                      <NavLink to={item.to} className={ic} title={collapsed ? item.label : undefined}>
                        <item.icon className="size-4 shrink-0" />
                        {!collapsed && item.label}
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
                  title={collapsed ? 'Configurações' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground',
                    collapsed ? 'justify-center px-2' : 'px-3',
                  )}
                >
                  <Settings className="size-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">Configurações</span>
                      <ChevronRight className="size-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div className="px-4 pb-1 pt-1 text-center text-[11px] text-muted-foreground">
          Versão {DISPLAY_VERSION}
        </div>
      )}

      <UserMenu collapsed={collapsed} />
    </aside>
  )
}
