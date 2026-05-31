import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { KpiCard } from '../components/KpiCard'
import { WaterfallChart } from '../components/charts'
import { useDefaultOrg } from '@/lib/org'
import { useControls } from '@/modules/shared/controls-context'
import { biProvStats, biMonthsElapsed } from '../lib/rpc'
import {
  buildWaterfall,
  OUTROS_KEY,
  waterfallBars,
  type OrgStat,
  type ProvItem,
} from '../lib/provisioning'
import {
  deleteProvisioning,
  fetchProvisioning,
  upsertProvisioning,
} from '../lib/prov-api'
import type { ProvisioningRow, Status } from '@/lib/database.types'
import { fmtBRL, fmtInt } from '@/lib/format'

const STATUS_CYCLE: Status[] = ['Ativo', 'Risco', 'Perdido', 'Novo']
const STATUS_COLOR: Record<Status, string> = {
  Ativo: 'bg-[var(--success)]/15 text-[var(--success)]',
  Risco: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  Perdido: 'bg-destructive/15 text-destructive',
  Novo: 'bg-[var(--info)]/15 text-[var(--info)]',
}
const TOP_OPTIONS = [20, 50, 100, 0] // 0 = Todos

export function ProvisionamentoPage() {
  const org = useDefaultOrg()
  const orgId = org.data?.id
  const { year, dateBase, pdv } = useControls()
  const qc = useQueryClient()
  const targetYear = year
  const baseYear = year - 1
  const [topN, setTopN] = useState(20)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

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
      const m = months > 0 ? months : 12
      const stats: OrgStat[] = rows
        .map((r) => ({
          organizador: r.organizador,
          gmvBase: Number(r.gmv_base),
          ytd: Number(r.ytd),
          runRate: (Number(r.ytd) / m) * 12,
        }))
        .sort((a, b) => b.gmvBase - a.gmvBase)
      return stats
    },
  })
  const stats = useMemo(() => statsQuery.data ?? [], [statsQuery.data])

  const effectiveTop = topN === 0 ? stats.length : topN

  const items = useMemo<ProvItem[]>(() => {
    const top = stats.slice(0, effectiveTop)
    const rest = stats.slice(effectiveTop)

    const orgItems: ProvItem[] = top.map((s) => {
      const p = persisted.get(s.organizador)
      return {
        itemKey: s.organizador,
        nome: s.organizador,
        status: (p?.status as Status) ?? 'Ativo',
        gmvBase: s.gmvBase,
        ytd: s.ytd,
        runRate: s.runRate,
        forecast: p?.forecast ?? s.runRate,
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
          runRate: a.runRate + s.runRate,
        }),
        { gmvBase: 0, ytd: 0, runRate: 0 },
      )
      const p = persisted.get(OUTROS_KEY)
      orgItems.push({
        itemKey: OUTROS_KEY,
        nome: `Demais organizadores (${rest.length})`,
        status: (p?.status as Status) ?? 'Ativo',
        gmvBase: agg.gmvBase,
        ytd: agg.ytd,
        runRate: agg.runRate,
        forecast: p?.forecast ?? agg.runRate,
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
        runRate: 0,
        forecast: r.forecast ?? 0,
        isNovo: true,
        isOutros: false,
      })
    }

    return orgItems
  }, [stats, effectiveTop, persisted, provQuery.data])

  const waterfall = useMemo(() => {
    const { steps, base, total } = buildWaterfall(items)
    return { bars: waterfallBars(steps), base, total }
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
    const val = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(val)) return
    persist(item.itemKey, { forecast: val })
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
  const totalForecast = waterfall.total

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={`GMV base ${baseYear}`} value={fmtBRL(waterfall.base)} loading={loading} />
        <KpiCard label={`Previsão ${targetYear}`} value={fmtBRL(totalForecast)} loading={loading} />
        <KpiCard
          label="Variação"
          value={fmtBRL(totalForecast - waterfall.base)}
          loading={loading}
        />
        <KpiCard label="Itens" value={fmtInt(items.length)} loading={loading} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Composição da previsão (waterfall)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <WaterfallChart data={waterfall.bars} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organizador</TableHead>
                  <TableHead className="text-right">GMV {baseYear}</TableHead>
                  <TableHead className="text-right">YTD {targetYear}</TableHead>
                  <TableHead className="text-right">Run-rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Previsão GMV</TableHead>
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
                        {fmtBRL(it.gmvBase)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(it.ytd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtBRL(it.runRate)}
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
                        <Input
                          className="h-8 w-32 text-right tabular-nums"
                          value={
                            drafts[it.itemKey] ??
                            String(Math.round(it.forecast))
                          }
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [it.itemKey]: e.target.value,
                            }))
                          }
                          onBlur={() => commitForecast(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              (e.target as HTMLInputElement).blur()
                          }}
                        />
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
    </div>
  )
}
