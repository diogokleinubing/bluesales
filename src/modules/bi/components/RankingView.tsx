import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { GroupAgg } from '../lib/aggregate'
import { RankingEventRows, type EventSortRef } from './BiEventsList'
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
type SortCol = 'label' | 'desde' | 'cidade' | 'uf' | 'eventos' | 'gmv' | 'pct' | 'gmvPrev' | 'delta'

export function RankingView({
  title,
  groups,
  metricLabel,
  drillParam,
  loading,
  crmLink = false,
  compare = false,
  desde,
  showCidadeUf = false,
}: {
  title: string
  groups: GroupAgg[]
  metricLabel: string
  drillParam: string
  loading?: boolean
  crmLink?: boolean
  compare?: boolean
  /** Resolve o ano "cliente desde" pelo label. Quando definido, exibe a coluna "Desde". */
  desde?: ((label: string) => number | null) | null
  /** Exibe colunas Cidade e UF (dimensão local). */
  showCidadeUf?: boolean
}) {
  const navigate = useNavigate()
  const totalGmv = groups.reduce((a, g) => a + g.gmv, 0)
  const totalEventos = groups.reduce((a, g) => a + g.eventos, 0)
  const totalGmvPrev = groups.reduce((a, g) => a + (g.gmvPrev ?? 0), 0)
  const maxValue = groups.reduce((m, g) => Math.max(m, g.value), 0)
  const showDesde = !!desde
  const cols =
    5 + (showDesde ? 1 : 0) + (showCidadeUf ? 2 : 0) + (compare ? 2 : 0) + (crmLink ? 1 : 0)

  // Ordenação por clique no cabeçalho: asc -> desc -> volta ao padrão (métrica).
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (col: SortCol) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'desc' } : s.dir === 'desc' ? { col, dir: 'asc' } : null))
  const deltaOf = (g: GroupAgg) =>
    g.gmvPrev && g.gmvPrev !== 0 ? (g.gmv - g.gmvPrev) / Math.abs(g.gmvPrev) : -Infinity
  const sortedGroups = useMemo(() => {
    if (!sort) return groups
    const arr = [...groups]
    arr.sort((a, b) => {
      let r: number
      if (sort.col === 'label') r = a.label.localeCompare(b.label)
      else if (sort.col === 'cidade') r = (a.cidade ?? '').localeCompare(b.cidade ?? '')
      else if (sort.col === 'uf') r = (a.uf ?? '').localeCompare(b.uf ?? '')
      else {
        const va = sort.col === 'desde' ? (desde?.(a.label) ?? -Infinity)
          : sort.col === 'eventos' ? a.eventos
          : sort.col === 'gmvPrev' ? (a.gmvPrev ?? -Infinity)
          : sort.col === 'delta' ? deltaOf(a)
          : a.gmv // gmv e pct
        const vb = sort.col === 'desde' ? (desde?.(b.label) ?? -Infinity)
          : sort.col === 'eventos' ? b.eventos
          : sort.col === 'gmvPrev' ? (b.gmvPrev ?? -Infinity)
          : sort.col === 'delta' ? deltaOf(b)
          : b.gmv
        r = va - vb
      }
      return sort.dir === 'asc' ? r : -r
    })
    return arr
  }, [groups, sort, desde])

  // Seleção de células para somatório em tempo real (estilo planilha):
  // clique = só ela; shift = intervalo a partir da âncora; ctrl/cmd = alterna avulsa.
  // GMV e % do total têm seleções INDEPENDENTES.
  function computeSel(
    e: React.MouseEvent, idx: number, key: string, sel: Set<string>, anchor: string | null,
  ): { sel: Set<string>; anchor: string | null } {
    if (e.shiftKey) {
      e.preventDefault()
      const aIdx = anchor ? sortedGroups.findIndex((g) => g.key === anchor) : -1
      const start = aIdx >= 0 ? aIdx : idx
      const lo = Math.min(start, idx)
      const hi = Math.max(start, idx)
      return { sel: new Set(sortedGroups.slice(lo, hi + 1).map((g) => g.key)), anchor: aIdx < 0 ? key : anchor }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(sel)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { sel: next, anchor: key }
    }
    return { sel: new Set([key]), anchor: key }
  }
  const [selGmv, setSelGmv] = useState<Set<string>>(new Set())
  const [anchorGmv, setAnchorGmv] = useState<string | null>(null)
  function onGmvClick(idx: number, key: string, e: React.MouseEvent) {
    const r = computeSel(e, idx, key, selGmv, anchorGmv)
    setSelGmv(r.sel); setAnchorGmv(r.anchor)
  }
  const selGmvSum = sortedGroups.filter((g) => selGmv.has(g.key)).reduce((a, g) => a + g.gmv, 0)
  function limparSel() {
    setSelGmv(new Set()); setAnchorGmv(null)
  }

  // Expansão inline: mostra os eventos do item (lazy). Clica no nome ou na seta.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const SortHead = ({ col, children, right }: { col: SortCol; children: React.ReactNode; right?: boolean }) => (
    <TableHead className={right ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', sort?.col === col && 'text-foreground font-medium')}
      >
        {children}
        {sort?.col === col
          ? (sort.dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  )

  const expandSort: EventSortRef = sort

  function openCrm(label: string) {
    if (label && label !== '—') navigate(contaComercialRoute(label))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead col="label">{title}</SortHead>
                  {showCidadeUf && <SortHead col="cidade">Cidade</SortHead>}
                  {showCidadeUf && <SortHead col="uf">UF</SortHead>}
                  {showDesde && <SortHead col="desde" right>Desde</SortHead>}
                  <SortHead col="eventos" right>Eventos</SortHead>
                  <SortHead col="gmv" right>GMV</SortHead>
                  <SortHead col="pct" right>% do total</SortHead>
                  <TableHead className="w-[250px]">Proporção</TableHead>
                  {compare && (
                    <>
                      <SortHead col="gmvPrev" right>GMV ano ant.</SortHead>
                      <SortHead col="delta" right>Δ%</SortHead>
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
                  sortedGroups.map((g, idx) => (
                    <Fragment key={g.key}>
                    <TableRow>
                      <TableCell
                        onClick={() => toggleExpand(g.key)}
                        className="cursor-pointer select-none"
                        title="Ver eventos"
                      >
                        <div className="flex items-center gap-1.5 font-medium hover:text-primary">
                          {expanded.has(g.key)
                            ? <ChevronDown className="size-4 shrink-0 opacity-60" />
                            : <ChevronRight className="size-4 shrink-0 opacity-60" />}
                          <span>{g.label}</span>
                        </div>
                      </TableCell>
                      {showCidadeUf && (
                        <TableCell className="text-muted-foreground">{g.cidade ?? '—'}</TableCell>
                      )}
                      {showCidadeUf && (
                        <TableCell className="text-muted-foreground">{g.uf ?? '—'}</TableCell>
                      )}
                      {showDesde && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {desde?.(g.label) ?? '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(g.eventos)}
                      </TableCell>
                      <TableCell
                        onClick={(e) => onGmvClick(idx, g.key, e)}
                        className={cn(
                          'cursor-pointer select-none text-right tabular-nums',
                          selGmv.has(g.key) && 'bg-primary/15 ring-1 ring-inset ring-primary/40',
                        )}
                        title="Clique para somar · Shift = intervalo · Ctrl/Cmd = avulsas"
                      >
                        {fmtBRL(g.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(totalGmv > 0 ? g.gmv / totalGmv : 0)}
                      </TableCell>
                      <TableCell className="w-[250px]">
                        <div
                          className="h-2.5 rounded-sm bg-primary"
                          title={`${metricLabel}: ${fmtBRL(g.value)}`}
                          style={{ width: `${maxValue > 0 ? Math.max(2, (g.value / maxValue) * 250) : 0}px` }}
                        />
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
                    {expanded.has(g.key) && (
                      <RankingEventRows
                        dim={drillParam}
                        value={g.label}
                        sort={expandSort}
                        layout={{ showCidadeUf, showDesde, compare, crmLink, cols }}
                      />
                    )}
                    </Fragment>
                  ))
                )}
                {!loading && groups.length > 0 && (
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total ({groups.length})</TableCell>
                    {showCidadeUf && <TableCell />}
                    {showCidadeUf && <TableCell />}
                    {showDesde && <TableCell />}
                    <TableCell className="text-right tabular-nums">
                      {fmtInt(totalEventos)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL(totalGmv)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtPct(1)}
                    </TableCell>
                    <TableCell />
                    {compare && (
                      <>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtBRL(totalGmvPrev)}
                        </TableCell>
                        <DeltaCell cur={totalGmv} prev={totalGmvPrev} />
                      </>
                    )}
                    {crmLink && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selGmv.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm text-muted-foreground">{selGmv.size} célula(s) · GMV</span>
          <span className="font-semibold tabular-nums">{fmtBRL(selGmvSum)}</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmtPct(totalGmv > 0 ? selGmvSum / totalGmv : 0)} do total
          </span>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={limparSel}
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  )
}
