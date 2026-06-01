import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { HorizontalRankBar } from '../components/charts'
import { useOrgId } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { biPaymentsGroup, metricOf, type PaymentDim } from '../lib/rpc'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

const FORMA_LABELS: Record<string, string> = {
  CC: 'Cartão de crédito',
  CD: 'Cartão de débito',
  PIX: 'Pix',
  BB: 'Boleto bancário',
  NA: 'Não informado',
}

interface Row {
  key: string
  label: string
  value: number
  gmv: number
  receitaBt: number
  vendas: number
}

function PaymentView({ dim }: { dim: PaymentDim }) {
  const orgId = useOrgId()
  const { year, metric, pdv } = useControls()

  const query = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'payments', orgId, year, pdv, dim],
    queryFn: () => biPaymentsGroup(orgId!, year, pdv, dim),
  })

  const rows = useMemo<Row[]>(() => {
    const mapped = (query.data ?? []).map((r) => {
      const raw = r.key ?? 'NA'
      let label = raw
      if (dim === 'forma') label = FORMA_LABELS[raw] ?? raw
      else if (dim === 'parcelas')
        label = raw === '0' ? 'Não informado' : `${raw}x`
      else label = raw === 'NA' ? 'Não informado' : raw
      return {
        key: raw,
        label,
        value: metricOf(r, metric),
        gmv: Number(r.gmv),
        receitaBt: Number(r.receita_bt),
        vendas: Number(r.qtd),
      }
    })
    // Parcelas: ordena numérico crescente; demais: por valor desc.
    if (dim === 'parcelas') {
      return mapped.sort((a, b) => Number(a.key) - Number(b.key))
    }
    return mapped.sort((a, b) => b.value - a.value)
  }, [query.data, metric, dim])

  const metricLabel = METRIC_LABELS[metric]
  const total = rows.reduce((a, r) => a + r.value, 0)
  const loading = query.isLoading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {metricLabel} por {labelDim(dim)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados de pagamento no período. Importe vendas com as colunas
              forma de pagamento, parcelas e operadora.
            </p>
          ) : (
            <HorizontalRankBar
              data={rows.slice(0, 20).map((r) => ({ label: r.label, value: r.value }))}
              height={Math.max(240, Math.min(rows.length, 20) * 26)}
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
                  <TableHead>{labelDim(dim)}</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Receita BT</TableHead>
                  <TableHead className="text-right">{metricLabel}</TableHead>
                  <TableHead className="text-right">% do total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Sem dados.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(r.vendas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.receitaBt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(total > 0 ? r.value / total : 0)}
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

function labelDim(dim: PaymentDim): string {
  return dim === 'forma'
    ? 'Forma de pagamento'
    : dim === 'operadora'
      ? 'Operadora'
      : 'Parcelas'
}

export function MeiosPagamentoPage() {
  const { year } = useControls()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meios de pagamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Análise das vendas de {year} por forma de pagamento, operadora e
          parcelas.
        </p>
      </div>

      <Tabs defaultValue="forma">
        <TabsList>
          <TabsTrigger value="forma">Forma de pagamento</TabsTrigger>
          <TabsTrigger value="operadora">Operadora</TabsTrigger>
          <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
        </TabsList>
        <TabsContent value="forma" className="mt-4">
          <PaymentView dim="forma" />
        </TabsContent>
        <TabsContent value="operadora" className="mt-4">
          <PaymentView dim="operadora" />
        </TabsContent>
        <TabsContent value="parcelas" className="mt-4">
          <PaymentView dim="parcelas" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
