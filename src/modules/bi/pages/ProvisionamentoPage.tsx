import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { fmtBRL, fmtDate } from '@/lib/format'

const STATUS_CYCLE: Status[] = ['Ativo', 'Risco', 'Perdido', 'Novo']
const STATUS_COLOR: Record<Status, string> = {
  Ativo: 'bg-[var(--success)]/15 text-[var(--success)]',
  Risco: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  Perdido: 'bg-destructive/15 text-destructive',
  Novo: 'bg-[var(--info)]/15 text-[var(--info)]',
}
const TOP_OPTIONS = [20, 50, 100, 0] // 0 = Todos
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

  function cycleStatus(item: ProvItem) {
    const idx = STATUS_CYCLE.indexOf(item.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    persist(item.itemKey, { status: next })
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
        <KpiCard label={`GMV base ${baseYear}`} value={fmtBRL(totals.base)} loading={loading} />
        <KpiCard label={`Previsão ${targetYear}`} value={fmtBRL(totalForecast)} loading={loading} />
        <KpiCard
          label="Variação"
          value={fmtBRL(totalForecast - totals.base)}
          loading={loading}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organizador</TableHead>
                  <TableHead className="text-right">GMV {baseYear}</TableHead>
                  <TableHead className="text-right">YTD {targetYear}</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="cursor-default underline decoration-dotted underline-offset-2">
                        {baseYear} YTG
                      </TooltipTrigger>
                      <TooltipContent>{ytgTooltip}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Previsão GMV {targetYear}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  items.map((it) => (
                    <TableRow key={it.itemKey}>
                      <TableCell className="max-w-64 truncate font-medium">
                        {it.nome}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue value={it.gmvBase} onOpen={it.isOutros || it.isNovo ? undefined : () => openBase(it)} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue
                          value={it.ytd}
                          onOpen={it.isOutros || it.isNovo ? undefined : () => openYtd(it)}
                          before={
                            it.gmvBase - it.baseYtg > 0 &&
                            it.ytd < 0.5 * (it.gmvBase - it.baseYtg) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="size-4 text-[var(--destructive)]" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Ritmo do YTD abaixo de 50% do mesmo período do ano anterior
                                </TooltipContent>
                              </Tooltip>
                            ) : null
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GmvValue value={it.baseYtg} muted onOpen={it.isOutros || it.isNovo ? undefined : () => openYtg(it)} />
                      </TableCell>
                      <TableCell>
                        <button onClick={() => cycleStatus(it)}>
                          <Badge
                            className={`cursor-pointer ${STATUS_COLOR[it.status]}`}
                            variant="secondary"
                          >
                            {it.status}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const d = drafts[it.itemKey]
                          const current = d != null && d !== '' ? Number(d) : it.forecast
                          const belowYtd = it.ytd > 0 && current < it.ytd
                          return (
                            <div className="flex items-center justify-end gap-1">
                              {belowYtd && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="size-4 text-[var(--success)]" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Previsão abaixo do YTD ({fmtBRL(it.ytd)})
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <div className="relative inline-block">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  R$
                                </span>
                                <Input
                                  inputMode="numeric"
                                  className="h-8 w-36 pl-8 text-right tabular-nums"
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
                            </div>
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
                        {fmtBRL(ev.gmv)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell colSpan={2}>
                      Total ({(breakdownQuery.data ?? []).length})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL(
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
  value, onOpen, muted, before,
}: {
  value: number
  onOpen?: () => void
  muted?: boolean
  before?: React.ReactNode
}) {
  return (
    <span className={`group inline-flex items-center justify-end gap-1 ${muted ? 'text-muted-foreground' : ''}`}>
      {before}
      {onOpen && (
        <button
          onClick={onOpen}
          className="text-muted-foreground opacity-0 transition hover:text-primary group-hover:opacity-100"
          title="Ver eventos"
        >
          <Search className="size-3.5" />
        </button>
      )}
      {fmtBRL(value)}
    </span>
  )
}
