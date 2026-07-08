import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

/** Classe para controles "pill" do toolbar (espelha o padrão do CRM). */
export const TOOLBAR_TRIGGER = 'h-8 gap-1.5 rounded-lg border border-border bg-card text-sm'

/**
 * Casca de listagem no estilo Attio (mesma do CRM): full-bleed, cabeçalho com
 * título/contagem/ações, toolbar de filtros e conteúdo em largura total.
 */
export function PageShell({
  title,
  count,
  actions,
  toolbar,
  banner,
  footer,
  children,
}: {
  title: string
  count?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  /** Faixa opcional entre o toolbar e o conteúdo (ex.: barra de esforço). */
  banner?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-5 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {count != null && <span className="text-sm text-muted-foreground">{count}</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-5 py-2">
          {toolbar}
        </div>
      )}

      {banner}

      <div className="min-w-0 flex-1 overflow-x-auto [&_tbody_td]:px-4 [&_tbody_td]:py-1 [&_tbody_tr]:h-10 [&_thead_th]:h-11 [&_thead_th]:border-b [&_thead_th]:border-border [&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-foreground">
        {children}
      </div>

      {footer && (
        <div className="border-t border-border bg-muted/20 px-5 py-2 text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}

/** Controle segmentado genérico (visão Lista/Quadro, agrupamento, etc.). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { v: T; label: string; icon?: LucideIcon }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={label}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
            value === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {Icon && <Icon className="size-4" />} {label}
        </button>
      ))}
    </div>
  )
}

/** Campo de busca em formato pill. */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-60 rounded-lg border border-border bg-card pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
      />
    </div>
  )
}

export interface MultiOption {
  value: string
  label: string
  /** Bolinha de cor opcional (ex.: cor do status). */
  color?: string
}

/**
 * Filtro multi-seleção em dropdown (checkboxes). Mostra a contagem de
 * selecionados no botão e mantém o menu aberto ao marcar/desmarcar.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  align = 'start',
}: {
  label: string
  options: MultiOption[]
  selected: string[]
  onChange: (v: string[]) => void
  align?: 'start' | 'end'
}) {
  const count = selected.length
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(TOOLBAR_TRIGGER, 'h-8')}>
          {label}
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">{count}</span>
          )}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
          {count > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-xs font-normal text-muted-foreground hover:text-foreground">
              Limpar
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex items-center gap-2">
              {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
              {o.label}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
