import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  addKeywordRule,
  fetchEventManuals,
  setEventDimensionManual,
  updateKeywordRule,
  type KeywordRuleInput,
} from '../../lib/rules-api'
import { biBiggestEvents } from '../../lib/rpc'
import { norm } from '../../lib/classify'
import { ClassSelect } from './ClassSelect'
import { ConvertToRuleDialog } from './ConvertToRuleDialog'
import { DimensionCell } from '../DimensionCell'
import { PendingSaveBar } from '../PendingSaveBar'
import { fmtBRL, fmtInt } from '@/lib/format'

export function BiggestEvents() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { rules } = useRules()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
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

  const eventsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'biggest-events', orgId, search],
    queryFn: () => biBiggestEvents(orgId!, search, 200),
  })
  const visible = eventsQ.data ?? []

  const manualsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'event-manuals', orgId],
    queryFn: () => fetchEventManuals(orgId!),
  })
  const manuals = manualsQ.data

  function toggle(codigo: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
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

  /** Marca (sem salvar) os selecionados com o segmento/gênero escolhidos. */
  function stageBulk() {
    if (selected.size === 0 || (!bulkSeg && !bulkGen)) return
    setPending((prev) => {
      const next = new Map(prev)
      for (const codigo of selected) {
        if (bulkSeg) next.set(`${codigo}|segmento`, bulkSeg)
        if (bulkGen) next.set(`${codigo}|genero`, bulkGen)
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
        const [codigo, dim] = key.split('|') as [string, 'segmento' | 'genero']
        await setEventDimensionManual(orgId, codigo, dim, value)
        codigos.add(codigo)
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filtrar por nome, organizador, código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{selected.size} selecionados</Badge>
          <ClassSelect
            value={bulkSeg}
            options={segNames}
            onChange={setBulkSeg}
            placeholder="Segmento"
            className="h-9 w-40"
          />
          <ClassSelect
            value={bulkGen}
            options={genNames}
            onChange={setBulkGen}
            placeholder="Gênero"
            className="h-9 w-40"
          />
          <Button
            variant="secondary"
            onClick={stageBulk}
            disabled={selected.size === 0 || (!bulkSeg && !bulkGen)}
          >
            Aplicar aos selecionados
          </Button>
        </div>
      </div>

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
