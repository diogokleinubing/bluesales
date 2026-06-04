import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { ListView, ToolbarSearch } from '@/modules/crm/components/ListView'
import { EventosDialog } from '../components/EventosDialog'
import { faixaPreco, acumulaPreco } from './OrganizadoresMercado'
import { useCrawledEvents } from '../hooks/usePesquisa'

interface Agg {
  key: string
  nome: string
  cidade: string | null
  eventos: number
  fontes: Set<string>
  proximo: string | null
  precoMin: number | null
  precoMax: number | null
}

export function LocaisMercado() {
  const { data, isLoading } = useCrawledEvents()
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<Agg | null>(null)

  const eventosDoSel = useMemo(() => {
    if (!sel) return []
    return (data ?? []).filter((e) => {
      if (e.ignorado) return false
      const nome = (e.local_raw ?? '').trim().toLowerCase()
      const cidade = e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : null
      return nome === sel.nome.toLowerCase() && cidade === sel.cidade
    })
  }, [data, sel])

  const aggregated = useMemo(() => {
    const map = new Map<string, Agg>()
    const hoje = new Date().toISOString()
    for (const e of data ?? []) {
      const nome = (e.local_raw ?? '').trim()
      if (!nome || e.ignorado) continue
      const cidade = e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : null
      const key = `${nome.toLowerCase()}|${cidade ?? ''}`
      let a = map.get(key)
      if (!a) { a = { key, nome, cidade, eventos: 0, fontes: new Set(), proximo: null, precoMin: null, precoMax: null }; map.set(key, a) }
      a.eventos++
      acumulaPreco(a, e)
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
      title="Locais"
      count={aggregated.length ? String(aggregated.length) : undefined}
      footer={aggregated.length ? `${rows.length} de ${aggregated.length}` : undefined}
      toolbar={<ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar local…" />}
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead className="text-right">Eventos</TableHead>
          <TableHead className="text-right">Faixa de preço</TableHead>
          <TableHead>Fontes</TableHead>
          <TableHead>Próximo evento</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
              Nenhum local detectado ainda.
            </TableCell></TableRow>
          ) : rows.map((a) => (
            <TableRow key={a.key} className="cursor-pointer" onClick={() => setSel(a)}>
              <TableCell className="font-medium">{a.nome}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{a.cidade ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">{faixaPreco(a.precoMin, a.precoMax)}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{[...a.fontes].map((f) => <Badge key={f} variant="outline">{f}</Badge>)}</div></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{a.proximo ? fmtDate(a.proximo) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <EventosDialog
        open={!!sel}
        onOpenChange={(o) => !o && setSel(null)}
        titulo={sel?.nome ?? ''}
        subtitulo={[sel?.cidade, `${eventosDoSel.length} evento(s) capturado(s)`].filter(Boolean).join(' · ')}
        eventos={eventosDoSel}
      />
    </ListView>
  )
}
