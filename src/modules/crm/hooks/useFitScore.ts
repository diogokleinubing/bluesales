import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type FitEscopo = 'local' | 'evento' | 'organizador'

/**
 * Critério ponderado: a pontuação sobe linearmente de 0 (em `bom`) a 100 (em
 * `otimo`). `corte` é um mínimo eliminatório (valor abaixo desqualifica o item).
 */
export interface FitCriterio {
  id: string
  label: string
  peso: number
  bom: number
  otimo: number
  corte: number | null
}

export interface FitConfig {
  janela_meses: number
  criterios: FitCriterio[]
}

export interface FitRule {
  id: string
  escopo: FitEscopo
  tipo_local_id: string | null
  config: FitConfig
  ativo: boolean
}

// Critérios disponíveis por escopo (rótulo + defaults).
export const CRITERIOS_LOCAL: FitCriterio[] = [
  { id: 'ticket_medio', label: 'Ticket médio (R$)', peso: 40, bom: 30, otimo: 80, corte: null },
  { id: 'frequencia', label: 'Eventos capturados', peso: 35, bom: 3, otimo: 20, corte: null },
  { id: 'capacidade', label: 'Capacidade', peso: 25, bom: 200, otimo: 3000, corte: null },
]

export const CRITERIOS_ORGANIZADOR: FitCriterio[] = [
  { id: 'ticket_medio', label: 'Ticket médio (R$)', peso: 40, bom: 30, otimo: 80, corte: null },
  { id: 'frequencia', label: 'Eventos capturados', peso: 35, bom: 5, otimo: 40, corte: null },
  { id: 'alcance', label: 'Cidades distintas', peso: 25, bom: 1, otimo: 10, corte: null },
]

export function defaultConfig(escopo: FitEscopo): FitConfig {
  if (escopo === 'local') return { janela_meses: 6, criterios: CRITERIOS_LOCAL.map((c) => ({ ...c })) }
  if (escopo === 'organizador') return { janela_meses: 6, criterios: CRITERIOS_ORGANIZADOR.map((c) => ({ ...c })) }
  return { janela_meses: 6, criterios: [] }
}

export function useFitRules() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 60_000,
    queryKey: ['crm', 'fit-rules', orgId],
    queryFn: async (): Promise<FitRule[]> => {
      const { data, error } = await supabase
        .from('fit_rules')
        .select('id, escopo, tipo_local_id, config, ativo')
        .eq('org_id', orgId!)
      if (error) throw new Error(error.message)
      return (data ?? []) as FitRule[]
    },
  })
}

export async function saveFitRule(
  orgId: string,
  r: { escopo: FitEscopo; tipo_local_id: string | null; config: FitConfig },
  id?: string,
) {
  const payload = { escopo: r.escopo, tipo_local_id: r.tipo_local_id, config: r.config, updated_at: new Date().toISOString() }
  const { error } = id
    ? await supabase.from('fit_rules').update(payload).eq('id', id)
    : await supabase.from('fit_rules').upsert({ org_id: orgId, ...payload }, { onConflict: 'org_id,escopo,tipo_local_id' })
  if (error) throw new Error(error.message)
}

export async function deleteFitRule(id: string) {
  const { error } = await supabase.from('fit_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Seleciona a regra do escopo para um tipo (override do tipo, senão padrão). */
export function pickRule(rules: FitRule[], escopo: FitEscopo, tipoLocalId: string | null): FitConfig {
  const porTipo = tipoLocalId ? rules.find((r) => r.escopo === escopo && r.tipo_local_id === tipoLocalId) : null
  const padrao = rules.find((r) => r.escopo === escopo && r.tipo_local_id == null)
  return porTipo?.config ?? padrao?.config ?? defaultConfig(escopo)
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export interface FitResult { score: number | null; eliminado: boolean }

/** Calcula o fit (0–100) a partir das métricas do item e da configuração. */
export function scoreFit(metrics: Record<string, number | null>, config: FitConfig): FitResult {
  let soma = 0, somaPeso = 0, eliminado = false, temDado = false
  for (const c of config.criterios) {
    if (!c.peso) continue
    const v = metrics[c.id]
    if (v == null) continue
    temDado = true
    if (c.corte != null && v < c.corte) eliminado = true
    const pts = c.otimo > c.bom ? clamp01((v - c.bom) / (c.otimo - c.bom)) * 100 : (v >= c.bom ? 100 : 0)
    soma += pts * c.peso
    somaPeso += c.peso
  }
  if (!temDado) return { score: null, eliminado: false }
  return { score: eliminado ? 0 : Math.round(soma / somaPeso), eliminado }
}
