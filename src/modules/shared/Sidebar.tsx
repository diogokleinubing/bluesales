import { NavLink } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_GROUPS } from './nav'

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary">
          <Ticket className="size-5 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Blueticket</div>
          <div className="text-xs text-muted-foreground">Analytics</div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
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
    </aside>
  )
}
