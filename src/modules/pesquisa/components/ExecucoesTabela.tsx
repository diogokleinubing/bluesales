import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCrawlerRuns, type CrawlerRunRow } from '../hooks/usePesquisa'

function statusBadge(s: string) {
  if (s === 'done') return <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Concluída</Badge>
  if (s === 'error') return <Badge variant="destructive">Erro</Badge>
  return <Badge variant="secondary">Em execução</Badge>
}

function duracao(r: CrawlerRunRow): string {
  if (!r.finalizado_em) return '—'
  const ms = new Date(r.finalizado_em).getTime() - new Date(r.iniciado_em).getTime()
  if (ms < 1000) return '<1s'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Tabela do histórico de execuções (reusada em Sites e na página Execuções). */
export function ExecucoesTabela({ limit }: { limit?: number }) {
  const { data, isLoading } = useCrawlerRuns()
  const rows = limit ? (data ?? []).slice(0, limit) : (data ?? [])

  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>Origem</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Vistos</TableHead>
          <TableHead className="text-right">Novos</TableHead>
          <TableHead className="text-right">Ignorados</TableHead>
          <TableHead className="text-right">Erros</TableHead>
          <TableHead>Duração</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
              Nenhuma execução registrada ainda.
            </TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{quando(r.iniciado_em)}</TableCell>
              <TableCell><Badge variant="outline">{r.source_nome ?? '—'}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{r.disparado_por === 'manual' ? 'Manual' : 'Automática'}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.eventos_vistos}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{r.eventos_novos}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{r.eventos_ignorados}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.erros > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{r.erros}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{duracao(r)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}
