import { useMemo, useState } from 'react'
import { toast } from 'sonner'
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
import { useDataset } from '../../lib/dataset'
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import { setVenueSegment } from '../../lib/rules-api'
import { norm } from '../../lib/classify'
import { fmtInt } from '@/lib/format'

interface VenueRow {
  local: string
  eventos: number
}

export function PopularVenues() {
  const { sales, isLoading } = useDataset()
  const { rules, orgId } = useRules()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [segInputs, setSegInputs] = useState<Record<string, string>>({})

  const venueMapByNorm = useMemo(
    () => new Map(rules.venueMap.map((v) => [norm(v.local), v.segmento])),
    [rules.venueMap],
  )

  const venues = useMemo<VenueRow[]>(() => {
    const map = new Map<string, Set<string>>()
    for (const s of sales) {
      if (!s.local) continue
      const set = map.get(s.local) ?? new Set<string>()
      set.add(s.codigo_evento)
      map.set(s.local, set)
    }
    return [...map.entries()]
      .map(([local, set]) => ({ local, eventos: set.size }))
      .sort((a, b) => b.eventos - a.eventos)
  }, [sales])

  const filtered = useMemo(() => {
    const q = norm(search)
    return q ? venues.filter((v) => norm(v.local).includes(q)) : venues
  }, [venues, search])

  async function assign(local: string) {
    const segmento = (segInputs[local] ?? '').trim()
    if (!orgId || !segmento) return
    try {
      await setVenueSegment(orgId, local, segmento)
      toast.success(`Local "${local}" → ${segmento}`)
      reclassify.mutate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar local…"
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
                  <TableHead>Local</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead>Segmento atual</TableHead>
                  <TableHead className="w-72">Atribuir segmento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, 200).map((v) => (
                    <TableRow key={v.local}>
                      <TableCell className="max-w-64 truncate font-medium">
                        {v.local}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(v.eventos)}
                      </TableCell>
                      <TableCell>
                        {venueMapByNorm.has(norm(v.local)) ? (
                          <Badge variant="secondary">
                            {venueMapByNorm.get(norm(v.local))}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Input
                            placeholder="segmento"
                            list="seg-names"
                            className="h-8"
                            value={segInputs[v.local] ?? ''}
                            onChange={(e) =>
                              setSegInputs((p) => ({
                                ...p,
                                [v.local]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => assign(v.local)}
                          >
                            Aplicar
                          </Button>
                        </div>
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
