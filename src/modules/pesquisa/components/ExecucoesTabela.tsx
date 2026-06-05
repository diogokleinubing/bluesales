import { useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
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

function quandoCompleto(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Tabela do histórico de execuções (reusada em Sites e na página Execuções). */
export function ExecucoesTabela({ limit }: { limit?: number }) {
  const { data, isLoading } = useCrawlerRuns()
  const rows = limit ? (data ?? []).slice(0, limit) : (data ?? [])
  const [aberta, setAberta] = useState<CrawlerRunRow | null>(null)

  return (
    <>
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
            <TableHead className="w-10"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
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
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Detalhes da execução"
                    onClick={() => setAberta(r)}
                  >
                    <Search className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da execução</DialogTitle>
            <DialogDescription>
              {aberta?.source_nome ?? '—'} · {aberta && quandoCompleto(aberta.iniciado_em)}
            </DialogDescription>
          </DialogHeader>
          {aberta && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Resumo label="Status" valor={aberta.status === 'done' ? 'Concluída' : aberta.status === 'error' ? 'Erro' : 'Em execução'} />
                <Resumo label="Origem" valor={aberta.disparado_por === 'manual' ? 'Manual' : 'Automática'} />
                <Resumo label="Vistos" valor={String(aberta.eventos_vistos)} />
                <Resumo label="Novos" valor={String(aberta.eventos_novos)} />
                <Resumo label="Ignorados" valor={String(aberta.eventos_ignorados)} />
                <Resumo label="Duração" valor={duracao(aberta)} />
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observação</p>
                {aberta.observacao ? (
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    {aberta.observacao}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">Sem observação registrada para esta execução.</p>
                )}
              </div>

              {aberta.erro_msg && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-destructive">Erro</p>
                  <pre className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs leading-relaxed text-destructive">
                    {aberta.erro_msg}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{valor}</p>
    </div>
  )
}
