import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  biPaymentsGroup,
  biParcelamento,
  metricOf,
  type PaymentDim,
  type PaymentJuros,
  type ParcelamentoDim,
  type ParcelamentoRow,
} from '../lib/rpc'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

const FORMA_LABELS: Record<string, string> = {
  CC: 'Cartão de crédito',
  CD: 'Cartão de débito',
  PIX: 'Pix',
  BB: 'Boleto bancário',
  MP: 'Múltiplos pagamentos',
  PN: 'Painel',
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
  const { year, metric, pdv, months } = useControls()
  const [juros, setJuros] = useState<PaymentJuros>('all')
  // O filtro de juros só faz sentido na visão de parcelas.
  const jurosArg: PaymentJuros = dim === 'parcelas' ? juros : 'all'

  const query = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'payments', orgId, year, pdv, dim, jurosArg, months],
    queryFn: () => biPaymentsGroup(orgId!, year, pdv, dim, jurosArg, months),
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
  const totalVendas = rows.reduce((a, r) => a + r.vendas, 0)
  const totalGmv = rows.reduce((a, r) => a + r.gmv, 0)
  const loading = query.isLoading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {metricLabel} por {labelDim(dim)}
          </CardTitle>
          {dim === 'parcelas' && (
            <Select value={juros} onValueChange={(v) => setJuros(v as PaymentJuros)}>
              <SelectTrigger className="h-8 w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="com">Com juros</SelectItem>
                <SelectItem value="sem">Sem juros</SelectItem>
              </SelectContent>
            </Select>
          )}
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
                  <TableHead className="text-right">Qtd. Vendas</TableHead>
                  <TableHead className="text-right">% Qtd.</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">% GMV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(totalVendas > 0 ? r.vendas / totalVendas : 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(totalGmv > 0 ? r.gmv / totalGmv : 0)}
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

// ---------------------------------------------------------------------------
// Parcelamento com juros (vendas com valor_juros > 0)
// ---------------------------------------------------------------------------
const PARCEL_DIM_LABEL: Record<ParcelamentoDim, string> = {
  organizador: 'Organizador',
  uf: 'Estado (UF)',
  evento: 'Evento',
}

type ParcelSortCol = 'nome' | 'parcelas' | 'juros' | 'gmv' | 'pct'
type ParcelSort = { col: ParcelSortCol; dir: 'asc' | 'desc' } | null

function parcelPct(r: { receita_juros: number; gmv: number }) {
  return Number(r.gmv) > 0 ? Number(r.receita_juros) / Number(r.gmv) : 0
}

/** Ordena as linhas de parcelamento (mesma regra p/ agregadores e filhos). */
function sortParcelRows(rows: ParcelamentoRow[], sort: ParcelSort): ParcelamentoRow[] {
  if (!sort) return rows
  const arr = [...rows]
  arr.sort((a, b) => {
    let r: number
    if (sort.col === 'nome') r = a.nome.localeCompare(b.nome, 'pt-BR')
    else {
      const v = (x: ParcelamentoRow) =>
        sort.col === 'parcelas' ? (x.parcelas_media != null ? Number(x.parcelas_media) : -Infinity)
          : sort.col === 'juros' ? Number(x.receita_juros)
          : sort.col === 'pct' ? parcelPct(x)
          : Number(x.gmv)
      r = v(a) - v(b)
    }
    return sort.dir === 'asc' ? r : -r
  })
  return arr
}

function ParcelamentoTable({ dim }: { dim: ParcelamentoDim }) {
  const orgId = useOrgId()
  const { year, pdv, months } = useControls()
  const limit = dim === 'evento' ? 100 : null

  const query = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'parcelamento', orgId, year, pdv, dim, months, limit],
    queryFn: () => biParcelamento(orgId!, year, pdv, dim, months, limit),
  })
  const rows = query.data ?? []
  const loading = query.isLoading
  const totalJuros = rows.reduce((a, r) => a + Number(r.receita_juros), 0)
  const totalGmv = rows.reduce((a, r) => a + Number(r.gmv), 0)

  // Ordenação por clique no cabeçalho: desc -> asc -> volta ao padrão (GMV desc).
  const pctOf = (r: { receita_juros: number; gmv: number }) =>
    Number(r.gmv) > 0 ? Number(r.receita_juros) / Number(r.gmv) : 0
  const [sort, setSort] = useState<{ col: ParcelSortCol; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (col: ParcelSortCol) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'desc' } : s.dir === 'desc' ? { col, dir: 'asc' } : null))
  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      let r: number
      if (sort.col === 'nome') r = a.nome.localeCompare(b.nome, 'pt-BR')
      else {
        const v = (x: typeof a) =>
          sort.col === 'parcelas' ? (x.parcelas_media != null ? Number(x.parcelas_media) : -Infinity)
            : sort.col === 'juros' ? Number(x.receita_juros)
            : sort.col === 'pct' ? pctOf(x)
            : Number(x.gmv)
        r = v(a) - v(b)
      }
      return sort.dir === 'asc' ? r : -r
    })
    return arr
  }, [rows, sort])

  const SortHead = ({ col, children, right }: { col: ParcelSortCol; children: React.ReactNode; right?: boolean }) => (
    <TableHead className={right ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', right && 'flex-row-reverse', sort?.col === col && 'font-medium text-foreground')}
      >
        {children}
        {sort?.col === col
          ? (sort.dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  )

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="nome">{PARCEL_DIM_LABEL[dim]}</SortHead>
                <SortHead col="parcelas" right>Qtd. Parcelas (média)</SortHead>
                <SortHead col="juros" right>Receita Juros</SortHead>
                <SortHead col="gmv" right>GMV</SortHead>
                <SortHead col="pct" right>% Juros</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Sem vendas com juros no período.
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((r, i) => (
                  <TableRow key={`${r.nome}-${i}`}>
                    <TableCell className="max-w-[420px] truncate font-medium" title={r.nome}>{r.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.parcelas_media != null ? Number(r.parcelas_media).toFixed(1).replace('.', ',') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(r.receita_juros))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(r.gmv))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtPct(Number(r.gmv) > 0 ? Number(r.receita_juros) / Number(r.gmv) : 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!loading && rows.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total ({rows.length})</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{fmtBRL(totalJuros)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(totalGmv)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtPct(totalGmv > 0 ? totalJuros / totalGmv : 0)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/** As 4 células de métricas (parcelas, juros, GMV, % juros) de uma linha. */
function ParcelMetricCells({ r }: { r: ParcelamentoRow }) {
  const gmv = Number(r.gmv)
  return (
    <>
      <TableCell className="text-right tabular-nums">
        {r.parcelas_media != null ? Number(r.parcelas_media).toFixed(1).replace('.', ',') : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtBRL(Number(r.receita_juros))}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtBRL(gmv)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtPct(gmv > 0 ? Number(r.receita_juros) / gmv : 0)}
      </TableCell>
    </>
  )
}

/** Linhas dos eventos dentro de um organizador/UF (carregadas ao expandir). */
function ParcelamentoChildRows({ dim, parent, sort }: { dim: 'organizador' | 'uf'; parent: string; sort: ParcelSort }) {
  const orgId = useOrgId()
  const { year, pdv, months } = useControls()
  const q = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'parcelamento-child', orgId, year, pdv, dim, parent, months],
    queryFn: () =>
      biParcelamento(orgId!, year, pdv, 'evento', months, null,
        dim === 'organizador' ? { organizador: parent } : { uf: parent }),
  })
  if (q.isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="py-3 pl-10 text-sm text-muted-foreground">Carregando eventos…</TableCell>
      </TableRow>
    )
  }
  const evs = sortParcelRows(q.data ?? [], sort)
  if (evs.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="py-3 pl-10 text-sm text-muted-foreground">Sem eventos com juros.</TableCell>
      </TableRow>
    )
  }
  return (
    <>
      {evs.map((ev, i) => (
        <TableRow key={`${ev.nome}-${i}`}>
          <TableCell className="truncate pl-10 text-muted-foreground" title={ev.nome}>{ev.nome}</TableCell>
          <ParcelMetricCells r={ev} />
        </TableRow>
      ))}
    </>
  )
}

/** Tabela agregadora (Organizador / UF) com linhas expansíveis. */
function ParcelamentoAgg({ dim }: { dim: 'organizador' | 'uf' }) {
  const orgId = useOrgId()
  const { year, pdv, months } = useControls()
  const query = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'parcelamento', orgId, year, pdv, dim, months],
    queryFn: () => biParcelamento(orgId!, year, pdv, dim, months, null),
  })
  const rows = query.data ?? []
  const loading = query.isLoading
  const totalJuros = rows.reduce((a, r) => a + Number(r.receita_juros), 0)
  const totalGmv = rows.reduce((a, r) => a + Number(r.gmv), 0)

  const [sort, setSort] = useState<ParcelSort>(null)
  const toggleSort = (col: ParcelSortCol) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'desc' } : s.dir === 'desc' ? { col, dir: 'asc' } : null))
  const sortedRows = useMemo(() => sortParcelRows(rows, sort), [rows, sort])

  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleOpen = (n: string) =>
    setOpen((p) => { const s = new Set(p); if (s.has(n)) s.delete(n); else s.add(n); return s })

  const SortHead = ({ col, children, right }: { col: ParcelSortCol; children: React.ReactNode; right?: boolean }) => (
    <TableHead className={right ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', right && 'flex-row-reverse', sort?.col === col && 'font-medium text-foreground')}
      >
        {children}
        {sort?.col === col
          ? (sort.dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  )

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="nome">{PARCEL_DIM_LABEL[dim]}</SortHead>
                <SortHead col="parcelas" right>Qtd. Parcelas (média)</SortHead>
                <SortHead col="juros" right>Receita Juros</SortHead>
                <SortHead col="gmv" right>GMV</SortHead>
                <SortHead col="pct" right>% Juros</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sem vendas com juros no período.</TableCell>
                </TableRow>
              ) : (
                sortedRows.map((r) => (
                  <Fragment key={r.nome}>
                    <TableRow className="cursor-pointer bg-muted/20 font-medium hover:bg-muted/40" onClick={() => toggleOpen(r.nome)}>
                      <TableCell className="truncate" title={r.nome}>
                        <span className="inline-flex items-center gap-1.5">
                          {open.has(r.nome) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          {r.nome}
                        </span>
                      </TableCell>
                      <ParcelMetricCells r={r} />
                    </TableRow>
                    {open.has(r.nome) && <ParcelamentoChildRows dim={dim} parent={r.nome} sort={sort} />}
                  </Fragment>
                ))
              )}
              {!loading && rows.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total ({rows.length})</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{fmtBRL(totalJuros)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(totalGmv)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtPct(totalGmv > 0 ? totalJuros / totalGmv : 0)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function ParcelamentoView() {
  return (
    <Tabs defaultValue="organizador">
      <TabsList>
        <TabsTrigger value="organizador">Por Organizador</TabsTrigger>
        <TabsTrigger value="uf">Estado do Evento</TabsTrigger>
        <TabsTrigger value="evento">Evento (top 100 GMV)</TabsTrigger>
      </TabsList>
      <TabsContent value="organizador" className="mt-4"><ParcelamentoAgg dim="organizador" /></TabsContent>
      <TabsContent value="uf" className="mt-4"><ParcelamentoAgg dim="uf" /></TabsContent>
      <TabsContent value="evento" className="mt-4"><ParcelamentoTable dim="evento" /></TabsContent>
    </Tabs>
  )
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
          <TabsTrigger value="parcelamento">Parcelamento com Juros</TabsTrigger>
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
        <TabsContent value="parcelamento" className="mt-4">
          <ParcelamentoView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
