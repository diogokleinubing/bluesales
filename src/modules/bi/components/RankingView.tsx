import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HorizontalRankBar } from './charts'
import type { GroupAgg } from '../lib/aggregate'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

/**
 * Ranking genérico (barras + tabela) com drill-down para Eventos.
 * `drillParam` é o nome do parâmetro na querystring (ex.: 'organizador').
 */
export function RankingView({
  title,
  groups,
  metricLabel,
  drillParam,
  loading,
  topN = 15,
}: {
  title: string
  groups: GroupAgg[]
  metricLabel: string
  drillParam: string
  loading?: boolean
  topN?: number
}) {
  const navigate = useNavigate()
  const total = groups.reduce((a, g) => a + g.value, 0)

  function drill(label: string) {
    if (label && label !== '—')
      navigate(`/eventos?${drillParam}=${encodeURIComponent(label)}`)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title} · {metricLabel} (top {topN})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <HorizontalRankBar
              data={groups.slice(0, topN).map((g) => ({
                label: g.label,
                value: g.value,
              }))}
              onClickBar={drill}
              height={Math.max(240, Math.min(topN, groups.length) * 26)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{title}</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Receita BT</TableHead>
                  <TableHead className="text-right">{metricLabel}</TableHead>
                  <TableHead className="text-right">% do total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : groups.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Sem dados para o período.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell>
                        <button
                          className="text-left font-medium hover:text-primary hover:underline"
                          onClick={() => drill(g.label)}
                        >
                          {g.label}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(g.vendas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(g.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(g.receitaBt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(g.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(total > 0 ? g.value / total : 0)}
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
