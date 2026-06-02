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

interface Row {
  familia: string
  totalPrev: number
  ytdPrev: number
  ytdCur: number
  diff: number
  diffPct: number | null
  abertura: number | null // 1-12
  aberto: boolean
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
  }, [dataQ.data])

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
                      <TableCell colSpan={7}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum evento recorrente com volume em {prevYear}. Agrupe
                      edições em Regras → Eventos recorrentes.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.familia}>
                      <TableCell className="font-medium">
                        {r.familia}
                        {!r.aberto && (
                          <Badge variant="outline" className="ml-2">
                            não aberto
                          </Badge>
                        )}
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
