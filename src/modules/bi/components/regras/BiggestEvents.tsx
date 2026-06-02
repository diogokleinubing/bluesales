import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { setEventManual } from '../../lib/rules-api'
import { biBiggestEvents } from '../../lib/rpc'
import { ClassSelect } from './ClassSelect'
import { fmtBRL, fmtInt } from '@/lib/format'

export function BiggestEvents() {
  const { rules, orgId: rulesOrg } = useRules()
  const orgId = useOrgId()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])

  const eventsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'biggest-events', orgId, search],
    queryFn: () => biBiggestEvents(orgId!, search, 200),
  })
  const visible = eventsQ.data ?? []

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

  async function applyBulk() {
    if (!rulesOrg || selected.size === 0 || (!segmento && !genero)) return
    try {
      const codigos = [...selected]
      const patch: { segmento_manual?: string; genero_manual?: string } = {}
      if (segmento) patch.segmento_manual = segmento
      if (genero) patch.genero_manual = genero
      await setEventManual(rulesOrg, codigos, patch)
      // Reclassifica os afetados: dimensões manuais ficam, as demais recalculam.
      reclassify.mutate({ codigos })
      toast.success(`${codigos.length} eventos definidos manualmente`)
      setSelected(new Set())
      setSegmento(null)
      setGenero(null)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
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
            onClick={applyBulk}
            disabled={selected.size === 0 || (!segmento && !genero)}
          >
            Aplicar em lote
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
                  <TableHead>Segmento</TableHead>
                  <TableHead>Gênero</TableHead>
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
                  visible.map((e) => (
                    <TableRow key={e.codigo_evento}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(e.codigo_evento)}
                          onCheckedChange={() => toggle(e.codigo_evento)}
                        />
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-medium">
                        {e.nome ?? e.codigo_evento}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {e.organizador ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {e.segmento ?? 'Sem segmento'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {e.genero ? (
                          <Badge variant="secondary">{e.genero}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(Number(e.qtd))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(Number(e.gmv))}
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
