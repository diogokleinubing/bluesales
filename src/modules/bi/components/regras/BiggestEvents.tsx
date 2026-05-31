import { useState } from 'react'
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
import { bulkSetEventOverride } from '../../lib/rules-api'
import { biBiggestEvents } from '../../lib/rpc'
import { fmtBRL, fmtInt } from '@/lib/format'

export function BiggestEvents() {
  const { rules, orgId: rulesOrg } = useRules()
  const orgId = useOrgId()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [segmento, setSegmento] = useState('')

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
    if (!rulesOrg || selected.size === 0 || !segmento.trim()) return
    try {
      await bulkSetEventOverride(rulesOrg, [...selected], segmento.trim())
      toast.success(`${selected.size} eventos → ${segmento.trim()}`)
      setSelected(new Set())
      setSegmento('')
      reclassify.mutate()
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
          <Input
            placeholder="segmento"
            list="seg-names"
            className="h-9 w-44"
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
          />
          <Button
            onClick={applyBulk}
            disabled={selected.size === 0 || !segmento.trim()}
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
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
      <datalist id="seg-names">
        {rules.segments.map((s) => (
          <option key={s.id} value={s.nome} />
        ))}
      </datalist>
    </div>
  )
}
