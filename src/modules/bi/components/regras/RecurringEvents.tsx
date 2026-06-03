import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Layers, Eraser, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { useOrgId } from '../../hooks/useBi'
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import { biBiggestEvents } from '../../lib/rpc'
import {
  clearAllFamilias,
  setEventFamilias,
  setFamilyOverride,
} from '../../lib/family-api'
import { addKeywordRule, updateKeywordRule } from '../../lib/rules-api'
import { suggestFamily, familiaFromName } from '../../lib/family'
import { norm } from '../../lib/classify'
import { ClassSelect } from './ClassSelect'
import { fmtBRL, fmtInt } from '@/lib/format'

interface EvRow {
  codigo_evento: string
  nome: string | null
  familia: string | null
  segmento: string | null
  genero: string | null
  gmv: number
}

/** Título tem um ano entre 2020 e 2030? (candidato a evento recorrente) */
export function hasYearInTitle(nome: string | null): boolean {
  if (!nome) return false
  return /\b(20(2\d|30))\b/.test(nome)
}


async function fetchEventsBase(
  orgId: string,
): Promise<Omit<EvRow, 'gmv'>[]> {
  const all: Omit<EvRow, 'gmv'>[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('codigo_evento, nome, familia, segmento, genero')
      .eq('org_id', orgId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Omit<EvRow, 'gmv'>[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

export function RecurringEvents() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { rules } = useRules()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [onlyUngrouped, setOnlyUngrouped] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [familiaInput, setFamiliaInput] = useState('')
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)
  const [userEdited, setUserEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestChecked, setSuggestChecked] = useState<Set<string>>(new Set())

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])
  // Filtro inclui "Outros" (fallback) no fim, para ver os não ajustados.
  const segFilterOptions = useMemo(
    () => [...segNames.filter((s) => s !== 'Outros'), 'Outros'],
    [segNames],
  )

  const baseQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'family-events', orgId],
    queryFn: async (): Promise<EvRow[]> => {
      const [evs, rev] = await Promise.all([
        fetchEventsBase(orgId!),
        biBiggestEvents(orgId!, '', 10000),
      ])
      const gmvMap = new Map(
        rev.map((r) => [r.codigo_evento, Number(r.gmv)]),
      )
      return evs
        .map((e) => ({ ...e, gmv: gmvMap.get(e.codigo_evento) ?? 0 }))
        .sort((a, b) => b.gmv - a.gmv)
    },
  })

  const events = baseQ.data ?? []

  const visible = useMemo(() => {
    const q = norm(search)
    return events
      .filter((e) => (showAll ? true : hasYearInTitle(e.nome)))
      .filter((e) => (onlyUngrouped ? !e.familia : true))
      .filter((e) => (segFilter ? e.segmento === segFilter : true))
      .filter(
        (e) =>
          !q ||
          norm(e.nome).includes(q) ||
          norm(e.familia).includes(q) ||
          e.codigo_evento.includes(q),
      )
      .slice(0, 500)
  }, [events, search, showAll, onlyUngrouped, segFilter])

  const resumo = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      if (!e.familia) continue
      counts.set(e.familia, (counts.get(e.familia) ?? 0) + 1)
    }
    let recorrentes = 0
    for (const c of counts.values()) if (c >= 2) recorrentes++
    return { familias: counts.size, recorrentes }
  }, [events])

  // Descobre famílias: eventos SEM família cujo nome (sem o ano) bate com uma
  // família existente, ou que se agrupam com outros eventos soltos (>= 2).
  const suggestions = useMemo(() => {
    const famByNorm = new Map<string, string>()
    for (const e of events) if (e.familia) famByNorm.set(norm(e.familia), e.familia)
    const existentes = new Set(famByNorm.keys())

    const byCand = new Map<
      string,
      { familia: string; existente: boolean; events: EvRow[] }
    >()
    for (const e of events) {
      if (e.familia) continue
      // Só sugere eventos que têm o ano no nome (candidatos a recorrência).
      if (!hasYearInTitle(e.nome)) continue
      const cand = familiaFromName(e.nome)
      if (!cand) continue
      const key = norm(cand)
      const entry = byCand.get(key) ?? {
        familia: famByNorm.get(key) ?? cand,
        existente: existentes.has(key),
        events: [],
      }
      entry.events.push(e)
      byCand.set(key, entry)
    }
    return [...byCand.values()]
      .filter((s) => s.existente || s.events.length >= 2)
      .sort((a, b) => b.events.length - a.events.length)
  }, [events])

  function openSuggest() {
    // Abre tudo desmarcado por padrão (o usuário escolhe o que agrupar).
    setSuggestChecked(new Set())
    setSuggestOpen(true)
  }

  async function applySuggestions() {
    if (!orgId) return
    const byFam = new Map<string, string[]>()
    for (const s of suggestions) {
      for (const e of s.events) {
        if (!suggestChecked.has(e.codigo_evento)) continue
        const arr = byFam.get(s.familia) ?? []
        arr.push(e.codigo_evento)
        byFam.set(s.familia, arr)
      }
    }
    const totalCodigos = [...byFam.values()].reduce((a, c) => a + c.length, 0)
    if (totalCodigos === 0) return
    setSaving(true)
    try {
      for (const [familia, codigos] of byFam) {
        for (const c of codigos) await setFamilyOverride(orgId, c, familia)
        await setEventFamilias(orgId, codigos, familia)
      }
      await qc.invalidateQueries({ queryKey: ['bi'] })
      setSuggestOpen(false)
      toast.success('Famílias aplicadas', {
        description: `${totalCodigos} eventos agrupados em ${byFam.size} famílias.`,
      })
    } catch (e) {
      toast.error('Erro ao aplicar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // Sugestão = trecho em comum dos nomes selecionados (sem o ano).
  const suggestion = useMemo(() => {
    const names = [...selected]
      .map((c) => events.find((e) => e.codigo_evento === c)?.nome ?? '')
      .filter(Boolean)
    return suggestFamily(names)
  }, [selected, events])

  // Preenche o campo com a sugestão enquanto o usuário não digitar manualmente.
  useEffect(() => {
    if (!userEdited) setFamiliaInput(suggestion)
  }, [suggestion, userEdited])

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

  async function aplicarFamilia() {
    if (!orgId || selected.size === 0 || !familiaInput.trim()) return
    setSaving(true)
    try {
      const familia = familiaInput.trim()
      const codigos = [...selected]
      // Grava override + família APENAS dos selecionados. Não reclassifica a
      // base inteira (isso aplicaria a sugestão por nome a todos os outros).
      for (const codigo of codigos) {
        await setFamilyOverride(orgId, codigo, familia)
      }
      await setEventFamilias(orgId, codigos, familia)

      // Se informou segmento/gênero, salva como REGRA (keyword = nome da
      // família) na base de Classificação e reclassifica.
      let ruleMsg = ''
      if (segmento || genero) {
        const existente = rules.keywordRules.find(
          (r) => norm(r.keyword) === norm(familia),
        )
        if (existente) {
          await updateKeywordRule('keyword_rules', existente.id, {
            segmento,
            genero,
          })
        } else {
          await addKeywordRule('keyword_rules', orgId, {
            keyword: familia,
            segmento,
            genero,
            ordem: rules.keywordRules.length * 10 + 10,
          })
        }
        await qc.invalidateQueries({ queryKey: ['rules'] })
        reclassify.mutate('all')
        ruleMsg = ' Regra de classificação salva.'
      }

      setSelected(new Set())
      setFamiliaInput('')
      setSegmento(null)
      setGenero(null)
      setUserEdited(false)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success('Eventos agrupados', {
        description: `${codigos.length} eventos → "${familia}".${ruleMsg}`,
      })
    } catch (e) {
      toast.error('Erro ao agrupar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function limparTudo() {
    if (!orgId) return
    if (
      !window.confirm(
        'Limpar TODOS os agrupamentos? Isso apaga os ajustes manuais e zera as famílias. Não pode ser desfeito.',
      )
    )
      return
    setSaving(true)
    try {
      await clearAllFamilias(orgId)
      setSelected(new Set())
      setFamiliaInput('')
      setUserEdited(false)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success('Agrupamentos limpos', {
        description: 'Todas as famílias foram removidas.',
      })
    } catch (e) {
      toast.error('Erro ao limpar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Agrupe edições e festivais multi-dia numa mesma <strong>família</strong>{' '}
        (sem o ano). Ex.: selecione todos os dias da “Festa do Pinhão” de 2025 e
        2026 e aplique a família “Festa do Pinhão” — o YTD compara os anos
        automaticamente. Opcional: defina Segmento/Gênero para salvar uma{' '}
        <strong>regra</strong> com o nome da família e reclassificar.{' '}
        {fmtInt(resumo.familias)} famílias · {fmtInt(resumo.recorrentes)} com
        2+ edições.
      </p>

      {/* Barra de ação */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <Badge variant="secondary">{selected.size} selecionados</Badge>
        <Input
          placeholder="Nome da família (ex.: Festa do Pinhão)"
          className="h-9 w-72"
          value={familiaInput}
          onChange={(e) => {
            setFamiliaInput(e.target.value)
            setUserEdited(true)
          }}
        />
        <ClassSelect
          value={segmento}
          options={segNames}
          onChange={setSegmento}
          placeholder="Segmento"
          className="h-9 w-40"
        />
        <ClassSelect
          value={genero}
          options={genNames}
          onChange={setGenero}
          placeholder="Gênero"
          className="h-9 w-40"
        />
        <Button
          onClick={aplicarFamilia}
          disabled={saving || selected.size === 0 || !familiaInput.trim()}
        >
          <Layers className="size-4" /> Agrupar selecionados
        </Button>
        <Button
          variant="outline"
          onClick={openSuggest}
          disabled={saving || suggestions.length === 0}
        >
          <Sparkles className="size-4" /> Sugerir famílias
          {suggestions.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {suggestions.length}
            </Badge>
          )}
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={onlyUngrouped}
              onCheckedChange={(c) => setOnlyUngrouped(c === true)}
            />
            Apenas sem agrupamento
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={showAll}
              onCheckedChange={(c) => setShowAll(c === true)}
            />
            Mostrar todos (mesmo sem ano)
          </label>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={limparTudo}
            disabled={saving}
          >
            <Eraser className="size-4" /> Limpar agrupamentos
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, família ou código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <ClassSelect
          value={segFilter}
          options={segFilterOptions}
          onChange={setSegFilter}
          placeholder="Todos os segmentos"
          className="h-9 w-52"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[55vh] overflow-auto">
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
                  <TableHead className="min-w-[28rem]">Evento</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Gênero</TableHead>
                  <TableHead>Família atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baseQ.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((e) => (
                    <TableRow key={e.codigo_evento}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(e.codigo_evento)}
                          onCheckedChange={() => toggle(e.codigo_evento)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[28rem] max-w-[40rem] truncate font-medium">
                        {e.nome ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.codigo_evento}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(e.gmv)}
                      </TableCell>
                      <TableCell>
                        {e.segmento ? (
                          <Badge variant="outline">{e.segmento}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.genero ? (
                          <Badge variant="secondary">{e.genero}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.familia ? (
                          <Badge variant="outline">{e.familia}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Famílias sugeridas</DialogTitle>
            <DialogDescription>
              Eventos sem família que combinam com uma família existente ou entre
              si (pelo nome, sem o ano). Marque os que deseja agrupar.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-4 overflow-auto pr-1">
            {suggestions.map((s) => {
              const allOn = s.events.every((e) =>
                suggestChecked.has(e.codigo_evento),
              )
              return (
                <div key={s.familia} className="rounded-md border border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allOn}
                        onCheckedChange={(v) =>
                          setSuggestChecked((prev) => {
                            const next = new Set(prev)
                            for (const e of s.events) {
                              if (v === true) next.add(e.codigo_evento)
                              else next.delete(e.codigo_evento)
                            }
                            return next
                          })
                        }
                      />
                      <span className="font-medium">{s.familia}</span>
                      <Badge variant={s.existente ? 'secondary' : 'outline'}>
                        {s.existente ? 'existente' : 'nova'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {s.events.length} eventos
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {s.events.map((e) => (
                      <label
                        key={e.codigo_evento}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
                      >
                        <Checkbox
                          checked={suggestChecked.has(e.codigo_evento)}
                          onCheckedChange={(v) =>
                            setSuggestChecked((prev) => {
                              const next = new Set(prev)
                              if (v === true) next.add(e.codigo_evento)
                              else next.delete(e.codigo_evento)
                              return next
                            })
                          }
                        />
                        <span className="truncate">{e.nome ?? e.codigo_evento}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
            {suggestions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma sugestão no momento.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSuggestOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={applySuggestions}
              disabled={saving || suggestChecked.size === 0}
            >
              {saving
                ? 'Aplicando…'
                : `Aplicar (${suggestChecked.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
