import { Badge } from '@/components/ui/badge'
import type { FitResult } from '../hooks/useFitScore'

/** Badge colorido do Fit Score (verde ≥70, âmbar ≥40, vermelho abaixo). */
export function FitBadge({ fit }: { fit: FitResult }) {
  if (fit.eliminado) return <Badge variant="outline" className="text-muted-foreground">descartado</Badge>
  if (fit.score == null) return <span className="text-muted-foreground">—</span>
  const cls = fit.score >= 70 ? 'bg-[var(--success)]/15 text-[var(--success)]'
    : fit.score >= 40 ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
      : 'bg-destructive/15 text-destructive'
  return <span className={`inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>{fit.score}</span>
}
