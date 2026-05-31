import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtDelta } from '@/lib/format'

export function KpiCard({
  label,
  value,
  delta,
  sub,
  loading,
  invertDelta = false,
}: {
  label: string
  value: string
  delta?: number | null
  sub?: string
  loading?: boolean
  /** Para métricas onde "subir" é ruim (MDR, Rebate). */
  invertDelta?: boolean
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        )}
        <div className="flex items-center gap-2 text-xs">
          {sub && <span className="text-muted-foreground">{sub}</span>}
          {delta != null && !loading && <DeltaBadge delta={delta} invert={invertDelta} />}
        </div>
      </CardContent>
    </Card>
  )
}

function DeltaBadge({ delta, invert }: { delta: number; invert: boolean }) {
  const positive = delta >= 0
  const good = invert ? !positive : positive
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        good ? 'text-[var(--success)]' : 'text-destructive',
      )}
    >
      <Icon className="size-3" />
      {fmtDelta(delta)}
    </span>
  )
}
