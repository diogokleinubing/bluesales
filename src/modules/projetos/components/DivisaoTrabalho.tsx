import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Acao, Objetivo } from '../types'
import { TRILHAS } from '../types'
import { calcularMix } from '../lib/compute'

/**
 * Barra da divisão do trabalho entre as quatro trilhas, por contagem de ações.
 * Reflete as ações já filtradas (recebidas prontas) — mostra o quanto do que
 * está em andamento puxa a estratégia vs. avulso/rotina.
 */
export function DivisaoTrabalho({ acoes, objetivos }: { acoes: Acao[]; objetivos: Objetivo[] }) {
  const { slices, total } = useMemo(() => calcularMix(acoes, objetivos), [acoes, objetivos])
  const comValor = slices.filter((s) => s.valor > 0)

  return (
    <div className="border-b border-border bg-muted/20 px-5 py-2.5">
      <div className="flex items-center justify-between gap-x-4">
        <span className="text-xs font-medium text-muted-foreground">Divisão do trabalho</span>
        <span className="text-xs text-muted-foreground">{total} {total === 1 ? 'ação' : 'ações'}</span>
      </div>

      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total === 0 ? (
          <div className="flex-1" />
        ) : (
          comValor.map((s) => (
            <div
              key={s.trilha}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${s.pct}%`, backgroundColor: TRILHAS[s.trilha].cor }}
              title={`${TRILHAS[s.trilha].label}: ${s.pct.toFixed(0)}%`}
            />
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {slices.map((s) => (
          <span key={s.trilha} className={cn('inline-flex items-center gap-1.5 text-xs', s.valor === 0 && 'opacity-40')}>
            <span className="size-2 rounded-full" style={{ backgroundColor: TRILHAS[s.trilha].cor }} />
            <span className="text-muted-foreground">{TRILHAS[s.trilha].label}</span>
            <span className="font-semibold tabular-nums">{s.pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}
