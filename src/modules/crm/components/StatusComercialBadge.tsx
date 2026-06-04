import { Badge } from '@/components/ui/badge'

// Verde: Ativo · Amarelo: Eventual · Vermelho: Inativo
const STATUS_STYLE: Record<string, string> = {
  Ativo: 'border-transparent bg-[var(--success)]/15 text-[var(--success)]',
  Eventual: 'border-transparent bg-[var(--warning)]/15 text-[var(--warning)]',
  Inativo: 'border-transparent bg-destructive/15 text-destructive',
}

export function StatusComercialBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="secondary" className={STATUS_STYLE[status] ?? ''}>
      {status}
    </Badge>
  )
}
