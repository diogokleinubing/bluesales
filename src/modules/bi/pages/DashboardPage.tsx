import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '../components/KpiCard'
import { MultiBarChart } from '../components/charts'
import { CompareToggle } from '../components/CompareToggle'
import { useDashboard } from '../hooks/useDashboard'
import { useControls } from '@/modules/shared/controls-context'
import { fmtBRL, fmtInt } from '@/lib/format'

export function DashboardPage() {
  const { year } = useControls()
  const [compare, setCompare] = useState(false)
  const { kpis, delta, monthly, isLoading, isError, error } = useDashboard()

  const empty = !isLoading && kpis.vendas === 0
  const curYear = String(year)
  const prevYear = String(year - 1)

  // Série para o gráfico (rótulos das séries = anos).
  const chartData = useMemo(
    () =>
      monthly.map((m) => ({
        month: m.month,
        [curYear]: m.gmv,
        ...(compare ? { [prevYear]: m.gmvPrev } : {}),
      })),
    [monthly, compare, curYear, prevYear],
  )
  const series = compare ? [curYear, prevYear] : [curYear]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral de {year}. Comparativo vs {year - 1} até o último mês com
          vendas.
        </p>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Erro ao carregar dados: {(error as Error)?.message}
          </CardContent>
        </Card>
      )}

      {empty && !isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma venda encontrada para {year} com os filtros atuais. Importe
            uma base ou ajuste os controles.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="GMV" value={fmtBRL(kpis.gmv)} delta={delta.gmv} loading={isLoading} />
            <KpiCard label="Vendas" value={fmtInt(kpis.vendas)} delta={delta.vendas} loading={isLoading} />
            <KpiCard label="Eventos" value={fmtInt(kpis.eventos)} delta={delta.eventos} loading={isLoading} />
            <KpiCard label="Ticket Médio" value={fmtBRL(kpis.ticketMedio)} delta={delta.ticketMedio} loading={isLoading} />
          </div>

          {/* GMV por mês (com comparativo opcional) */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                GMV por mês
              </CardTitle>
              <CompareToggle checked={compare} onChange={setCompare} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <MultiBarChart data={chartData} series={series} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
