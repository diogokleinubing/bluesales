import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, X, Download, Pin, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { useEventos, type EventFilters } from '../hooks/useEventos'
import { useRules } from '../hooks/useRules'
import { useReclassify } from '../hooks/useReclassify'
import { useControls } from '@/modules/shared/controls-context'
import { useOrgId } from '../hooks/useBi'
import { METRIC_LABELS } from '../lib/controls'
import { exportToXlsx } from '../lib/export'
import {
  fetchEventManuals,
  setEventDimensionManual,
} from '../lib/rules-api'
import { fmtBRL, fmtInt } from '@/lib/format'

const ALL = '__all__'
const AUTO = '__auto__'

function paramFilters(params: URLSearchParams): EventFilters {
  return {
    search: params.get('q') ?? '',
    segmento: params.get('segmento') ?? '',
    genero: params.get('genero') ?? '',
    organizador: params.get('organizador') ?? '',
    local: params.get('local') ?? '',
    cidade: params.get('cidade') ?? '',
    uf: params.get('uf') ?? '',
    codigo: params.get('codigo') ?? '',
  }
}

function mapKey(key: keyof EventFilters): string {
  return key === 'search' ? 'q' : key
}

export function EventosPage() {
  const [params, setParams] = useSearchParams()
  const { metric } = useControls()
  const orgId = useOrgId()
  const qc = useQueryClient()
  const reclassify = useReclassify(orgId)
  const { rules } = useRules()
  const filters = useMemo(() => paramFilters(params), [params])
  const { events, options, isLoading, total, truncated } = useEventos(filters)

  const segNames = rules.segments.map((s) => s.nome)
  const genNames = rules.generos.map((g) => g.nome)

  // Manuais por código (para o pin e o estado dos selects inline).
  const manualsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'event-manuals', orgId],
    queryFn: () => fetchEventManuals(orgId!),
  })
  const manuals = manualsQ.data

  function setFilter(key: keyof EventFilters, value: string) {
    const next = new URLSearchParams(params)
    if (!value) next.delete(mapKey(key))
    else next.set(mapKey(key), value)
    setParams(next, { replace: true })
  }

  function clearAll() {
    setParams(new URLSearchParams(), { replace: true })
  }

  // Alterações pendentes (não salvas) por evento+dimensão. value: string =
  // definir manual; null = limpar (voltar ao automático).
  const [pending, setPending] = useState<Map<string, string | null>>(new Map())
  const [savingPending, setSavingPending] = useState(false)

  function stageDimension(
    codigo: string,
    dim: 'segmento' | 'genero',
    value: string | null,
  ) {
    setPending((prev) => {
      const next = new Map(prev)
      next.set(`${codigo}|${dim}`, value)
      return next
    })
  }

  async function savePending() {
    if (!orgId || pending.size === 0) return
    setSavingPending(true)
    try {
      const codigos = new Set<string>()
      for (const [key, value] of pending) {
        const [codigo, dim] = key.split('|') as [string, 'segmento' | 'genero']
        await setEventDimensionManual(orgId, codigo, dim, value)
        codigos.add(codigo)
      }
      // Reclassifica os afetados: dimensões manuais mantêm, demais recalculam.
      await reclassify.mutateAsync({ codigos: [...codigos] })
      qc.invalidateQueries({ queryKey: ['bi', 'event-manuals', orgId] })
      setPending(new Map())
      toast.success(`${codigos.size} eventos atualizados`)
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message })
    } finally {
      setSavingPending(false)
    }
  }

  const hasFilters =
    filters.search ||
    filters.segmento ||
    filters.genero ||
    filters.organizador ||
    filters.local ||
    filters.cidade ||
    filters.uf ||
    filters.codigo

  const totalValue = events.reduce((a, e) => a + e.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            {fmtInt(total)} eventos
            {truncated && ` (exibindo top ${fmtInt(events.length)})`} ·{' '}
            {fmtBRL(totalValue)} {METRIC_LABELS[metric]}
          </p>
        </div>
        <div className="flex gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="size-4" /> Limpar filtros
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={events.length === 0}
            onClick={() =>
              exportToXlsx('blueticket-eventos', [
                {
                  name: 'Eventos',
                  rows: events.map((e) => ({
                    Código: e.codigo_evento,
                    Evento: e.nome ?? '',
                    Segmento: e.segmento ?? 'Sem segmento',
                    Gênero: e.genero ?? 'Sem gênero',
                    Organizador: e.organizador ?? '',
                    Local: e.local ?? '',
                    Cidade: e.cidade ?? '',
                    UF: e.uf ?? '',
                    Vendas: e.vendas,
                    'GMV Total': e.gmv,
                    'GMV On-Line': e.gmvOnline,
                  })),
                },
              ])
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-50 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código, organizador, local…"
              className="pl-8"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>
          <FilterSelect
            placeholder="Segmento"
            value={filters.segmento}
            options={options.segmentos}
            onChange={(v) => setFilter('segmento', v)}
          />
          <FilterSelect
            placeholder="Gênero"
            value={filters.genero}
            options={options.generos}
            onChange={(v) => setFilter('genero', v)}
          />
          <FilterSelect
            placeholder="Organizador"
            value={filters.organizador}
            options={options.organizadores}
            onChange={(v) => setFilter('organizador', v)}
          />
          <FilterSelect
            placeholder="Local"
            value={filters.local}
            options={options.locais}
            onChange={(v) => setFilter('local', v)}
          />
          <FilterSelect
            placeholder="Cidade"
            value={filters.cidade}
            options={options.cidades}
            onChange={(v) => setFilter('cidade', v)}
          />
          <FilterSelect
            placeholder="UF"
            value={filters.uf}
            options={options.ufs}
            onChange={(v) => setFilter('uf', v)}
          />
        </CardContent>
      </Card>

      {filters.codigo && (
        <Badge variant="secondary" className="gap-1">
          Código: {filters.codigo}
          <button onClick={() => setFilter('codigo', '')}>
            <X className="size-3" />
          </button>
        </Badge>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead className="w-52">Segmento</TableHead>
                  <TableHead className="w-52">Gênero</TableHead>
                  <TableHead>Organizador</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV Total</TableHead>
                  <TableHead className="text-right">GMV On-Line</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows />
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((e) => {
                    const m = manuals?.get(e.codigo_evento)
                    return (
                      <TableRow key={e.codigo_evento}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {e.codigo_evento}
                        </TableCell>
                        <TableCell className="max-w-64 truncate font-medium">
                          {e.nome ?? '—'}
                        </TableCell>
                        <DimensionCell
                          value={e.segmento}
                          isManual={!!(m?.segmento_manual)}
                          options={segNames}
                          staged={pending.get(`${e.codigo_evento}|segmento`)}
                          hasStaged={pending.has(`${e.codigo_evento}|segmento`)}
                          onChange={(v) =>
                            stageDimension(e.codigo_evento, 'segmento', v)
                          }
                        />
                        <DimensionCell
                          value={e.genero}
                          emptyLabel="Sem gênero"
                          isManual={!!(m?.genero_manual)}
                          options={genNames}
                          staged={pending.get(`${e.codigo_evento}|genero`)}
                          hasStaged={pending.has(`${e.codigo_evento}|genero`)}
                          onChange={(v) =>
                            stageDimension(e.codigo_evento, 'genero', v)
                          }
                        />
                        <TableCell className="max-w-40 truncate">
                          {e.organizador ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-40 truncate">
                          {e.local ?? '—'}
                        </TableCell>
                        <TableCell>{e.uf ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtInt(e.vendas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(e.gmv)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(e.gmvOnline)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Barra flutuante: salvar alterações pendentes de segmento/gênero */}
      {pending.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm text-muted-foreground">
            {pending.size}{' '}
            {pending.size === 1 ? 'alteração pendente' : 'alterações pendentes'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPending(new Map())}
            disabled={savingPending}
          >
            Descartar
          </Button>
          <Button size="sm" onClick={savePending} disabled={savingPending}>
            <Save className="size-4" />
            {savingPending ? 'Salvando…' : 'Atualizar Segmento / Gênero'}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Célula de dimensão (segmento/gênero) editável inline. A alteração não é
 * salva na hora: fica "staged" (pendente) e a barra flutuante salva tudo.
 */
function DimensionCell({
  value,
  options,
  isManual,
  onChange,
  emptyLabel = 'Sem segmento',
  staged,
  hasStaged,
}: {
  value: string | null
  options: string[]
  isManual: boolean
  onChange: (v: string | null) => void
  emptyLabel?: string
  staged?: string | null
  hasStaged?: boolean
}) {
  // Valor/estado efetivos considerando a alteração pendente.
  const effValue = hasStaged ? staged ?? null : value
  const effManual = hasStaged ? staged != null : isManual
  const selectValue = effManual && effValue ? effValue : AUTO

  return (
    <TableCell className={hasStaged ? 'bg-primary/5' : undefined}>
      <div className="flex items-center gap-1">
        {effManual && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={hasStaged ? 'text-amber-500' : 'text-primary'}>
                <Pin className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasStaged
                ? 'Alteração não salva — use "Atualizar Segmento / Gênero"'
                : 'Definido manualmente — não será alterado por regras'}
            </TooltipContent>
          </Tooltip>
        )}
        <Select
          value={selectValue}
          onValueChange={(v) => onChange(v === AUTO ? null : v)}
        >
          <SelectTrigger className="h-8 flex-1" size="sm">
            <SelectValue>
              <span className={effValue ? '' : 'text-muted-foreground'}>
                {effValue ?? (hasStaged ? '— Automático' : emptyLabel)}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>— Automático</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </TableCell>
  )
}

function FilterSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <Select
      value={value || ALL}
      onValueChange={(v) => onChange(v === ALL ? '' : v)}
    >
      <SelectTrigger className="h-9 w-40" size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={10}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
