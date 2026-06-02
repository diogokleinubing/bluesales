import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MONTH_LABELS } from '../components/chart-theme'
import { useOrgId, lastMonthWithSales } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { biMonthly, biRecurringYtd } from '../lib/rpc'
import { fmtBRL, fmtDelta } from '@/lib/format'

type Status = 'Aberto' | 'Finalizado' | 'Não Aberto' | 'Aguardando'

const STATUS_STYLE: Record<Status, string> = {
  Aberto: 'border-transparent bg-[var(--success)]/15 text-[var(--success)]',
  Finalizado: 'border-transparent bg-muted text-muted-foreground',
  'Não Aberto': 'border-transparent bg-destructive/15 text-destructive',
  Aguardando: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

interface Row {
  familia: string
  totalPrev: number
  ytdPrev: number
  ytdCur: number
  diff: number
  diffPct: number | null
  abertura: number | null // 1-12
  aberto: boolean
  status: Status
}

/**
 * Status do evento recorrente no ano atual:
 * - Finalizado: a data do evento (mês) já passou (< mês atual = último com vendas)
 * - Aberto: já tem vendas no ano atual e o evento ainda não passou
 * - Não Aberto: já deveria ter aberto (mês de abertura do ano anterior <= atual)
 *   mas ainda não vendeu
 * - Aguardando: ainda não chegou o mês de abertura
 */
function computeStatus(
  r: { ytdCur: number; abertura: number | null; eventoMes: number | null },
  cutoff: number | null,
): Status {
  if (cutoff != null && r.eventoMes != null && r.eventoMes < cutoff)
    return 'Finalizado'
  if (r.ytdCur > 0) return 'Aberto'
  if (cutoff != null && r.abertura != null && r.abertura <= cutoff)
    return 'Não Aberto'
  return 'Aguardando'
}

export function RecorrentesPage() {
  const { year, pdv } = useControls()
  const orgId = useOrgId()
  const prevYear = year - 1

  // Eixo = data de venda (abertura de vendas + YTD de receita).
  const monthlyQ = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'monthly', orgId, year, 'venda', pdv],
    queryFn: () => biMonthly(orgId!, year, 'venda', pdv),
  })
  const cutoff = lastMonthWithSales(monthlyQ.data)

  const dataQ = useQuery({
    enabled: !!orgId && monthlyQ.isSuccess,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'recurring-ytd', orgId, year, pdv, cutoff],
    queryFn: () => biRecurringYtd(orgId!, year, pdv, cutoff),
  })

  const rows = useMemo<Row[]>(() => {
    const list = (dataQ.data ?? []).map((r) => {
      const ytdPrev = Number(r.ytd_prev)
      const ytdCur = Number(r.ytd_cur)
      const diff = ytdCur - ytdPrev
      return {
        familia: r.familia,
        totalPrev: Number(r.total_prev),
        ytdPrev,
        ytdCur,
        diff,
        diffPct: ytdPrev > 0 ? diff / ytdPrev : null,
        abertura: r.abertura_prev,
        aberto: ytdCur > 0,
        status: computeStatus(
          { ytdCur, abertura: r.abertura_prev, eventoMes: r.evento_mes_cur },
          cutoff,
        ),
      }
    })
    // Abertos primeiro (por YTD do ano atual, desc); não-abertos depois, em
    // ordem cronológica do mês de abertura do ano anterior.
    list.sort((a, b) => {
      if (a.aberto !== b.aberto) return a.aberto ? -1 : 1
      if (a.aberto) return b.ytdCur - a.ytdCur
      return (a.abertura ?? 99) - (b.abertura ?? 99)
    })
    return list
  }, [dataQ.data, cutoff])

  const totals = useMemo(
    () => ({
      totalPrev: rows.reduce((a, r) => a + r.totalPrev, 0),
      ytdPrev: rows.reduce((a, r) => a + r.ytdPrev, 0),
      ytdCur: rows.reduce((a, r) => a + r.ytdCur, 0),
    }),
    [rows],
  )
  const totalDiff = totals.ytdCur - totals.ytdPrev
  const totalDiffPct = totals.ytdPrev > 0 ? totalDiff / totals.ytdPrev : null

  const isLoading = monthlyQ.isLoading || dataQ.isLoading
  const cutoffLabel = cutoff ? MONTH_LABELS[cutoff - 1] : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Eventos recorrentes
        </h1>
        <p className="text-sm text-muted-foreground">
          Famílias com volume em {prevYear}. YTD por data de venda
          {cutoffLabel ? ` (Jan–${cutoffLabel})` : ''}. Os que ainda não abriram
          em {year} aparecem por ordem do mês de abertura.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">GMV Total {prevYear}</TableHead>
                  <TableHead className="text-right">GMV YTD {prevYear}</TableHead>
                  <TableHead className="text-right">GMV YTD {year}</TableHead>
                  <TableHead className="text-right">Δ R$</TableHead>
                  <TableHead className="text-right">Δ %</TableHead>
                  <TableHead>Abertura {prevYear}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhum evento recorrente com volume em {prevYear}. Agrupe
                      edições em Regras → Eventos recorrentes.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((r) => (
                      <TableRow key={r.familia}>
                        <TableCell className="font-medium">{r.familia}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_STYLE[r.status]}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(r.totalPrev)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(r.ytdPrev)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(r.ytdCur)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            r.diff >= 0 ? 'text-[var(--success)]' : 'text-destructive'
                          }`}
                        >
                          {fmtBRL(r.diff)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.diffPct == null ? '—' : fmtDelta(r.diffPct)}
                        </TableCell>
                        <TableCell>
                          {r.abertura ? MONTH_LABELS[r.abertura - 1] : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totais */}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Total ({rows.length})</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(totals.totalPrev)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(totals.ytdPrev)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(totals.ytdCur)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          totalDiff >= 0 ? 'text-[var(--success)]' : 'text-destructive'
                        }`}
                      >
                        {fmtBRL(totalDiff)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totalDiffPct == null ? '—' : fmtDelta(totalDiffPct)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
