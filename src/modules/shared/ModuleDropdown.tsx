import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, Check, Tickets } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { visibleModules, getModule, type ModuleId } from './nav'
import { lastRouteOfModule } from './navigation'
import { useAuth } from '@/lib/auth'

/** Seletor de módulo em formato dropdown, com o ícone do produto à esquerda. */
export function ModuleDropdown({ active, collapsed }: { active: ModuleId; collapsed?: boolean }) {
  const navigate = useNavigate()
  const { allowedModules } = useAuth()
  const mod = getModule(active)
  const mods = visibleModules(allowedModules)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            title={mod.label}
            className="flex w-full items-center justify-center rounded-lg p-2 transition-colors hover:bg-sidebar-accent"
          >
            <Tickets className="size-6 shrink-0 text-primary dark:text-white" />
          </button>
        ) : (
          <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent">
            <Tickets className="size-6 shrink-0 text-primary dark:text-white" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{mod.label}</div>
              <div className="truncate text-xs text-muted-foreground">BlueSales</div>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-52">
        {mods.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => navigate(lastRouteOfModule(m.id))} className="gap-2">
            <m.icon className="size-4" />
            <span className="flex-1">{m.label}</span>
            {m.id === active && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
