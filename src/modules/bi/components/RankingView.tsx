import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
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
import { contaComercialRoute } from '@/modules/shared/navigation'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

/** Variação percentual (atual vs anterior), com sinal e cor. */
function DeltaCell({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (prev == null) return <TableCell className="text-right text-muted-foreground">—</TableCell>
  if (prev === 0) {
    return (
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {cur > 0 ? 'novo' : '—'}
      </TableCell>
    )
  }
  const d = (cur - prev) / Math.abs(prev)
  const cls = d > 0 ? 'text-[var(--success)]' : d < 0 ? 'text-destructive' : 'text-muted-foreground'
  return (
    <TableCell className={`text-right tabular-nums ${cls}`}>
      {d > 0 ? '+' : ''}
      {fmtPct(d)}
    </TableCell>
  )
}

/**
 * Ranking genérico (barras + tabela) com drill-down para Eventos.
 * `drillParam` é o nome do parâmetro na querystring (ex.: 'organizador').
 * `crmLink` adiciona, por linha, um atalho "Ver no Comercial" (ponte BI->CRM).
 * `compare` exibe colunas de comparativo com o ano anterior (gmvPrev).
 */
export function RankingView({
  title,
  groups,
  metricLabel,
  drillParam,
  loading,
  topN = 15,
  crmLink = false,
  compare = false,
}: {
  title: string
  groups: GroupAgg[]
  metricLabel: string
  drillParam: string
  loading?: boolean
  topN?: number
  crmLink?: boolean
  compare?: boolean
}) {
  const navigate = useNavigate()
  const totalGmv = groups.reduce((a, g) => a + g.gmv, 0)
  const cols = 5 + (compare ? 2 : 0) + (crmLink ? 1 : 0)

  function drill(label: string) {
    if (label && label !== '—')
      navigate(`/bi/eventos?${drillParam}=${encodeURIComponent(label)}`)
  }

  function openCrm(label: string) {
    if (label && label !== '—') navigate(contaComercialRoute(label))
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
                  <TableHead className="text-right">GMV Total</TableHead>
                  <TableHead className="text-right">GMV On-Line</TableHead>
                  <TableHead className="text-right">% do total</TableHead>
                  {compare && (
                    <>
                      <TableHead className="text-right">GMV ano ant.</TableHead>
                      <TableHead className="text-right">Δ%</TableHead>
                    </>
                  )}
                  {crmLink && <TableHead className="text-right">Comercial</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={cols}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
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
                        {fmtBRL(g.gmvOnline)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(totalGmv > 0 ? g.gmv / totalGmv : 0)}
                      </TableCell>
                      {compare && (
                        <>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {g.gmvPrev == null ? '—' : fmtBRL(g.gmvPrev)}
                          </TableCell>
                          <DeltaCell cur={g.gmv} prev={g.gmvPrev} />
                        </>
                      )}
                      {crmLink && (
                        <TableCell className="text-right">
                          <button
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                            onClick={() => openCrm(g.label)}
                            title="Ver no Comercial"
                          >
                            <ExternalLink className="size-3.5" />
                            Ver no Comercial
                          </button>
                        </TableCell>
                      )}
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
