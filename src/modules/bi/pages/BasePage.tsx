import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Download,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDefaultOrg } from '@/lib/org'
import { useBiBase } from '../hooks/useBi'
import { useReclassify } from '../hooks/useReclassify'
import { deleteYearData } from '../lib/base-api'
import { pruneRollupYear } from '../lib/rpc'
import { exportToXlsx } from '../lib/export'
import { fmtBRL, fmtInt } from '@/lib/format'

export function BasePage() {
  const org = useDefaultOrg()
  const orgId = org.data?.id
  const base = useBiBase()
  const reclassify = useReclassify(orgId)
  const qc = useQueryClient()
  const [busyYear, setBusyYear] = useState<number | null>(null)

  const years = base.data?.years ?? []
  const totals = base.data?.totals ?? { qtd: 0, eventos: 0, gmv: 0 }

  async function handleDeleteYear(year: number) {
    if (!orgId) return
    if (
      !window.confirm(
        `Apagar TODAS as vendas de ${year}? Esta ação não pode ser desfeita.`,
      )
    )
      return
    setBusyYear(year)
    try {
      await deleteYearData(orgId, year)
      await pruneRollupYear(orgId, year)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success(`Vendas de ${year} apagadas.`)
    } catch (e) {
      toast.error('Erro ao apagar', { description: (e as Error).message })
    } finally {
      setBusyYear(null)
    }
  }

  async function handleExport() {
    try {
      await exportToXlsx('blueticket-base', [
        {
          name: 'Resumo por ano',
          rows: years.map((y) => ({
            Ano: y.year,
            Vendas: Number(y.qtd),
            GMV: Number(y.gmv),
          })),
        },
      ])
    } catch (e) {
      toast.error('Erro ao exportar', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Armazenamento/Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Status e gestão da base de dados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => reclassify.mutate()}
            disabled={reclassify.isPending}
          >
            <RefreshCw
              className={`size-4 ${reclassify.isPending ? 'animate-spin' : ''}`}
            />
            Reclassificar segmentos
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={years.length === 0}
          >
            <Download className="size-4" /> Exportar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {base.isError ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-[var(--success)]" />
            )}
            Conexão Supabase
          </CardTitle>
          <CardDescription>
            Organização ativa (multi-tenant futuro)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {org.isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : base.isError ? (
            <p className="text-sm text-destructive">
              Falha: {(base.error as Error)?.message}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{org.data?.nome}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {org.data?.id}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Vendas" value={fmtInt(Number(totals.qtd))} loading={base.isLoading} />
        <Stat label="Eventos" value={fmtInt(Number(totals.eventos))} loading={base.isLoading} />
        <Stat label="GMV total" value={fmtBRL(Number(totals.gmv))} loading={base.isLoading} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Gestão por ano
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ano</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">GMV</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {base.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ) : years.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Base vazia. Importe uma planilha na tela de Importação.
                  </TableCell>
                </TableRow>
              ) : (
                years.map((y) => (
                  <TableRow key={y.year}>
                    <TableCell className="font-medium">{y.year}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtInt(Number(y.qtd))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL(Number(y.gmv))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busyYear === y.year}
                        onClick={() => handleDeleteYear(y.year)}
                      >
                        <Trash2 className="size-4" />
                        Apagar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  loading,
}: {
  label: string
  value: string
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-semibold">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}
