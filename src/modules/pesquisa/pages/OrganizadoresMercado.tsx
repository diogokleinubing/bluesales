import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtBRL, fmtDate } from '@/lib/format'
import { ListView, ToolbarSearch } from '@/modules/crm/components/ListView'
import { EventosDialog } from '../components/EventosDialog'
import { useCrawledEvents } from '../hooks/usePesquisa'

interface Agg {
  nome: string
  eventos: number
  cidades: Set<string>
  fontes: Set<string>
  proximo: string | null
  precoMin: number | null
  precoMax: number | null
}

export function faixaPreco(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null && min !== max) return `${fmtBRL(min)} – ${fmtBRL(max)}`
  return fmtBRL(min ?? max)
}

export function acumulaPreco(a: { precoMin: number | null; precoMax: number | null }, e: { preco_min: number | null; preco_max: number | null }) {
  const pmin = e.preco_min ?? e.preco_max
  const pmax = e.preco_max ?? e.preco_min
  if (pmin != null) a.precoMin = a.precoMin == null ? pmin : Math.min(a.precoMin, pmin)
  if (pmax != null) a.precoMax = a.precoMax == null ? pmax : Math.max(a.precoMax, pmax)
}

export function OrganizadoresMercado() {
  const { data, isLoading } = useCrawledEvents()
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  const eventosDoSel = useMemo(
    () => (sel ? (data ?? []).filter((e) => (e.organizador_raw ?? '').trim() === sel && !e.ignorado) : []),
    [data, sel],
  )

  const aggregated = useMemo(() => {
    const map = new Map<string, Agg>()
    const hoje = new Date().toISOString()
    for (const e of data ?? []) {
      const nome = (e.organizador_raw ?? '').trim()
      if (!nome || e.ignorado) continue
      let a = map.get(nome)
      if (!a) { a = { nome, eventos: 0, cidades: new Set(), fontes: new Set(), proximo: null, precoMin: null, precoMax: null }; map.set(nome, a) }
      a.eventos++
      acumulaPreco(a, e)
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
              Nenhum organizador detectado ainda.
            </TableCell></TableRow>
          ) : rows.map((a) => (
            <TableRow key={a.nome} className="cursor-pointer" onClick={() => setSel(a.nome)}>
              <TableCell className="font-medium">{a.nome}</TableCell>
              <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
              <TableCell className="text-muted-foreground">{[...a.cidades].slice(0, 3).join(', ')}{a.cidades.size > 3 ? ` +${a.cidades.size - 3}` : ''}</TableCell>
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
        titulo={sel ?? ''}
        subtitulo={`${eventosDoSel.length} evento(s) capturado(s)`}
        eventos={eventosDoSel}
      />
    </ListView>
  )
}
