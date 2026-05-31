import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GmvReceitaCombo } from '../components/charts'
import { MONTH_LABELS } from '../components/chart-theme'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import { filterSales } from '../lib/metrics'
import { monthlySeries } from '../lib/aggregate'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

export function MensalPage() {
  const { sales, isLoading } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()

  const monthly = useMemo(() => {
    const cur = filterSales(sales, { pdv, year, dateBase })
    return monthlySeries(cur, dateBase, metric)
  }, [sales, year, metric, dateBase, pdv])

  const totals = useMemo(
    () =>
      monthly.reduce(
        (a, m) => ({
          vendas: a.vendas + m.vendas,
          gmv: a.gmv + m.gmv,
          receitaBt: a.receitaBt + m.receitaBt,
          mdr: a.mdr + m.mdr,
          rebate: a.rebate + m.rebate,
          receitaLiq: a.receitaLiq + m.receitaLiq,
        }),
        { vendas: 0, gmv: 0, receitaBt: 0, mdr: 0, rebate: 0, receitaLiq: 0 },
      ),
    [monthly],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensal</h1>
        <p className="text-sm text-muted-foreground">
          Evolução mês a mês de {year}.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            GMV (barras) + Receita BT (linha)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <GmvReceitaCombo data={monthly} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Receita BT</TableHead>
                  <TableHead className="text-right">Take</TableHead>
                  <TableHead className="text-right">MDR</TableHead>
                  <TableHead className="text-right">Rebate</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">
                        {MONTH_LABELS[m.month]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(m.vendas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(m.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(m.receitaBt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(m.gmv > 0 ? m.receitaBt / m.gmv : 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(m.mdr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(m.rebate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(m.receitaLiq)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {!isLoading && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtInt(totals.vendas)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(totals.gmv)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(totals.receitaBt)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-muted-foreground">
                      {fmtPct(
                        totals.gmv > 0 ? totals.receitaBt / totals.gmv : 0,
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(totals.mdr)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(totals.rebate)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(totals.receitaLiq)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
