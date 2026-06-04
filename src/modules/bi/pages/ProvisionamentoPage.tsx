import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KpiCard } from '../components/KpiCard'
import { useDefaultOrg } from '@/lib/org'
import { useControls } from '@/modules/shared/controls-context'
import { biProvStats, biMonthsElapsed, biProvOrgEvents } from '../lib/rpc'
import {
  buildWaterfall,
  OUTROS_KEY,
  type OrgStat,
  type ProvItem,
} from '../lib/provisioning'
import {
  deleteProvisioning,
  fetchProvisioning,
  upsertProvisioning,
} from '../lib/prov-api'
import type { ProvisioningRow, Status } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { fmtBRL0, fmtDate, fmtDelta } from '@/lib/format'

const TOP_OPTIONS = [20, 50, 100, 0] // 0 = Todos

type SortKey = 'nome' | 'gmvBase' | 'ytdBase' | 'ytd' | 'baseYtg' | 'forecast' | 'pct'

function sortVal(it: ProvItem, k: SortKey): number | string {
  switch (k) {
    case 'nome': return it.nome
    case 'gmvBase': return it.gmvBase
    case 'ytdBase': return it.gmvBase - it.baseYtg
    case 'ytd': return it.ytd
    case 'baseYtg': return it.baseYtg
    case 'forecast': return it.forecast
    case 'pct': return it.gmvBase > 0 ? (it.forecast - it.gmvBase) / it.gmvBase : 0
  }
}
const MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
/** Formata uma string de dígitos como número agrupado pt-BR ("1.234.567"). */
function grpDigits(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d ? new Intl.NumberFormat('pt-BR').format(Number(d)) : ''
}

export function ProvisionamentoPage() {
  const org = useDefaultOrg()
  const orgId = org.data?.id
  const { year, dateBase, pdv } = useControls()
  const qc = useQueryClient()
  const targetYear = year
  const baseYear = year - 1
  const [topN, setTopN] = useState(20)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('gmvBase')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [breakdown, setBreakdown] = useState<{
    organizador: string
    year: number
    monthMin: number
    monthMax: number
    title: string
  } | null>(null)

  const breakdownQuery = useQuery({
    enabled: !!orgId && !!breakdown,
    staleTime: 5 * 60 * 1000,
    queryKey: [
      'bi', 'prov-events', orgId, breakdown?.organizador, breakdown?.year,
      breakdown?.monthMin, breakdown?.monthMax, dateBase, pdv,
    ],
    queryFn: () =>
      biProvOrgEvents(
        orgId!, breakdown!.organizador, breakdown!.year,
        breakdown!.monthMin, breakdown!.monthMax, dateBase, pdv,
      ),
  })

  const provQuery = useQuery({
    enabled: !!orgId,
    queryKey: ['provisioning', orgId, baseYear, targetYear],
    queryFn: () => fetchProvisioning(orgId!, baseYear, targetYear),
  })
  const persisted = useMemo(() => {
    const m = new Map<string, ProvisioningRow>()
    for (const r of provQuery.data ?? []) m.set(r.item_key, r)
    return m
  }, [provQuery.data])

  const statsQuery = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'prov', orgId, baseYear, targetYear, dateBase, pdv],
    queryFn: async () => {
      const [rows, months] = await Promise.all([
        biProvStats(orgId!, baseYear, targetYear, dateBase, pdv),
        biMonthsElapsed(orgId!, targetYear, dateBase, pdv),
      ])
      const stats: OrgStat[] = rows
        .map((r) => ({
          organizador: r.organizador,
          gmvBase: Number(r.gmv_base),
          ytd: Number(r.ytd),
          baseYtg: Number(r.base_ytg),
        }))
        .sort((a, b) => b.gmvBase - a.gmvBase)
      return { stats, monthsElapsed: months > 0 ? months : 12 }
    },
  })
  const stats = useMemo(() => statsQuery.data?.stats ?? [], [statsQuery.data])
  const monthsElapsed = statsQuery.data?.monthsElapsed ?? 12
  const ytgTooltip = `${baseYear} de ${MESES_LONGOS[Math.min(monthsElapsed, 11)]} a Dezembro`

  function openBase(it: ProvItem) {
    setBreakdown({ organizador: it.itemKey, year: baseYear, monthMin: 1, monthMax: 12, title: `${it.nome} · GMV ${baseYear}` })
  }
  function openYtdBase(it: ProvItem) {
    setBreakdown({ organizador: it.itemKey, year: baseYear, monthMin: 1, monthMax: monthsElapsed, title: `${it.nome} · YTD ${baseYear}` })
  }
  function openYtd(it: ProvItem) {
    setBreakdown({ organizador: it.itemKey, year: targetYear, monthMin: 1, monthMax: monthsElapsed, title: `${it.nome} · YTD ${targetYear}` })
  }
  function openYtg(it: ProvItem) {
    setBreakdown({ organizador: it.itemKey, year: baseYear, monthMin: monthsElapsed + 1, monthMax: 12, title: `${it.nome} · ${baseYear} YTG` })
  }

  const effectiveTop = topN === 0 ? stats.length : topN

  const items = useMemo<ProvItem[]>(() => {
    const top = stats.slice(0, effectiveTop)
    const rest = stats.slice(effectiveTop)

    const orgItems: ProvItem[] = top.map((s) => {
      const p = persisted.get(s.organizador)
      const manual = p?.forecast ?? null
      return {
        itemKey: s.organizador,
        nome: s.organizador,
        status: (p?.status as Status) ?? 'Ativo',
        gmvBase: s.gmvBase,
        ytd: s.ytd,
        baseYtg: s.baseYtg,
        forecast: manual ?? s.gmvBase, // padrão: faturamento do ano anterior
        forecastManual: manual,
        isNovo: false,
        isOutros: false,
      }
    })

    // Demais organizadores (agregado)
    if (rest.length > 0) {
      const agg = rest.reduce(
        (a, s) => ({
          gmvBase: a.gmvBase + s.gmvBase,
          ytd: a.ytd + s.ytd,
          baseYtg: a.baseYtg + s.baseYtg,
        }),
        { gmvBase: 0, ytd: 0, baseYtg: 0 },
      )
      const p = persisted.get(OUTROS_KEY)
      const manual = p?.forecast ?? null
      orgItems.push({
        itemKey: OUTROS_KEY,
        nome: `Demais organizadores (${rest.length})`,
        status: (p?.status as Status) ?? 'Ativo',
        gmvBase: agg.gmvBase,
        ytd: agg.ytd,
        baseYtg: agg.baseYtg,
        forecast: manual ?? agg.gmvBase,
        forecastManual: manual,
        isNovo: false,
        isOutros: true,
      })
    }

    // Novos clientes (persistidos com prefixo novo_)
    for (const r of provQuery.data ?? []) {
      if (!r.item_key.startsWith('novo_')) continue
      orgItems.push({
        itemKey: r.item_key,
        nome: r.nome ?? 'Novo cliente',
        status: 'Novo',
        gmvBase: 0,
        ytd: 0,
        baseYtg: 0,
        forecast: r.forecast ?? 0,
        forecastManual: r.forecast ?? null,
        isNovo: true,
        isOutros: false,
      })
    }

    return orgItems
  }, [stats, effectiveTop, persisted, provQuery.data])

  const totals = useMemo(() => {
    const { base, total } = buildWaterfall(items)
    return { base, total }
  }, [items])

  // "Demais organizadores" e "Novos" ficam fixos no fim; o resto é ordenável.
  const sortedItems = useMemo(() => {
    const pinned = items.filter((i) => i.isOutros || i.isNovo)
    const normal = items.filter((i) => !i.isOutros && !i.isNovo)
    normal.sort((a, b) => {
      const av = sortVal(a, sortKey)
      const bv = sortVal(b, sortKey)
      const cmp =
        typeof av === 'string' || typeof bv === 'string'
          ? String(av).localeCompare(String(bv), 'pt-BR')
          : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return [...normal, ...pinned]
  }, [items, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'nome' ? 'asc' : 'desc')
    }
  }

  function SortHead({
    k, align = 'left', children,
  }: {
    k: SortKey
    align?: 'left' | 'right'
    children: React.ReactNode
  }) {
    const active = sortKey === k
    return (
      <TableHead
        className={cn('cursor-pointer select-none whitespace-nowrap', align === 'right' && 'text-right')}
        onClick={() => toggleSort(k)}
      >
        <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse', active && 'text-foreground')}>
          {children}
          {active && (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </span>
      </TableHead>
    )
  }

  async function persist(
    itemKey: string,
    patch: { status?: Status; forecast?: number; nome?: string },
  ) {
    if (!orgId) return
    const current = persisted.get(itemKey)
    const item = items.find((i) => i.itemKey === itemKey)
    try {
      await upsertProvisioning({
        orgId,
        baseYear,
        targetYear,
        itemKey,
        nome: patch.nome ?? current?.nome ?? item?.nome ?? null,
        status: patch.status ?? (current?.status as Status) ?? item?.status ?? 'Ativo',
        forecast: patch.forecast ?? current?.forecast ?? item?.forecast ?? 0,
      })
      qc.invalidateQueries({
        queryKey: ['provisioning', orgId, baseYear, targetYear],
      })
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message })
    }
  }

  function commitForecast(item: ProvItem) {
    const raw = drafts[item.itemKey]
    if (raw == null) return
    const digits = raw.replace(/\D/g, '')
    // Vazio = mantém o padrão (faturamento do ano anterior); não persiste.
    if (digits !== '') {
      const val = Number(digits)
      if (Number.isFinite(val)) persist(item.itemKey, { forecast: val })
    }
    setDrafts((d) => {
      const n = { ...d }
      delete n[item.itemKey]
      return n
    })
  }

  async function addNovo() {
    if (!orgId) return
    const nome = window.prompt('Nome do novo cliente / crescimento:')
    if (!nome?.trim()) return
    const key = `novo_${Date.now()}`
    await upsertProvisioning({
      orgId,
      baseYear,
      targetYear,
      itemKey: key,
      nome: nome.trim(),
      status: 'Novo',
      forecast: 0,
    })
    qc.invalidateQueries({
      queryKey: ['provisioning', orgId, baseYear, targetYear],
    })
  }

  async function removeNovo(itemKey: string) {
    const row = persisted.get(itemKey)
    if (!row) return
    await deleteProvisioning(row.id)
    qc.invalidateQueries({
      queryKey: ['provisioning', orgId, baseYear, targetYear],
    })
  }

  const loading = statsQuery.isLoading || provQuery.isLoading
  const totalForecast = totals.total

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Provisionamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Previsão de GMV {targetYear} (base {baseYear}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
            <SelectTrigger className="h-9 w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOP_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 0 ? 'Todos' : `Top ${n}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addNovo}>
            <Plus className="size-4" /> Novo cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={`GMV base ${baseYear}`} value={fmtBRL0(totals.base)} loading={loading} />
        <KpiCard label={`Previsão ${targetYear}`} value={fmtBRL0(totalForecast)} loading={loading} />
        <KpiCard
          label="Variação"
          value={fmtBRL0(totalForecast - totals.base)}
          loading={loading}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="nome">Organizador</SortHead>
                  <SortHead k="gmvBase" align="right">GMV {baseYear}</SortHead>
                  <SortHead k="ytdBase" align="right">YTD {baseYear}</SortHead>
                  <SortHead k="ytd" align="right">YTD {targetYear}</SortHead>
                  <SortHead k="baseYtg" align="right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{baseYear} YTG</span>
                      </TooltipTrigger>
                      <TooltipContent>{ytgTooltip}</TooltipContent>
                    </Tooltip>
                  </SortHead>
                  <SortHead k="forecast" align="right">Previsão GMV {targetYear}</SortHead>
                  <TableHead className="w-0 px-0" />
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  sortedItems.map((it) => (
                    <TableRow key={it.itemKey}>
                      <TableCell className="max-w-64 truncate font-medium">
                        {it.nome}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue value={it.gmvBase} onOpen={it.isOutros || it.isNovo ? undefined : () => openBase(it)} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue value={it.gmvBase - it.baseYtg} muted onOpen={it.isOutros || it.isNovo ? undefined : () => openYtdBase(it)} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue
                          value={it.ytd}
                          onOpen={it.isOutros || it.isNovo ? undefined : () => openYtd(it)}
                          after={(() => {
                            const priorYtd = it.gmvBase - it.baseYtg
                            if (priorYtd <= 0) return null
                            const ratio = it.ytd / priorYtd
                            if (ratio < 0.5)
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="size-4 text-[var(--destructive)]" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    YTD 50%+ abaixo do mesmo período do ano anterior
                                  </TooltipContent>
                                </Tooltip>
                              )
                            if (ratio < 0.8)
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="size-4 text-[var(--warning)]" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    YTD ~20% abaixo do mesmo período do ano anterior
                                  </TooltipContent>
                                </Tooltip>
                              )
                            return null
                          })()}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue value={it.baseYtg} muted onOpen={it.isOutros || it.isNovo ? undefined : () => openYtg(it)} />
                      </TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const d = drafts[it.itemKey]
                          const current = d != null && d !== '' ? Number(d) : it.forecast
                          const belowYtd = it.ytd > 0 && current < it.ytd
                          return (
                            <div className="flex items-center justify-end gap-1">
                              <div className="relative inline-block">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  R$
                                </span>
                                <Input
                                  inputMode="numeric"
                                  className="h-8 w-[124px] pl-8 text-right tabular-nums"
                                  value={grpDigits(
                                    drafts[it.itemKey] ??
                                      (it.forecastManual != null
                                        ? String(Math.round(it.forecastManual))
                                        : ''),
                                  )}
                                  placeholder={grpDigits(String(Math.round(it.gmvBase)))}
                                  onChange={(e) =>
                                    setDrafts((dd) => ({
                                      ...dd,
                                      [it.itemKey]: e.target.value.replace(/\D/g, ''),
                                    }))
                                  }
                                  onBlur={() => commitForecast(it)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')
                                      (e.target as HTMLInputElement).blur()
                                  }}
                                />
                              </div>
                              {belowYtd && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="size-4 text-[var(--success)]" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Previsão abaixo do YTD ({fmtBRL0(it.ytd)})
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="w-0 whitespace-nowrap px-0 pl-1 text-left text-xs tabular-nums">
                        {(() => {
                          const d = drafts[it.itemKey]
                          const defined = d != null && d !== '' ? Number(d) : it.forecastManual
                          if (defined == null || it.gmvBase <= 0)
                            return <span className="text-muted-foreground">—</span>
                          const up = defined >= it.gmvBase
                          return (
                            <span className={up ? 'text-[var(--success)]' : 'text-[var(--destructive)]'}>
                              {fmtDelta((defined - it.gmvBase) / it.gmvBase, 0)}
                            </span>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        {it.isNovo && (
                          <button
                            className="text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => removeNovo(it.itemKey)}
                          >
                            remover
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!breakdown} onOpenChange={(o) => !o && setBreakdown(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{breakdown?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {breakdownQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (breakdownQuery.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum evento no período.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">GMV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(breakdownQuery.data ?? []).map((ev) => (
                    <TableRow key={ev.codigo_evento}>
                      <TableCell className="max-w-80 truncate font-medium">
                        {ev.nome ?? ev.codigo_evento}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ev.data_evento ? fmtDate(ev.data_evento) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL0(ev.gmv)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell colSpan={2}>
                      Total ({(breakdownQuery.data ?? []).length})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL0(
                        (breakdownQuery.data ?? []).reduce((a, e) => a + Number(e.gmv), 0),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Valor de GMV com lupa (aparece no hover) para abrir o detalhamento. */
function GmvValue({
  value, onOpen, muted, after,
}: {
  value: number
  onOpen?: () => void
  muted?: boolean
  after?: React.ReactNode
}) {
  return (
    <span
      className={`group inline-flex items-center justify-end gap-1 ${muted ? 'text-muted-foreground' : ''} ${onOpen ? 'cursor-default select-none' : ''}`}
      onDoubleClick={onOpen}
    >
      {onOpen && (
        <button
          onClick={onOpen}
          className="text-muted-foreground opacity-0 transition hover:text-primary group-hover:opacity-100"
          title="Ver eventos"
        >
          <Search className="size-3.5" />
        </button>
      )}
      {fmtBRL0(value)}
      {after}
    </span>
  )
}
