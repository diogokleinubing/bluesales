import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { GroupAgg } from '../lib/aggregate'
import { BiEventosDialog } from './BiEventosDialog'
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format'

interface YearGroup {
  ano: number | null
  label: string
  orgs: GroupAgg[]
  eventos: number
  gmv: number
  value: number
}

/**
 * Organizadores agrupados pelo ano "Desde" (cliente desde), com uma linha
 * totalizadora por ano que expande para mostrar os organizadores daquele ano.
 */
export function OrganizadoresPorAno({
  groups,
  desdeOf,
  metricLabel,
  loading,
}: {
  groups: GroupAgg[]
  desdeOf?: (label: string) => number | null
  metricLabel: string
  loading?: boolean
}) {
  const totalGmv = groups.reduce((a, g) => a + g.gmv, 0)
  const [drillSel, setDrillSel] = useState<string | null>(null)

  const years = useMemo<YearGroup[]>(() => {
    const map = new Map<string, YearGroup>()
    for (const g of groups) {
      const ano = desdeOf?.(g.label) ?? null
      const key = ano == null ? '∅' : String(ano)
      let yg = map.get(key)
      if (!yg) {
        yg = { ano, label: ano == null ? 'Sem ano' : String(ano), orgs: [], eventos: 0, gmv: 0, value: 0 }
        map.set(key, yg)
      }
      yg.orgs.push(g)
      yg.eventos += g.eventos
      yg.gmv += g.gmv
      yg.value += g.value
    }
    const arr = [...map.values()]
    for (const y of arr) y.orgs.sort((a, b) => b.value - a.value)
    // Anos do mais recente para o mais antigo; "Sem ano" por último.
    arr.sort((a, b) => {
      if (a.ano == null) return 1
      if (b.ano == null) return -1
      return b.ano - a.ano
    })
    return arr
  }, [groups, desdeOf])

  const maxYearValue = years.reduce((m, y) => Math.max(m, y.value), 0)
  const maxOrgValue = groups.reduce((m, g) => Math.max(m, g.value), 0)

  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  function drill(label: string) {
    if (label && label !== '—') setDrillSel(label)
  }

  const Bar = ({ value, max }: { value: number; max: number }) => (
    <div
      className="h-2.5 rounded-sm bg-primary"
      title={`${metricLabel}: ${fmtBRL(value)}`}
      style={{ width: `${max > 0 ? Math.max(2, (value / max) * 250) : 0}px` }}
    />
  )

  return (
    <>
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ano (Desde)</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">GMV</TableHead>
                <TableHead className="text-right">% do total</TableHead>
                <TableHead className="w-[250px]">Proporção</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : years.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Sem dados para o período.
                  </TableCell>
                </TableRow>
              ) : (
                years.map((y) => {
                  const key = y.ano == null ? '∅' : String(y.ano)
                  const isOpen = open.has(key)
                  return (
                    <Fragment key={key}>
                      <TableRow
                        className="cursor-pointer bg-muted/30 font-medium hover:bg-muted/50"
                        onClick={() => toggle(key)}
                      >
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            {y.label}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({y.orgs.length})
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(y.eventos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(y.gmv)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtPct(totalGmv > 0 ? y.gmv / totalGmv : 0)}
                        </TableCell>
                        <TableCell><Bar value={y.value} max={maxYearValue} /></TableCell>
                      </TableRow>
                      {isOpen &&
                        y.orgs.map((g) => (
                          <TableRow key={g.key}>
                            <TableCell className="pl-10">
                              <button
                                className="text-left hover:text-primary hover:underline"
                                onClick={() => drill(g.label)}
                              >
                                {g.label}
                              </button>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtInt(g.eventos)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtBRL(g.gmv)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {fmtPct(totalGmv > 0 ? g.gmv / totalGmv : 0)}
                            </TableCell>
                            <TableCell><Bar value={g.value} max={maxOrgValue} /></TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <BiEventosDialog dim="organizador" value={drillSel} onClose={() => setDrillSel(null)} />
    </>
  )
}
