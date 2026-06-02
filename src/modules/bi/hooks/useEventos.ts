import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrgId } from './useBi'
import { useControls } from '@/modules/shared/controls-context'
import { biEvents, biEventOptions, metricOf } from '../lib/rpc'

export interface EventFilters {
  search: string
  segmento: string
  genero: string
  organizador: string
  local: string
  cidade: string
  uf: string
  codigo: string
}

export interface EventOptions {
  segmentos: string[]
  generos: string[]
  organizadores: string[]
  locais: string[]
  cidades: string[]
  ufs: string[]
}

export interface EventListRow {
  codigo_evento: string
  nome: string | null
  segmento: string | null
  genero: string | null
  organizador: string | null
  local: string | null
  cidade: string | null
  uf: string | null
  vendas: number
  gmv: number
  gmvOnline: number
  receitaBt: number
  value: number
}

const PAGE = 300

export function useEventos(filters: EventFilters) {
  const orgId = useOrgId()
  const { year, metric, dateBase, pdv } = useControls()

  const eventsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['bi', 'events', orgId, year, dateBase, pdv, metric, filters],
    queryFn: () =>
      biEvents(orgId!, year, dateBase, pdv, {
        search: filters.search,
        segmento: filters.segmento,
        genero: filters.genero,
        organizador: filters.organizador,
        local: filters.local,
        cidade: filters.cidade,
        uf: filters.uf,
        codigo: filters.codigo,
        order: metric,
        limit: PAGE,
      }),
  })

  const optionsQ = useQuery({
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryKey: ['bi', 'event-options', orgId, year, dateBase, pdv],
    queryFn: () => biEventOptions(orgId!, year, dateBase, pdv),
  })

  const events = useMemo<EventListRow[]>(
    () =>
      (eventsQ.data ?? []).map((e) => ({
        codigo_evento: e.codigo_evento,
        nome: e.nome,
        segmento: e.segmento,
        genero: e.genero,
        organizador: e.organizador,
        local: e.local,
        cidade: e.cidade,
        uf: e.uf,
        vendas: Number(e.qtd),
        gmv: Number(e.gmv),
        gmvOnline: Number(e.gmv_online ?? 0),
        receitaBt: Number(e.receita_bt),
        value: metricOf(e, metric),
      })),
    [eventsQ.data, metric],
  )

  const total = eventsQ.data?.[0]?.total_count
    ? Number(eventsQ.data[0].total_count)
    : events.length

  const options = useMemo<EventOptions>(() => {
    const by = (dim: string) =>
      (optionsQ.data ?? [])
        .filter((o) => o.dim === dim)
        .map((o) => o.value)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      segmentos: by('segmento'),
      generos: by('genero'),
      organizadores: by('organizador'),
      locais: by('local'),
      cidades: by('cidade'),
      ufs: by('uf'),
    }
  }, [optionsQ.data])

  return {
    events,
    options,
    total,
    truncated: total > events.length,
    isLoading: eventsQ.isLoading,
    isError: eventsQ.isError,
    error: eventsQ.error,
  }
}
