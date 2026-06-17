import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useOrgId } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { biEvents, type BiEventsParams } from '../lib/rpc'
import { norm, matchesKeyword } from '../lib/classify'
import { useArtists } from '@/modules/crm/hooks/useCadastros'
import { AtracaoDialog } from '@/modules/crm/components/AtracaoDialog'
import { fmtBRL, fmtDate } from '@/lib/format'

/** Atração detectada quando seu nome (ou alias) aparece no nome do evento. */
interface AttrKw {
  nome: string
  keywords: string[]
}

/** Limpa o nome do evento p/ sugerir o nome da atração (remove o ano). */
function suggestAttr(nome: string | null): string {
  return (nome ?? '')
    .replace(/\b20(2\d|30)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s|\-–—/]+$/, '')
    .trim()
}

const DIM_LABEL: Record<string, string> = {
  segmento: 'Segmento',
  genero: 'Gênero',
  organizador: 'Organizador',
  local: 'Local',
  cidade: 'Cidade',
  uf: 'UF',
}

/**
 * Lista os eventos de um item das Análises (segmento, organizador, local…) num
 * dialog. Filtra a base do BI (bi_events) pela dimensão clicada.
 */
export function BiEventosDialog({
  dim,
  value,
  onClose,
}: {
  dim: string
  value: string | null
  onClose: () => void
}) {
  const orgId = useOrgId()
  const { year, dateBase, pdv, months } = useControls()
  const open = value != null

  const eventsQ = useQuery({
    enabled: open && !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'drill-events', orgId, year, dateBase, pdv, months, dim, value],
    queryFn: () =>
      biEvents(orgId!, year, dateBase, pdv, {
        [dim]: value,
        order: 'gmv',
        limit: 500,
        months,
      } as BiEventsParams),
  })
  const eventos = eventsQ.data ?? []
  const totalGmv = eventos.reduce((a, e) => a + Number(e.gmv), 0)

  // Atrações da base: nome + aliases normalizados, para detectar no nome do evento.
  const { data: artists } = useArtists()
  const attrKws = useMemo<AttrKw[]>(
    () =>
      (artists ?? []).map((a) => ({
        nome: a.nome,
        keywords: [a.nome, ...(a.aliases ? a.aliases.split(',') : [])]
          .map((s) => norm(s))
          .filter(Boolean),
      })),
    [artists],
  )
  function detectar(nome: string | null): string[] {
    const t = norm(nome)
    if (!t) return []
    return attrKws.filter((a) => a.keywords.some((kw) => matchesKeyword(t, kw))).map((a) => a.nome)
  }

  // Cadastro rápido de atração a partir de um evento (nome pré-preenchido).
  const [addNome, setAddNome] = useState<string | null>(null)

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[97vw] max-w-[1100px] sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>
            {DIM_LABEL[dim] ?? 'Item'}: {value}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {eventsQ.isLoading
              ? 'Carregando…'
              : `${eventos.length} evento(s) em ${year} · ${fmtBRL(totalGmv)}`}
          </p>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead className="w-[200px]">Atração</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead className="w-[200px]">Local</TableHead>
                <TableHead className="w-[140px]">Cidade</TableHead>
                <TableHead className="w-[130px] text-right">GMV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : eventos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum evento.
                  </TableCell>
                </TableRow>
              ) : (
                eventos.map((e) => {
                  const atr = detectar(e.nome)
                  return (
                  <TableRow key={e.codigo_evento}>
                    <TableCell className="truncate font-medium" title={e.nome ?? undefined}>
                      {e.nome ?? '—'}
                    </TableCell>
                    <TableCell className="truncate" title={atr.join(', ') || undefined}>
                      {atr.length > 0 ? (
                        atr.join(', ')
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddNome(suggestAttr(e.nome))}
                          title="Cadastrar atração"
                          className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
                        >
                          <Plus className="size-4" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {e.data_evento ? fmtDate(e.data_evento) : '—'}
                    </TableCell>
                    <TableCell className="truncate text-muted-foreground" title={e.local ?? undefined}>
                      {e.local ?? '—'}
                    </TableCell>
                    <TableCell className="truncate text-muted-foreground">
                      {[e.cidade, e.uf].filter(Boolean).join('/') || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {fmtBRL(Number(e.gmv))}
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>

    <AtracaoDialog
      open={addNome != null}
      onOpenChange={(o) => !o && setAddNome(null)}
      initial={{ nome: addNome ?? '' }}
      onSaved={() => setAddNome(null)}
    />
    </>
  )
}
