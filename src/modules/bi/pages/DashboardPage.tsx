import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '../components/KpiCard'
import {
  CompositionDonut,
  HorizontalRankBar,
  MonthlyBarChart,
} from '../components/charts'
import { useDashboard } from '../hooks/useDashboard'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt, fmtPct, fmtShort } from '@/lib/format'

export function DashboardPage() {
  const { year, metric } = useControls()
  const navigate = useNavigate()
  const {
    kpis,
    delta,
    monthly,
    composition,
    topEvents,
    segments,
    isLoading,
    isError,
    error,
  } = useDashboard()

  const metricLabel = METRIC_LABELS[metric]
  const empty = !isLoading && kpis.vendas === 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral de {year}. Comparativo vs {year - 1}.
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
            <KpiCard
              label="Receita BT"
              value={fmtBRL(kpis.receitaBt)}
              delta={delta.receitaBt}
              sub={`Take ${fmtPct(kpis.takeRate)}`}
              loading={isLoading}
            />
            <KpiCard label="Receita Líquida" value={fmtBRL(kpis.receitaLiq)} delta={delta.receitaLiq} loading={isLoading} />
            <KpiCard label="Vendas" value={fmtInt(kpis.vendas)} delta={delta.vendas} loading={isLoading} />
            <KpiCard label="Eventos" value={fmtInt(kpis.eventos)} delta={delta.eventos} loading={isLoading} />
            <KpiCard label="Ticket Médio" value={fmtBRL(kpis.ticketMedio)} delta={delta.ticketMedio} loading={isLoading} />
            <KpiCard label="MDR" value={fmtBRL(kpis.mdr)} delta={delta.mdr} invertDelta loading={isLoading} />
            <KpiCard label="Rebate" value={fmtBRL(kpis.rebate)} delta={delta.rebate} invertDelta loading={isLoading} />
          </div>

          {/* Gráficos principais */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={`${metricLabel} por mês`}>
              {isLoading ? <ChartSkeleton /> : <MonthlyBarChart data={monthly} metricLabel={metricLabel} />}
            </ChartCard>
            <ChartCard title="Composição da Receita BT">
              {isLoading ? <ChartSkeleton /> : <CompositionDonut data={composition} />}
            </ChartCard>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={`Top 10 eventos · ${metricLabel}`}>
              {isLoading ? (
                <ChartSkeleton />
              ) : (
                <HorizontalRankBar
                  data={topEvents.map((e) => ({
                    label: e.nome ?? e.codigo_evento,
                    value: e.value,
                  }))}
                  onClickBar={(label) => {
                    const ev = topEvents.find(
                      (e) => (e.nome ?? e.codigo_evento) === label,
                    )
                    if (ev)
                      navigate(
                        `/eventos?codigo=${encodeURIComponent(ev.codigo_evento)}`,
                      )
                  }}
                />
              )}
            </ChartCard>
            <ChartCard title={`Distribuição por segmento · ${metricLabel}`}>
              {isLoading ? (
                <ChartSkeleton />
              ) : (
                <HorizontalRankBar
                  data={segments.slice(0, 10).map((s) => ({
                    label: s.label,
                    value: s.value,
                  }))}
                  onClickBar={(label) =>
                    navigate(`/eventos?segmento=${encodeURIComponent(label)}`)
                  }
                />
              )}
            </ChartCard>
          </div>

          <p className="text-right text-xs text-muted-foreground">
            Métrica: {metricLabel} · {fmtShort(kpis.gmv)} GMV no período
          </p>
        </>
      )}
    </div>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ChartSkeleton() {
  return <Skeleton className="h-[280px] w-full" />
}
