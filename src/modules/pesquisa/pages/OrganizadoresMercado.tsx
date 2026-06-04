import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { ListView, ToolbarSearch } from '@/modules/crm/components/ListView'
import { useCrawledEvents } from '../hooks/usePesquisa'

interface Agg {
  nome: string
  eventos: number
  cidades: Set<string>
  fontes: Set<string>
  proximo: string | null
}

export function OrganizadoresMercado() {
  const { data, isLoading } = useCrawledEvents()
  const [search, setSearch] = useState('')

  const aggregated = useMemo(() => {
    const map = new Map<string, Agg>()
    const hoje = new Date().toISOString()
    for (const e of data ?? []) {
      const nome = (e.organizador_raw ?? '').trim()
      if (!nome || e.ignorado) continue
      let a = map.get(nome)
      if (!a) { a = { nome, eventos: 0, cidades: new Set(), fontes: new Set(), proximo: null }; map.set(nome, a) }
      a.eventos++
      if (e.cidade) a.cidades.add(`${e.cidade}${e.uf ? `/${e.uf}` : ''}`)
      if (e.source_nome) a.fontes.add(e.source_nome)
      if (e.data_inicio && e.data_inicio >= hoje && (!a.proximo || e.data_inicio < a.proximo)) {
        a.proximo = e.data_inicio
      }
    }
    return [...map.values()].sort((x, y) => y.eventos - x.eventos)
  }, [data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return aggregated.filter((a) => !q || a.nome.toLowerCase().includes(q))
  }, [aggregated, search])

  return (
    <ListView
      title="Organizadores"
      count={aggregated.length ? String(aggregated.length) : undefined}
      footer={aggregated.length ? `${rows.length} de ${aggregated.length}` : undefined}
      toolbar={<ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar organizador…" />}
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Organizador</TableHead>
          <TableHead className="text-right">Eventos</TableHead>
          <TableHead>Cidades</TableHead>
          <TableHead>Fontes</TableHead>
          <TableHead>Próximo evento</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
              Nenhum organizador detectado ainda.
            </TableCell></TableRow>
          ) : rows.map((a) => (
            <TableRow key={a.nome}>
              <TableCell className="font-medium">{a.nome}</TableCell>
              <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
              <TableCell className="text-muted-foreground">{[...a.cidades].slice(0, 3).join(', ')}{a.cidades.size > 3 ? ` +${a.cidades.size - 3}` : ''}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{[...a.fontes].map((f) => <Badge key={f} variant="outline">{f}</Badge>)}</div></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{a.proximo ? fmtDate(a.proximo) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListView>
  )
}
