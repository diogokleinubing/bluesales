import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { MODULES, type ModuleId } from './nav'
import { lastRouteOfModule } from './navigation'

/** Controle segmentado para alternar entre os módulos BI e Comercial. */
export function ModuleSwitcher({ active }: { active: ModuleId }) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {MODULES.map((m) => {
        const isActive = m.id === active
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => navigate(lastRouteOfModule(m.id))}
            aria-pressed={isActive}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <m.icon className="size-4" />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
