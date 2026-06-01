import { useMemo, useState } from 'react'
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
import { setVenueClassification } from '../../lib/rules-api'
import { biPopularVenues } from '../../lib/rpc'
import { norm } from '../../lib/classify'
import { ClassSelect } from './ClassSelect'
import { fmtInt } from '@/lib/format'

interface Draft {
  segmento: string | null
  genero: string | null
}

export function PopularVenues() {
  const { rules, orgId: rulesOrg } = useRules()
  const orgId = useOrgId()
  const reclassify = useReclassify(orgId)
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])

  const venuesQ = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'popular-venues', orgId, search],
    queryFn: () => biPopularVenues(orgId!, search, 200),
  })

  const venueMapByNorm = useMemo(
    () => new Map(rules.venueMap.map((v) => [norm(v.local), v])),
    [rules.venueMap],
  )

  function draftFor(local: string): Draft {
    if (drafts[local]) return drafts[local]
    const cur = venueMapByNorm.get(norm(local))
    return { segmento: cur?.segmento ?? null, genero: cur?.genero ?? null }
  }

  async function assign(local: string) {
    const d = draftFor(local)
    if (!rulesOrg || (!d.segmento && !d.genero)) return
    try {
      await setVenueClassification(rulesOrg, local, d.segmento, d.genero)
      toast.success(`Local "${local}" classificado`)
      reclassify.mutate({ local })
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
                  <TableHead>Atual</TableHead>
                  <TableHead className="w-44">Segmento</TableHead>
                  <TableHead className="w-44">Gênero musical</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venuesQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (
                  (venuesQ.data ?? []).map((v) => {
                    const cur = venueMapByNorm.get(norm(v.local))
                    const d = draftFor(v.local)
                    return (
                      <TableRow key={v.local}>
                        <TableCell className="max-w-56 truncate font-medium">
                          {v.local}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtInt(Number(v.eventos))}
                        </TableCell>
                        <TableCell>
                          {cur?.segmento || cur?.genero ? (
                            <div className="flex flex-wrap gap-1">
                              {cur.segmento && (
                                <Badge variant="secondary">{cur.segmento}</Badge>
                              )}
                              {cur.genero && (
                                <Badge variant="outline">{cur.genero}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ClassSelect
                            value={d.segmento}
                            options={segNames}
                            onChange={(val) =>
                              setDrafts((p) => ({
                                ...p,
                                [v.local]: { ...d, segmento: val },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <ClassSelect
                            value={d.genero}
                            options={genNames}
                            onChange={(val) =>
                              setDrafts((p) => ({
                                ...p,
                                [v.local]: { ...d, genero: val },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => assign(v.local)}
                          >
                            Aplicar
                          </Button>
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
