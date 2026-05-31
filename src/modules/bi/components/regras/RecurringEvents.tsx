import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  reclassifyFamilias,
  setFamilyOverride,
} from '../../lib/family-api'
import { familiaFromName } from '../../lib/family'
import { norm } from '../../lib/classify'
import { fmtInt } from '@/lib/format'

interface EvRow {
  codigo_evento: string
  nome: string | null
  familia: string | null
}

async function fetchFamilyEvents(orgId: string): Promise<EvRow[]> {
  const all: EvRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('codigo_evento, nome, familia')
      .eq('org_id', orgId)
      .order('familia', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as EvRow[]
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
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const eventsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'family-events', orgId],
    queryFn: () => fetchFamilyEvents(orgId!),
  })

  const events = eventsQ.data ?? []

  const filtered = useMemo(() => {
    const q = norm(search)
    const list = q
      ? events.filter(
          (e) =>
            norm(e.nome).includes(q) ||
            norm(e.familia).includes(q) ||
            e.codigo_evento.includes(q),
        )
      : events
    return list.slice(0, 500)
  }, [events, search])

  // Resumo: quantas famílias e quantas têm 2+ edições.
  const resumo = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      const f = e.familia ?? '(sem família)'
      counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    let recorrentes = 0
    for (const c of counts.values()) if (c >= 2) recorrentes++
    return { familias: counts.size, recorrentes }
  }, [events])

  async function reagruparAuto() {
    if (!orgId) return
    setSaving(true)
    try {
      const n = await reclassifyFamilias(orgId)
      await qc.invalidateQueries({ queryKey: ['bi'] })
      toast.success('Eventos reagrupados', { description: `${n} eventos atualizados.` })
    } catch (e) {
      toast.error('Erro ao reagrupar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function salvarEdicoes() {
    if (!orgId) return
    const entries = Object.entries(edits).filter(([, v]) => v.trim())
    if (entries.length === 0) return
    setSaving(true)
    try {
      for (const [codigo, familia] of entries) {
        await setFamilyOverride(orgId, codigo, familia.trim())
      }
      await reclassifyFamilias(orgId)
      setEdits({})
      await qc.invalidateQueries({ queryKey: ['bi'] })
      await qc.invalidateQueries({ queryKey: ['bi', 'family-events', orgId] })
      toast.success('Famílias atualizadas', {
        description: `${entries.length} override(s) aplicado(s).`,
      })
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const pendentes = Object.values(edits).filter((v) => v.trim()).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {fmtInt(resumo.familias)} famílias · {fmtInt(resumo.recorrentes)} com
          2+ edições. Edite a família para mesclar/corrigir; o nome sem o ano é
          sugerido automaticamente.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reagruparAuto} disabled={saving}>
            <RefreshCw className={`size-4 ${saving ? 'animate-spin' : ''}`} />
            Reagrupar (sugestão)
          </Button>
          <Button onClick={salvarEdicoes} disabled={saving || pendentes === 0}>
            <Save className="size-4" /> Salvar {pendentes > 0 ? `(${pendentes})` : ''}
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
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="w-80">Família (recorrente)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => {
                    const suggestion = familiaFromName(e.nome) ?? ''
                    const value = edits[e.codigo_evento] ?? e.familia ?? ''
                    return (
                      <TableRow key={e.codigo_evento}>
                        <TableCell className="max-w-72 truncate font-medium">
                          {e.nome ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {e.codigo_evento}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8"
                              value={value}
                              placeholder={suggestion}
                              onChange={(ev) =>
                                setEdits((p) => ({
                                  ...p,
                                  [e.codigo_evento]: ev.target.value,
                                }))
                              }
                            />
                            {e.familia &&
                              suggestion &&
                              e.familia !== suggestion && (
                                <Badge variant="outline" className="shrink-0">
                                  manual
                                </Badge>
                              )}
                          </div>
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
    </div>
  )
}
