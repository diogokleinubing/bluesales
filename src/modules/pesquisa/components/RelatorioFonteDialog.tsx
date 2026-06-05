import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtInt } from '@/lib/format'
import { useSourceReport, type CrawlerSource } from '../hooks/usePesquisa'

function Secao({
  titulo,
  itens,
}: {
  titulo: string
  itens: { label: string; sub?: string | null; qtd: number }[]
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-3 py-2 text-sm font-medium">
        {titulo} <span className="text-muted-foreground">({itens.length})</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {itens.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">—</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {itens.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {it.label}
                  {it.sub ? <span className="ml-1 text-xs text-muted-foreground">· {it.sub}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{fmtInt(it.qtd)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function RelatorioFonteDialog({
  source,
  onOpenChange,
}: {
  source: CrawlerSource | null
  onOpenChange: (o: boolean) => void
}) {
  const { data, isLoading } = useSourceReport(source?.id ?? null)

  return (
    <Dialog open={!!source} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {source?.nome ?? 'Relatório'}
            {data ? <span className="ml-2 text-muted-foreground">· {fmtInt(data.total)} eventos</span> : null}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Secao titulo="Por estado" itens={data.por_estado.map((e) => ({ label: e.uf, qtd: e.qtd }))} />
            <Secao titulo="Por cidade (top 100)" itens={data.por_cidade.map((c) => ({
              label: c.cidade, sub: c.uf, qtd: c.qtd,
            }))} />
            <Secao titulo="Por local (top 100)" itens={data.por_local.map((l) => ({
              label: l.local, sub: [l.cidade, l.uf].filter(Boolean).join('/'), qtd: l.qtd,
            }))} />
            <Secao titulo="Por organizador (top 100)" itens={data.por_organizador.map((o) => ({
              label: o.organizador, qtd: o.qtd,
            }))} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
