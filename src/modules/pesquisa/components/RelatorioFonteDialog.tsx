import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtInt } from '@/lib/format'
import { useSourceReport, type CrawlerSource } from '../hooks/usePesquisa'

function Lista({ itens }: { itens: { label: string; sub?: string | null; qtd: number }[] }) {
  if (itens.length === 0) {
    return <div className="px-3 py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
  }
  return (
    <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
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
      <DialogContent className="max-w-2xl sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{source?.nome ?? 'Relatório'}</DialogTitle>
        </DialogHeader>

        {/* Total fixo no topo, visível em todas as abas */}
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total de eventos</div>
          <div className="text-2xl font-semibold tabular-nums">{data ? fmtInt(data.total) : '—'}</div>
        </div>

        {isLoading || !data ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <Tabs defaultValue="estado" className="w-full min-w-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="estado">Estado</TabsTrigger>
              <TabsTrigger value="cidade">Cidade</TabsTrigger>
              <TabsTrigger value="local">Local</TabsTrigger>
              <TabsTrigger value="organizador">Organizador</TabsTrigger>
            </TabsList>

            <TabsContent value="estado">
              <Lista itens={data.por_estado.map((e) => ({ label: e.uf, qtd: e.qtd }))} />
            </TabsContent>
            <TabsContent value="cidade">
              <Lista itens={data.por_cidade.map((c) => ({ label: c.cidade, sub: c.uf, qtd: c.qtd }))} />
            </TabsContent>
            <TabsContent value="local">
              <Lista itens={data.por_local.map((l) => ({
                label: l.local, sub: [l.cidade, l.uf].filter(Boolean).join('/'), qtd: l.qtd,
              }))} />
            </TabsContent>
            <TabsContent value="organizador">
              <Lista itens={data.por_organizador.map((o) => ({ label: o.organizador, qtd: o.qtd }))} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
