import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, X, Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import { useOrgId } from '../../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import {
  addKeywordRule,
  fetchEventManuals,
  setEventDimensionManual,
  updateKeywordRule,
  type KeywordRuleInput,
} from '../../lib/rules-api'
import { biBiggestEvents, biEventOptions } from '../../lib/rpc'
import { norm } from '../../lib/classify'
import { ClassSelect } from './ClassSelect'
import { ConvertToRuleDialog } from './ConvertToRuleDialog'
import { DimensionCell } from '../DimensionCell'
import { PendingSaveBar } from '../PendingSaveBar'
import { fmtBRL, fmtInt } from '@/lib/format'

const ALL = '__all__'

// Filtros lidos da querystring (drill-downs de outras telas chegam aqui).
const FILTER_KEYS = ['segmento', 'genero', 'organizador', 'local', 'cidade', 'uf'] as const
type FilterKey = (typeof FILTER_KEYS)[number]

export function BiggestEvents() {
  const orgId = useOrgId()
  const { year, dateBase, pdv } = useControls()
  const qc = useQueryClient()
  const { rules } = useRules()
  const reclassify = useReclassify(orgId)
  const [params, setParams] = useSearchParams()

  const search = params.get('q') ?? ''
  const codigo = params.get('codigo') ?? ''
  const filters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<FilterKey, string>,
    [params],
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSeg, setBulkSeg] = useState<string | null>(null)
  const [bulkGen, setBulkGen] = useState<string | null>(null)
  const [pending, setPending] = useState<Map<string, string | null>>(new Map())
  const [savingPending, setSavingPending] = useState(false)
  const [convertFor, setConvertFor] = useState<{
    codigo: string
    nome: string | null
  } | null>(null)

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])

  // Atualiza um parâmetro de filtro na URL (mantém o tab da tela de Regras).
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const hasFilters = !!(search || codigo || FILTER_KEYS.some((k) => filters[k]))
  function clearFilters() {
    const next = new URLSearchParams(params)
    ;['q', 'codigo', ...FILTER_KEYS].forEach((k) => next.delete(k))
    setParams(next, { replace: true })
  }

  const eventsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'biggest-events', orgId, year, search, codigo, filters],
    queryFn: () =>
      biBiggestEvents(orgId!, search, year, 200, {
        ...filters,
        codigo,
      }),
  })
  const visible = eventsQ.data ?? []

  // Opções dos dropdowns (valores distintos da base do ano ativo).
  const optionsQ = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'event-options', orgId, year, dateBase, pdv],
    queryFn: () => biEventOptions(orgId!, year, dateBase, pdv),
  })
  const options = useMemo(() => {
    const by = (dim: string) =>
      (optionsQ.data ?? [])
        .filter((o) => o.dim === dim)
        .map((o) => o.value)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      segmento: by('segmento'),
      genero: by('genero'),
      organizador: by('organizador'),
      local: by('local'),
      cidade: by('cidade'),
      uf: by('uf'),
    }
  }, [optionsQ.data])

  const manualsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'event-manuals', orgId],
    queryFn: () => fetchEventManuals(orgId!),
  })
  const manuals = manualsQ.data

  function toggle(codigoEvento: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(codigoEvento)) next.delete(codigoEvento)
      else next.add(codigoEvento)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === visible.length
        ? new Set()
        : new Set(visible.map((e) => e.codigo_evento)),
    )
  }

  function stageDimension(
    codigoEvento: string,
    dim: 'segmento' | 'genero',
    value: string | null,
  ) {
    setPending((prev) => {
      const next = new Map(prev)
      next.set(`${codigoEvento}|${dim}`, value)
      return next
    })
  }

  /** Marca (sem salvar) os selecionados com o segmento/gênero escolhidos. */
  function stageBulk() {
    if (selected.size === 0 || (!bulkSeg && !bulkGen)) return
    setPending((prev) => {
      const next = new Map(prev)
      for (const codigoEvento of selected) {
        if (bulkSeg) next.set(`${codigoEvento}|segmento`, bulkSeg)
        if (bulkGen) next.set(`${codigoEvento}|genero`, bulkGen)
      }
      return next
    })
    setSelected(new Set())
    setBulkSeg(null)
    setBulkGen(null)
  }

  /** Cria/atualiza a regra de termo e reclassifica o evento de origem. */
  async function saveConvert(rule: KeywordRuleInput) {
    if (!orgId || !convertFor) return
    const existing = rules.keywordRules.find(
      (r) => norm(r.keyword) === norm(rule.keyword),
    )
    if (existing) {
      await updateKeywordRule('keyword_rules', existing.id, {
        segmento: rule.segmento,
        genero: rule.genero,
        ignorar_com_ano: rule.ignorar_com_ano,
      })
    } else {
      await addKeywordRule('keyword_rules', orgId, {
        ...rule,
        ordem: rules.keywordRules.length * 10 + 10,
      })
    }
    qc.invalidateQueries({ queryKey: ['rules'] })
    await reclassify.mutateAsync({ codigos: [convertFor.codigo] })
    qc.invalidateQueries({ queryKey: ['bi', 'event-manuals', orgId] })
    setConvertFor(null)
    toast.success('Regra criada e evento atualizado')
  }

  async function savePending() {
    if (!orgId || pending.size === 0) return
    setSavingPending(true)
    try {
      const codigos = new Set<string>()
      for (const [key, value] of pending) {
        const [codigoEvento, dim] = key.split('|') as [string, 'segmento' | 'genero']
        await setEventDimensionManual(orgId, codigoEvento, dim, value)
        codigos.add(codigoEvento)
      }
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

  return (
    <div className="space-y-3">
      {/* Filtros (mesmo conjunto da antiga tela de Eventos) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-50 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código, organizador, local…"
              className="pl-8"
              value={search}
              onChange={(e) => setParam('q', e.target.value)}
            />
          </div>
          <FilterSelect placeholder="Segmento" value={filters.segmento} options={options.segmento} onChange={(v) => setParam('segmento', v)} />
          <FilterSelect placeholder="Gênero" value={filters.genero} options={options.genero} onChange={(v) => setParam('genero', v)} />
          <FilterSelect placeholder="Organizador" value={filters.organizador} options={options.organizador} onChange={(v) => setParam('organizador', v)} />
          <FilterSelect placeholder="Local" value={filters.local} options={options.local} onChange={(v) => setParam('local', v)} />
          <FilterSelect placeholder="Cidade" value={filters.cidade} options={options.cidade} onChange={(v) => setParam('cidade', v)} />
          <FilterSelect placeholder="UF" value={filters.uf} options={options.uf} onChange={(v) => setParam('uf', v)} />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" /> Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {codigo && (
        <Badge variant="secondary" className="gap-1">
          Código: {codigo}
          <button onClick={() => setParam('codigo', '')}>
            <X className="size-3" />
          </button>
        </Badge>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        visible.length > 0 && selected.size === visible.length
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Organizador</TableHead>
                  <TableHead className="w-44">Segmento</TableHead>
                  <TableHead className="w-44">Gênero</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((e) => {
                    const m = manuals?.get(e.codigo_evento)
                    return (
                      <TableRow key={e.codigo_evento} className="group">
                        <TableCell>
                          <Checkbox
                            checked={selected.has(e.codigo_evento)}
                            onCheckedChange={() => toggle(e.codigo_evento)}
                          />
                        </TableCell>
                        <TableCell className="max-w-64 font-medium">
                          <div className="flex items-center gap-1">
                            <span className="truncate">
                              {e.nome ?? e.codigo_evento}
                            </span>
                            <button
                              title="Converter em regra"
                              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                              onClick={() =>
                                setConvertFor({
                                  codigo: e.codigo_evento,
                                  nome: e.nome,
                                })
                              }
                            >
                              <Wand2 className="size-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-40 truncate">
                          {e.organizador ?? '—'}
                        </TableCell>
                        <DimensionCell
                          value={e.segmento}
                          isManual={!!m?.segmento_manual}
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
                          isManual={!!m?.genero_manual}
                          options={genNames}
                          staged={pending.get(`${e.codigo_evento}|genero`)}
                          hasStaged={pending.has(`${e.codigo_evento}|genero`)}
                          onChange={(v) =>
                            stageDimension(e.codigo_evento, 'genero', v)
                          }
                        />
                        <TableCell className="text-right tabular-nums">
                          {fmtInt(Number(e.qtd))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(Number(e.gmv))}
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

      {selected.size > 0 && (
        <div className={`fixed ${pending.size > 0 ? 'bottom-20' : 'bottom-6'} left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg`}>
          <Badge variant="secondary">{selected.size} selecionados</Badge>
          <ClassSelect
            value={bulkSeg}
            options={segNames}
            onChange={setBulkSeg}
            placeholder="Segmento"
            className="h-8 w-36"
          />
          <ClassSelect
            value={bulkGen}
            options={genNames}
            onChange={setBulkGen}
            placeholder="Gênero"
            className="h-8 w-36"
          />
          <Button size="sm" variant="secondary" onClick={stageBulk} disabled={!bulkSeg && !bulkGen}>
            Aplicar aos selecionados
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar
          </Button>
        </div>
      )}

      <PendingSaveBar
        count={pending.size}
        saving={savingPending}
        onSave={savePending}
        onDiscard={() => setPending(new Map())}
      />

      {convertFor && (
        <ConvertToRuleDialog
          event={convertFor}
          segNames={segNames}
          genNames={genNames}
          onClose={() => setConvertFor(null)}
          onSave={saveConvert}
        />
      )}
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
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
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
