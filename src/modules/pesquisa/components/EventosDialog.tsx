import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { CopyUrlButton } from './CopyUrlButton'
import { faixaPreco } from '../lib/preco'
import type { CrawledEventRow } from '../hooks/usePesquisa'

/** Lista os eventos de um local/organizador num dialog (com Copiar URL). */
export function EventosDialog({
  open,
  onOpenChange,
  titulo,
  subtitulo,
  eventos,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  subtitulo?: string
  eventos: CrawledEventRow[]
}) {
  const ordenados = [...eventos].sort((a, b) =>
    (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Organizador</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead className="w-12" />
            </TableRow></TableHeader>
            <TableBody>
              {ordenados.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum evento.
                </TableCell></TableRow>
              ) : ordenados.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-[260px] truncate font-medium">{e.nome}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">{e.organizador_raw ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{e.data_inicio ? fmtDate(e.data_inicio) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {e.gratuito ? 'Grátis' : faixaPreco(e.preco_min, e.preco_max)}
                  </TableCell>
                  <TableCell><Badge variant="outline">{e.source_nome ?? e.source_slug ?? '—'}</Badge></TableCell>
                  <TableCell><CopyUrlButton url={e.url_evento} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
