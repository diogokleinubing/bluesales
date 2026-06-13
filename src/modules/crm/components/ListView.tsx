import type { ReactNode } from 'react'
import { Search, List, Kanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ListKanban } from '../hooks/useViewPref'

/** Classe para os controles de filtro no estilo "pill" do toolbar. */
export const TOOLBAR_TRIGGER = 'h-8 gap-1.5 rounded-lg border-border bg-card text-sm'

/** Alternador de visão Lista / Kanban. */
export function ViewToggle({ view, onChange }: { view: ListKanban; onChange: (v: ListKanban) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {([
        { v: 'list' as const, icon: List, label: 'Lista' },
        { v: 'kanban' as const, icon: Kanban, label: 'Kanban' },
      ]).map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={label}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
            view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  )
}

/** Campo de busca em formato pill para o toolbar. */
export function ToolbarSearch({
  value, onChange, placeholder = 'Buscar…', className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
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

/**
 * Casca de listagem no estilo Attio: full-bleed (cancela o padding do main),
 * cabeçalho com título/contagem/ações, toolbar de filtros e tabela em largura
 * total, com rodapé opcional de contagem.
 */
export function ListView({
  title, count, actions, toolbar, footer, children,
}: {
  title: string
  count?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col">
      {/* Cabeçalho (fundo branco) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-5 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {count != null && <span className="text-sm text-muted-foreground">{count}</span>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Toolbar de filtros (fundo branco) */}
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-5 py-2">
          {toolbar}
        </div>
      )}

      {/* Tabela em largura total — barra de cabeçalho com fundo próprio e negrito */}
      <div className="min-w-0 flex-1 overflow-x-auto [&_tbody_td]:px-4 [&_tbody_td]:py-1 [&_tbody_tr]:h-10 [&_thead_th]:h-11 [&_thead_th]:border-b [&_thead_th]:border-border [&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-foreground">
        {children}
      </div>

      {/* Rodapé (contagem) */}
      {footer && (
        <div className="border-t border-border bg-muted/20 px-5 py-2 text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}
