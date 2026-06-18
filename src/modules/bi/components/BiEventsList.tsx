import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOrgId } from '../hooks/useBi'
import { useControls } from '@/modules/shared/controls-context'
import { biEvents, type BiEventsParams, type EventRow } from '../lib/rpc'
import { norm, matchesKeyword } from '../lib/classify'
import { useArtists } from '@/modules/crm/hooks/useCadastros'
import { fmtBRL, fmtDate } from '@/lib/format'

/** Sort da tabela-pai (RankingView) para ordenar os eventos do mesmo jeito. */
export type EventSortRef = { col: string; dir: 'asc' | 'desc' } | null

/** Colunas presentes na tabela-pai, para alinhar as linhas de evento. */
export interface RankingLayout {
  showCidadeUf: boolean
  showDesde: boolean
  compare: boolean
  crmLink: boolean
  cols: number
}

/** Ordena os eventos seguindo o sort atual da tabela-pai (nome/cidade/uf/gmv). */
function sortEvents(eventos: EventRow[], sort: EventSortRef): EventRow[] {
  const dir = sort?.dir ?? 'desc'
  const col = sort?.col
  const arr = [...eventos]
  arr.sort((a, b) => {
    let r: number
    if (col === 'label') r = (a.nome ?? '').localeCompare(b.nome ?? '')
    else if (col === 'cidade') r = (a.cidade ?? '').localeCompare(b.cidade ?? '')
    else if (col === 'uf') r = (a.uf ?? '').localeCompare(b.uf ?? '')
    else r = Number(a.gmv) - Number(b.gmv) // gmv, pct, eventos, desde… caem aqui
    return dir === 'asc' ? r : -r
  })
  return arr
}

interface AttrKw { nome: string; keywords: string[] }

/**
 * Linhas de evento de um item das Análises, ALINHADAS às colunas da tabela-pai
 * (RankingView). Mostra só o Nome (link para o painel da Blueticket) + ícone de
 * info (atração/data/local/cidade no hover) e o GMV na coluna de GMV.
 */
export function RankingEventRows({
  dim,
  value,
  sort = null,
  layout,
}: {
  dim: string
  value: string
  sort?: EventSortRef
  layout: RankingLayout
}) {
  const orgId = useOrgId()
  const { year, dateBase, pdv, months } = useControls()

  const eventsQ = useQuery({
    enabled: !!orgId,
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
  const eventos = useMemo(() => sortEvents(eventsQ.data ?? [], sort), [eventsQ.data, sort])

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

  if (eventsQ.isLoading) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={layout.cols} className="bg-muted/20 py-3 text-center text-sm text-muted-foreground">
          Carregando eventos…
        </TableCell>
      </TableRow>
    )
  }
  if (eventos.length === 0) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={layout.cols} className="bg-muted/20 py-3 text-center text-sm text-muted-foreground">
          Nenhum evento.
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {eventos.map((e) => {
        const atr = detectar(e.nome)
        const detalhes = ([
          ['Organizador', e.organizador],
          ['Local', e.local],
          ['Data', e.data_evento ? fmtDate(e.data_evento) : null],
          ['Cidade', [e.cidade, e.uf].filter(Boolean).join('/') || null],
          ['Atração', atr.length ? atr.join(', ') : null],
        ] as [string, string | null][]).filter((d): d is [string, string] => !!d[1])
        return (
          <TableRow key={e.codigo_evento} className="bg-muted/20 hover:bg-muted/30">
            <TableCell className="py-1.5">
              <div className="flex items-center gap-1.5 pl-6">
                {e.codigo_evento ? (
                  <a
                    href={`https://painel.blueticket.com.br/event/${encodeURIComponent(e.codigo_evento)}/report-v2`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm hover:text-primary hover:underline"
                    title="Abrir no painel da Blueticket"
                  >
                    {e.nome ?? '—'}
                  </a>
                ) : (
                  <span className="truncate text-sm">{e.nome ?? '—'}</span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(ev) => ev.stopPropagation()}
                      className="shrink-0 cursor-help text-muted-foreground hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {detalhes.length ? (
                      <div className="space-y-0.5 text-xs">
                        {detalhes.map(([k, v]) => (
                          <div key={k}>
                            <span className="text-muted-foreground">{k}:</span> {v}
                          </div>
                        ))}
                      </div>
                    ) : (
                      'Sem detalhes'
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
            {layout.showCidadeUf && <TableCell />}
            {layout.showCidadeUf && <TableCell />}
            {layout.showDesde && <TableCell />}
            <TableCell />
            <TableCell className="py-1.5 text-right text-sm tabular-nums">
              {fmtBRL(Number(e.gmv))}
            </TableCell>
            <TableCell />
            <TableCell />
            {layout.compare && (
              <>
                <TableCell />
                <TableCell />
              </>
            )}
            {layout.crmLink && <TableCell />}
          </TableRow>
        )
      })}
    </>
  )
}
