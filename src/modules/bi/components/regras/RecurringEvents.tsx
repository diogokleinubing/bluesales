import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Layers } from 'lucide-react'
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
import { supabase } from '@/lib/supabase'
import { useOrgId } from '../../hooks/useBi'
import { biBiggestEvents } from '../../lib/rpc'
import { reclassifyFamilias, setFamilyOverride } from '../../lib/family-api'
import { suggestFamily } from '../../lib/family'
import { norm } from '../../lib/classify'
import { fmtBRL, fmtInt } from '@/lib/format'

interface EvRow {
  codigo_evento: string
  nome: string | null
  familia: string | null
  receita: number
}

/** Título tem um ano entre 2020 e 2030? (candidato a evento recorrente) */
export function hasYearInTitle(nome: string | null): boolean {
  if (!nome) return false
  return /\b(20(2\d|30))\b/.test(nome)
}


async function fetchEventsBase(
  orgId: string,
): Promise<Omit<EvRow, 'receita'>[]> {
  const all: Omit<EvRow, 'receita'>[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('codigo_evento, nome, familia')
      .eq('org_id', orgId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Omit<EvRow, 'receita'>[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

export function RecurringEvents() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [familiaInput, setFamiliaInput] = useState('')
  const [userEdited, setUserEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  const baseQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'family-events', orgId],
    queryFn: async (): Promise<EvRow[]> => {
      const [evs, rev] = await Promise.all([
        fetchEventsBase(orgId!),
        biBiggestEvents(orgId!, '', 10000),
      ])
      const revMap = new Map(
        rev.map((r) => [r.codigo_evento, Number(r.receita_bt)]),
      )
      return evs
        .map((e) => ({ ...e, receita: revMap.get(e.codigo_evento) ?? 0 }))
        .sort((a, b) => b.receita - a.receita)
    },
  })

  const events = baseQ.data ?? []

  const visible = useMemo(() => {
    const q = norm(search)
    return events
      .filter((e) => (showAll ? true : hasYearInTitle(e.nome)))
      .filter(
        (e) =>
          !q ||
          norm(e.nome).includes(q) ||
          norm(e.familia).includes(q) ||
          e.codigo_evento.includes(q),
      )
      .slice(0, 500)
  }, [events, search, showAll])

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
      for (const codigo of selected) {
        await setFamilyOverride(orgId, codigo, familia)
      }
      await reclassifyFamilias(orgId)
      setSelected(new Set())
      setFamiliaInput('')
      setUserEdited(false)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success('Eventos agrupados', {
        description: `${selected.size} eventos → "${familia}".`,
      })
    } catch (e) {
      toast.error('Erro ao agrupar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function reagruparAuto() {
    if (!orgId) return
    setSaving(true)
    try {
      const n = await reclassifyFamilias(orgId)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success('Sugestão aplicada', { description: `${n} eventos atualizados.` })
    } catch (e) {
      toast.error('Erro ao reagrupar', { description: (e as Error).message })
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
        automaticamente. {fmtInt(resumo.familias)} famílias ·{' '}
        {fmtInt(resumo.recorrentes)} com 2+ edições.
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
        <Button
          onClick={aplicarFamilia}
          disabled={saving || selected.size === 0 || !familiaInput.trim()}
        >
          <Layers className="size-4" /> Agrupar selecionados
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={showAll}
              onCheckedChange={(c) => setShowAll(c === true)}
            />
            Mostrar todos (mesmo sem ano)
          </label>
          <Button variant="secondary" onClick={reagruparAuto} disabled={saving}>
            <RefreshCw className={`size-4 ${saving ? 'animate-spin' : ''}`} />
            Reagrupar (sugestão)
          </Button>
        </div>
      </div>

      <Input
        placeholder="Buscar por nome, família ou código…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

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
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead>Família atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baseQ.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
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
                        {fmtBRL(e.receita)}
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
    </div>
  )
}
