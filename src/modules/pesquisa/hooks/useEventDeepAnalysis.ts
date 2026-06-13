import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DeepAnalysis {
  crawled_event_id: string
  status: string
  fit_score: number | null
  recomendacao: string | null
  veredito: string | null
  sinais: Record<string, unknown> | null
  official_url: string | null
  erro: string | null
  created_at: string
}

/** Análises já existentes para os eventos visíveis (mapa por id). */
export function useDeepAnalyses(ids: string[]) {
  const key = [...ids].sort().join(',')
  return useQuery({
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryKey: ['pesquisa', 'deep-analysis', key],
    queryFn: async (): Promise<Map<string, DeepAnalysis>> => {
      const { data, error } = await supabase
        .from('event_deep_analysis')
        .select('crawled_event_id, status, fit_score, recomendacao, veredito, sinais, official_url, erro, created_at')
        .in('crawled_event_id', ids)
      if (error) throw new Error(error.message)
      return new Map((data ?? []).map((d) => [d.crawled_event_id as string, d as DeepAnalysis]))
    },
  })
}

/** Dispara a análise profunda (deep scrape + IA) de um evento. */
export async function runDeepAnalysis(eventId: string): Promise<DeepAnalysis> {
  const { data, error } = await supabase.functions.invoke('event-deep-analysis', { body: { eventId } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.analysis as DeepAnalysis
}
