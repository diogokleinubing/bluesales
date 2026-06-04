import { Badge } from '@/components/ui/badge'

// Escala de target: A+ verde forte, A verde claro, B amarelo, C vermelho
// (C está fora do target).
const CLASSE_STYLE: Record<string, string> = {
  'A+': 'border-transparent bg-[var(--success)] text-white',
  A: 'border-transparent bg-[var(--success)]/15 text-[var(--success)]',
  B: 'border-transparent bg-[var(--warning)]/15 text-[var(--warning)]',
  C: 'border-transparent bg-destructive/15 text-destructive',
}

export function ClasseBadge({ classe }: { classe: string | null | undefined }) {
  if (!classe) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="secondary" className={CLASSE_STYLE[classe] ?? ''}>
      {classe}
    </Badge>
  )
}
