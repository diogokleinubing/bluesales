import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

// ---------------------------------------------------------------------------
// Artistas
// ---------------------------------------------------------------------------
export const ESCALOES = ['Local', 'Regional', 'Nacional', 'Internacional'] as const
export type Escalao = (typeof ESCALOES)[number]

export interface Artist {
  id: string
  org_id: string
  nome: string
  genero_id: string | null
  escalao: Escalao | null
  organization_id: string | null
}

export interface ArtistRow extends Artist {
  genero_nome: string | null
  organization_nome: string | null
}

export function useArtists() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'artists', orgId],
    queryFn: async (): Promise<ArtistRow[]> => {
      const { data, error } = await supabase
        .from('artists')
        .select('*, generos(nome), organizations(nome)')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []).map((a) => ({
        ...(a as Artist),
        genero_nome: (a.generos as unknown as { nome: string } | null)?.nome ?? null,
        organization_nome: (a.organizations as unknown as { nome: string } | null)?.nome ?? null,
      }))
    },
  })
}

export async function saveArtist(orgId: string, a: Partial<Artist> & { nome: string }, id?: string) {
  const payload = {
    nome: a.nome,
    genero_id: a.genero_id ?? null,
    escalao: a.escalao ?? null,
    organization_id: a.organization_id ?? null,
  }
  const { error } = id
    ? await supabase.from('artists').update(payload).eq('id', id)
    : await supabase.from('artists').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deleteArtist(id: string) {
  const { error } = await supabase.from('artists').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Locais
// ---------------------------------------------------------------------------
export const LOCAL_TIPOS = [
  'Casa de show', 'Teatro', 'Estádio', 'Arena', 'Autódromo', 'Espaço multiuso', 'Outro',
] as const
export type LocalTipo = (typeof LOCAL_TIPOS)[number]

export interface Local {
  id: string
  org_id: string
  nome: string
  cidade: string | null
  uf: string | null
  capacidade: number | null
  tipo: LocalTipo | null
}

export function useLocais() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'locais', orgId],
    queryFn: async (): Promise<Local[]> => {
      const { data, error } = await supabase
        .from('crm_locals')
        .select('*')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as Local[]
    },
  })
}

export async function saveLocal(orgId: string, l: Partial<Local> & { nome: string }, id?: string) {
  const payload = {
    nome: l.nome,
    cidade: l.cidade ?? null,
    uf: l.uf ?? null,
    capacidade: l.capacidade ?? null,
    tipo: l.tipo ?? null,
  }
  const { error } = id
    ? await supabase.from('crm_locals').update(payload).eq('id', id)
    : await supabase.from('crm_locals').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deleteLocal(id: string) {
  const { error } = await supabase.from('crm_locals').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Eventos (CRM)
// ---------------------------------------------------------------------------
export const EVENTO_STATUS = ['Planejado', 'Confirmado', 'Cancelado', 'Realizado'] as const
export type EventoStatus = (typeof EVENTO_STATUS)[number]

export interface CrmEvent {
  id: string
  org_id: string
  nome: string
  data_prevista: string | null
  local_id: string | null
  organization_id: string | null
  capacidade_estimada: number | null
  gmv_estimado: number | null
  segmento_id: string | null
  status: EventoStatus
  observacoes: string | null
  bi_event_codigo: string | null
  created_at: string
}

export interface CrmEventRow extends CrmEvent {
  local_nome: string | null
  organization_nome: string | null
  segmento_nome: string | null
}

export function useCrmEvents() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'events', orgId],
    queryFn: async (): Promise<CrmEventRow[]> => {
      const { data, error } = await supabase
        .from('crm_events')
        .select('*, crm_locals(nome), organizations(nome), segments(nome)')
        .eq('org_id', orgId!)
        .order('data_prevista', { ascending: true, nullsFirst: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((e) => ({
        ...(e as CrmEvent),
        local_nome: (e.crm_locals as unknown as { nome: string } | null)?.nome ?? null,
        organization_nome: (e.organizations as unknown as { nome: string } | null)?.nome ?? null,
        segmento_nome: (e.segments as unknown as { nome: string } | null)?.nome ?? null,
      }))
    },
  })
}

export async function saveCrmEvent(orgId: string, e: Partial<CrmEvent> & { nome: string }, id?: string) {
  const payload = {
    nome: e.nome,
    data_prevista: e.data_prevista ?? null,
    local_id: e.local_id ?? null,
    organization_id: e.organization_id ?? null,
    capacidade_estimada: e.capacidade_estimada ?? null,
    gmv_estimado: e.gmv_estimado ?? null,
    segmento_id: e.segmento_id ?? null,
    status: e.status ?? 'Planejado',
    observacoes: e.observacoes ?? null,
    bi_event_codigo: e.bi_event_codigo ?? null,
  }
  const { error } = id
    ? await supabase.from('crm_events').update(payload).eq('id', id)
    : await supabase.from('crm_events').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deleteCrmEvent(id: string) {
  const { error } = await supabase.from('crm_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
