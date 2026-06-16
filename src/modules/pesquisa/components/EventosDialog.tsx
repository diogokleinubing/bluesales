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
  loading = false,
  showOrganizador = true,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  subtitulo?: string
  eventos: CrawledEventRow[]
  /** Enquanto a chamada da API está em andamento, exibe "Carregando…". */
  loading?: boolean
  /** Exibe a coluna Organizador (redundante no diálogo de um organizador). */
  showOrganizador?: boolean
}) {
  const ordenados = [...eventos].sort((a, b) =>
    (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[97vw] max-w-[1280px] sm:max-w-[1280px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <Table className="w-full table-fixed">
            <TableHeader><TableRow>
              <TableHead>Evento</TableHead>
              {showOrganizador && <TableHead className="w-[220px]">Organizador</TableHead>}
              <TableHead className="w-[110px]">Data</TableHead>
              <TableHead className="w-[150px] text-right">Valor</TableHead>
              <TableHead className="w-[150px]">Fonte</TableHead>
              <TableHead className="w-12" />
            </TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={showOrganizador ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell></TableRow>
              ) : ordenados.length === 0 ? (
                <TableRow><TableCell colSpan={showOrganizador ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  Nenhum evento.
                </TableCell></TableRow>
              ) : ordenados.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="truncate font-medium" title={e.nome}>{e.nome}</TableCell>
                  {showOrganizador && <TableCell className="truncate text-muted-foreground" title={e.organizador_raw ?? undefined}>{e.organizador_raw ?? '—'}</TableCell>}
                  <TableCell className="whitespace-nowrap text-muted-foreground">{e.data_inicio ? fmtDate(e.data_inicio) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {e.gratuito ? 'Grátis' : faixaPreco(e.preco_min, e.preco_max)}
                  </TableCell>
                  <TableCell className="truncate">
                    <Badge variant="outline" className="max-w-full truncate">{e.source_nome ?? e.source_slug ?? '—'}</Badge>
                  </TableCell>
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
