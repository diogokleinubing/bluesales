import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import { useOrgId } from '../../hooks/useBi'
import { setVenueSegment } from '../../lib/rules-api'
import { biPopularVenues } from '../../lib/rpc'
import { norm } from '../../lib/classify'
import { fmtInt } from '@/lib/format'

export function PopularVenues() {
  const { rules, orgId: rulesOrg } = useRules()
  const orgId = useOrgId()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [segInputs, setSegInputs] = useState<Record<string, string>>({})

  const venuesQ = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'popular-venues', orgId, search],
    queryFn: () => biPopularVenues(orgId!, search, 200),
  })

  const venueMapByNorm = new Map(
    rules.venueMap.map((v) => [norm(v.local), v.segmento]),
  )

  async function assign(local: string) {
    const segmento = (segInputs[local] ?? '').trim()
    if (!rulesOrg || !segmento) return
    try {
      await setVenueSegment(rulesOrg, local, segmento)
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
                {venuesQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (
                  (venuesQ.data ?? []).map((v) => (
                    <TableRow key={v.local}>
                      <TableCell className="max-w-64 truncate font-medium">
                        {v.local}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt(Number(v.eventos))}
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
