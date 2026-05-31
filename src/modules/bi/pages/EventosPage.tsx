import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
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
import { useEventos, type EventFilters } from '../hooks/useEventos'
import { useControls } from '@/modules/shared/controls-context'
import { METRIC_LABELS } from '../lib/controls'
import { fmtBRL, fmtInt } from '@/lib/format'

const ALL = '__all__'

function paramFilters(params: URLSearchParams): EventFilters {
  return {
    search: params.get('q') ?? '',
    segmento: params.get('segmento') ?? '',
    organizador: params.get('organizador') ?? '',
    local: params.get('local') ?? '',
    cidade: params.get('cidade') ?? '',
    uf: params.get('uf') ?? '',
    codigo: params.get('codigo') ?? '',
  }
}

/** Mapeia a chave do filtro para o nome do parâmetro na URL. */
function mapKey(key: keyof EventFilters): string {
  return key === 'search' ? 'q' : key
}

export function EventosPage() {
  const [params, setParams] = useSearchParams()
  const { metric } = useControls()
  const filters = useMemo(() => paramFilters(params), [params])
  const { events, options, isLoading } = useEventos(filters)

  function setFilter(key: keyof EventFilters, value: string) {
    const next = new URLSearchParams(params)
    if (!value) next.delete(mapKey(key))
    else next.set(mapKey(key), value)
    setParams(next, { replace: true })
  }

  function clearAll() {
    setParams(new URLSearchParams(), { replace: true })
  }

  const hasFilters =
    filters.search ||
    filters.segmento ||
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
            {fmtInt(events.length)} eventos · {fmtBRL(totalValue)}{' '}
            {METRIC_LABELS[metric]}
          </p>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-4" /> Limpar filtros
          </Button>
        )}
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
                  <TableHead>Segmento</TableHead>
                  <TableHead>Organizador</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Receita BT</TableHead>
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
                  events.map((e) => (
                    <TableRow key={e.codigo_evento}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.codigo_evento}
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-medium">
                        {e.nome ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {e.segmento ?? 'Sem segmento'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {e.organizador ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {e.local ?? '—'}
                      </TableCell>
                      <TableCell>{e.cidade ?? '—'}</TableCell>
                      <TableCell>{e.uf ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(e.vendas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(e.gmv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(e.receitaBt)}
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
