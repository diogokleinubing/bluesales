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
  platform_id: string | null
  observacoes: string | null
}

export interface ArtistRow extends Artist {
  genero_nome: string | null
  organization_nome: string | null
  platform_nome: string | null
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
        .select('*, generos(nome), organizations(nome), platforms(nome)')
        .eq('org_id', orgId!)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []).map((a) => ({
        ...(a as Artist),
        genero_nome: (a.generos as unknown as { nome: string } | null)?.nome ?? null,
        organization_nome: (a.organizations as unknown as { nome: string } | null)?.nome ?? null,
        platform_nome: (a.platforms as unknown as { nome: string } | null)?.nome ?? null,
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
    platform_id: a.platform_id ?? null,
    observacoes: a.observacoes ?? null,
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

export const RELACAO_PLATAFORMA = ['Exclusividade', 'Homologada'] as const
export type RelacaoPlataforma = (typeof RELACAO_PLATAFORMA)[number]

export interface Local {
  id: string
  org_id: string
  nome: string
  cidade: string | null
  uf: string | null
  capacidade: number | null
  tipo: LocalTipo | null
  observacoes: string | null
}

export interface LocalPlatform {
  platform_id: string
  nome: string
  tipo_relacao: RelacaoPlataforma | null
}

export interface LocalRow extends Local {
  platforms: LocalPlatform[]
}

export function useLocais() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'locais', orgId],
    queryFn: async (): Promise<LocalRow[]> => {
      const [locs, lps] = await Promise.all([
        supabase.from('crm_locals').select('*').eq('org_id', orgId!).order('nome'),
        supabase
          .from('local_platforms')
          .select('local_id, platform_id, tipo_relacao, platforms(nome)')
          .eq('org_id', orgId!),
      ])
      if (locs.error) throw new Error(locs.error.message)
      const byLocal = new Map<string, LocalPlatform[]>()
      for (const lp of lps.data ?? []) {
        const arr = byLocal.get(lp.local_id) ?? []
        arr.push({
          platform_id: lp.platform_id,
          nome: (lp.platforms as unknown as { nome: string } | null)?.nome ?? '?',
          tipo_relacao: (lp.tipo_relacao as RelacaoPlataforma | null) ?? null,
        })
        byLocal.set(lp.local_id, arr)
      }
      return (locs.data ?? []).map((l) => ({
        ...(l as Local),
        platforms: byLocal.get(l.id) ?? [],
      }))
    },
  })
}

/** Plataformas (com tipo de relação) de um local. */
export async function fetchLocalPlatforms(localId: string): Promise<{ platform_id: string; tipo_relacao: RelacaoPlataforma | null }[]> {
  const { data, error } = await supabase
    .from('local_platforms')
    .select('platform_id, tipo_relacao')
    .eq('local_id', localId)
  if (error) throw new Error(error.message)
  return (data ?? []) as { platform_id: string; tipo_relacao: RelacaoPlataforma | null }[]
}

/** Substitui as plataformas de um local pela lista fornecida. */
export async function replaceLocalPlatforms(
  orgId: string,
  localId: string,
  items: { platform_id: string; tipo_relacao: RelacaoPlataforma | null }[],
) {
  await supabase.from('local_platforms').delete().eq('local_id', localId)
  if (items.length) {
    const rows = items.map((i) => ({ org_id: orgId, local_id: localId, platform_id: i.platform_id, tipo_relacao: i.tipo_relacao }))
    const { error } = await supabase.from('local_platforms').insert(rows)
    if (error) throw new Error(error.message)
  }
}

export async function saveLocal(
  orgId: string,
  l: Partial<Local> & { nome: string },
  id?: string,
): Promise<string> {
  const payload = {
    nome: l.nome,
    cidade: l.cidade ?? null,
    uf: l.uf ?? null,
    capacidade: l.capacidade ?? null,
    tipo: l.tipo ?? null,
    observacoes: l.observacoes ?? null,
  }
  if (id) {
    const { error } = await supabase.from('crm_locals').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    return id
  }
  const { data, error } = await supabase
    .from('crm_locals')
    .insert({ org_id: orgId, ...payload })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
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
  status: EventoStatus | null
  observacoes: string | null
  bi_event_codigo: string | null
  site: string | null
  instagram: string | null
  created_at: string
}

export interface CrmEventRow extends CrmEvent {
  local_nome: string | null
  organization_nome: string | null
  segmento_nome: string | null
  datas: string[]
  oportunidade_id: string | null
  oportunidade_status: string | null
}

export interface CrmEventEdition {
  id: string
  data: string | null
  platform_ids: string[]
}

export function useCrmEvents() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'events', orgId],
    queryFn: async (): Promise<CrmEventRow[]> => {
      const [evs, eds, opps] = await Promise.all([
        supabase
          .from('crm_events')
          .select('*, crm_locals(nome), organizations(nome), segments(nome)')
          .eq('org_id', orgId!)
          .order('nome'),
        supabase
          .from('crm_event_editions')
          .select('crm_event_id, data')
          .eq('org_id', orgId!),
        supabase
          .from('opportunities')
          .select('id, crm_event_id, funnel_stages(nome)')
          .eq('org_id', orgId!)
          .not('crm_event_id', 'is', null),
      ])
      if (evs.error) throw new Error(evs.error.message)
      const byEvent = new Map<string, string[]>()
      for (const ed of eds.data ?? []) {
        if (!ed.data) continue
        const arr = byEvent.get(ed.crm_event_id) ?? []
        arr.push(ed.data)
        byEvent.set(ed.crm_event_id, arr)
      }
      const oppByEvent = new Map<string, { id: string; stage: string | null }>()
      for (const op of opps.data ?? []) {
        if (!op.crm_event_id || oppByEvent.has(op.crm_event_id)) continue
        const st = (op.funnel_stages as unknown as { nome: string } | null)?.nome ?? null
        oppByEvent.set(op.crm_event_id, { id: op.id as string, stage: st })
      }
      return (evs.data ?? []).map((e) => {
        const opp = oppByEvent.get(e.id)
        return {
          ...(e as CrmEvent),
          local_nome: (e.crm_locals as unknown as { nome: string } | null)?.nome ?? null,
          organization_nome: (e.organizations as unknown as { nome: string } | null)?.nome ?? null,
          segmento_nome: (e.segments as unknown as { nome: string } | null)?.nome ?? null,
          datas: (byEvent.get(e.id) ?? []).sort(),
          oportunidade_id: opp?.id ?? null,
          oportunidade_status: opp?.stage ?? null,
        }
      })
    },
  })
}

export async function saveCrmEvent(
  orgId: string,
  e: Partial<CrmEvent> & { nome: string },
  id?: string,
): Promise<string> {
  const payload = {
    nome: e.nome,
    data_prevista: e.data_prevista ?? null,
    local_id: e.local_id ?? null,
    organization_id: e.organization_id ?? null,
    capacidade_estimada: e.capacidade_estimada ?? null,
    gmv_estimado: e.gmv_estimado ?? null,
    segmento_id: e.segmento_id ?? null,
    status: e.status ?? null,
    observacoes: e.observacoes ?? null,
    bi_event_codigo: e.bi_event_codigo ?? null,
    site: e.site ?? null,
    instagram: e.instagram ?? null,
  }
  if (id) {
    const { error } = await supabase.from('crm_events').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    return id
  }
  const { data, error } = await supabase
    .from('crm_events')
    .insert({ org_id: orgId, ...payload })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/** Lê as edições (data + plataformas) de um evento. */
export async function fetchEventEditions(eventId: string): Promise<CrmEventEdition[]> {
  const { data, error } = await supabase
    .from('crm_event_editions')
    .select('id, data, platform_ids')
    .eq('crm_event_id', eventId)
    .order('data', { nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrmEventEdition[]
}

/** Substitui todas as edições de um evento pela lista fornecida. */
export async function replaceEventEditions(
  orgId: string,
  eventId: string,
  edicoes: { data: string | null; platform_ids: string[] }[],
) {
  await supabase.from('crm_event_editions').delete().eq('crm_event_id', eventId)
  const rows = edicoes
    .filter((e) => e.data || e.platform_ids.length)
    .map((e) => ({ org_id: orgId, crm_event_id: eventId, data: e.data, platform_ids: e.platform_ids }))
  if (rows.length) {
    const { error } = await supabase.from('crm_event_editions').insert(rows)
    if (error) throw new Error(error.message)
  }
}

export async function deleteCrmEvent(id: string) {
  const { error } = await supabase.from('crm_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Vínculo Locais ↔ Organização (organization_locals)
// ---------------------------------------------------------------------------
export interface OrgLocalRow {
  id: string // id do vínculo (organization_locals)
  local_id: string
  nome: string
  cidade: string | null
  uf: string | null
  tipo: string | null
}

/** Locais vinculados a uma organização. */
export function useOrgLocais(organizationId: string | undefined) {
  return useQuery({
    enabled: !!organizationId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'org-locais', organizationId],
    queryFn: async (): Promise<OrgLocalRow[]> => {
      const { data, error } = await supabase
        .from('organization_locals')
        .select('id, local_id, crm_locals(nome, cidade, uf, tipo)')
        .eq('organization_id', organizationId!)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => {
        const l = r.crm_locals as unknown as { nome: string; cidade: string | null; uf: string | null; tipo: string | null } | null
        return {
          id: r.id as string,
          local_id: r.local_id as string,
          nome: l?.nome ?? '?',
          cidade: l?.cidade ?? null,
          uf: l?.uf ?? null,
          tipo: l?.tipo ?? null,
        }
      }).sort((a, b) => a.nome.localeCompare(b.nome))
    },
  })
}

/** Vincula um local existente a uma organização. */
export async function linkLocalToOrg(orgId: string, organizationId: string, localId: string) {
  const { error } = await supabase
    .from('organization_locals')
    .insert({ org_id: orgId, organization_id: organizationId, local_id: localId })
  if (error) throw new Error(error.message)
}

/** Remove o vínculo local↔organização. */
export async function unlinkOrgLocal(linkId: string) {
  const { error } = await supabase.from('organization_locals').delete().eq('id', linkId)
  if (error) throw new Error(error.message)
}
