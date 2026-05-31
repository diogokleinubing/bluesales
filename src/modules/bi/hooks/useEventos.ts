import { useMemo } from 'react'
import { useDataset } from '../lib/dataset'
import { useControls } from '@/modules/shared/controls-context'
import { aggregateEvents, type EventAgg } from '../lib/aggregate'
import { filterSales } from '../lib/metrics'

export interface EventFilters {
  search: string
  segmento: string
  organizador: string
  local: string
  cidade: string
  uf: string
  codigo: string
}

export interface EventOptions {
  segmentos: string[]
  organizadores: string[]
  locais: string[]
  cidades: string[]
  ufs: string[]
}

function uniqSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ''))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )
}

export function useEventos(filters: EventFilters) {
  const { sales, isLoading, isError, error } = useDataset()
  const { year, metric, dateBase, pdv } = useControls()

  const allEvents = useMemo(() => {
    const cur = filterSales(sales, { pdv, year, dateBase })
    return aggregateEvents(cur, metric)
  }, [sales, year, metric, dateBase, pdv])

  const options = useMemo<EventOptions>(
    () => ({
      segmentos: uniqSorted(allEvents.map((e) => e.segmento)),
      organizadores: uniqSorted(allEvents.map((e) => e.organizador)),
      locais: uniqSorted(allEvents.map((e) => e.local)),
      cidades: uniqSorted(allEvents.map((e) => e.cidade)),
      ufs: uniqSorted(allEvents.map((e) => e.uf)),
    }),
    [allEvents],
  )

  const filtered = useMemo<EventAgg[]>(() => {
    const q = filters.search.trim().toLowerCase()
    return allEvents.filter((e) => {
      if (filters.codigo && e.codigo_evento !== filters.codigo) return false
      if (filters.segmento && (e.segmento ?? 'Sem segmento') !== filters.segmento)
        return false
      if (filters.organizador && e.organizador !== filters.organizador) return false
      if (filters.local && e.local !== filters.local) return false
      if (filters.cidade && e.cidade !== filters.cidade) return false
      if (filters.uf && e.uf !== filters.uf) return false
      if (q) {
        const hay = `${e.nome ?? ''} ${e.codigo_evento} ${e.organizador ?? ''} ${e.local ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allEvents, filters])

  return { events: filtered, options, isLoading, isError, error }
}
