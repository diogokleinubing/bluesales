import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { softDelete } from '@/lib/softDelete'
import { useCrmOrgId } from './useFunnelStages'

// ---------------------------------------------------------------------------
// Artistas
// ---------------------------------------------------------------------------
export const ESCALOES = ['Local', 'Regional', 'Nacional', 'Internacional'] as const
export type Escalao = (typeof ESCALOES)[number]

export const ARTIST_CLASSES = ['A+', 'A', 'B', 'C'] as const
export type ArtistClasse = (typeof ARTIST_CLASSES)[number]

export interface Artist {
  id: string
  org_id: string
  nome: string
  genero_id: string | null
  /** Segmento Padrão usado na classificação automática de eventos. */
  segmento: string | null
  escalao: Escalao | null
  classificacao: ArtistClasse | null
  organization_id: string | null
  platform_id: string | null
  observacoes: string | null
  aliases: string | null
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
        .is('deleted_at', null)
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
    segmento: a.segmento ?? null,
    escalao: a.escalao ?? null,
    classificacao: a.classificacao ?? null,
    organization_id: a.organization_id ?? null,
    platform_id: a.platform_id ?? null,
    observacoes: a.observacoes ?? null,
    aliases: a.aliases ?? null,
  }
  const { error } = id
    ? await supabase.from('artists').update(payload).eq('id', id)
    : await supabase.from('artists').insert({ org_id: orgId, ...payload })
  if (error) throw new Error(error.message)
}

export async function deleteArtist(id: string) {
  await softDelete('artists', id)
}

// ---------------------------------------------------------------------------
// Locais
// ---------------------------------------------------------------------------

export const RELACAO_PLATAFORMA = ['Exclusividade', 'Homologada'] as const
export type RelacaoPlataforma = (typeof RELACAO_PLATAFORMA)[number]

export const CRM_CLASSES = ['A+', 'A', 'B', 'C'] as const
export type CrmClasse = (typeof CRM_CLASSES)[number]

export interface Local {
  id: string
  org_id: string
  nome: string
  cidade: string | null
  uf: string | null
  capacidade: number | null
  tipo_id: string | null
  observacoes: string | null
  site: string | null
  instagram: string | null
  aliases: string | null
  funil_stage_id: string | null
  classificacao: CrmClasse | null
}

export interface LocalPlatform {
  platform_id: string
  nome: string
  tipo_relacao: RelacaoPlataforma | null
}

export interface LocalRow extends Local {
  tipo_nome: string | null
  platforms: LocalPlatform[]
  /** Nº de oportunidades em aberto (resultado nulo) vinculadas ao local via evento. */
  oppAtivas: number
  /** Estágio + cor da oportunidade ativa (para exibir o status como nos eventos). */
  oppStatus: string | null
  oppCor: string | null
  /** GMV estimado somado dos eventos realizados/planejados neste local. */
  gmv: number | null
}

export function useLocais() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'locais', orgId],
    queryFn: async (): Promise<LocalRow[]> => {
      const [locs, lps, evs, opps] = await Promise.all([
        supabase.from('crm_locals').select('*, local_types(nome)').eq('org_id', orgId!).is('deleted_at', null).order('nome'),
        supabase
          .from('local_platforms')
          .select('local_id, platform_id, tipo_relacao, platforms(nome)')
          .eq('org_id', orgId!),
        // GMV estimado somado dos eventos do local; oportunidades ligadas
        // DIRETAMENTE ao local (não via evento).
        supabase.from('crm_events').select('local_id, gmv_estimado').eq('org_id', orgId!).is('deleted_at', null).not('local_id', 'is', null),
        supabase.from('opportunities').select('local_id, funnel_stages(nome, cor)').eq('org_id', orgId!).is('deleted_at', null).is('resultado', null).not('local_id', 'is', null),
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

      const gmvPorLocal = new Map<string, number>()
      for (const e of evs.data ?? []) {
        const localId = e.local_id as string
        const g = e.gmv_estimado as number | null
        if (g != null) gmvPorLocal.set(localId, (gmvPorLocal.get(localId) ?? 0) + g)
      }
      const oppPorLocal = new Map<string, number>()
      const oppStatusPorLocal = new Map<string, { nome: string | null; cor: string | null }>()
      for (const o of opps.data ?? []) {
        const localId = o.local_id as string
        if (!localId) continue
        oppPorLocal.set(localId, (oppPorLocal.get(localId) ?? 0) + 1)
        if (!oppStatusPorLocal.has(localId)) {
          const fs = o.funnel_stages as unknown as { nome: string; cor: string | null } | null
          oppStatusPorLocal.set(localId, { nome: fs?.nome ?? null, cor: fs?.cor ?? null })
        }
      }

      return (locs.data ?? []).map((l) => ({
        ...(l as Local),
        tipo_nome: (l.local_types as unknown as { nome: string } | null)?.nome ?? null,
        platforms: byLocal.get(l.id) ?? [],
        oppAtivas: oppPorLocal.get(l.id) ?? 0,
        oppStatus: oppStatusPorLocal.get(l.id)?.nome ?? null,
        oppCor: oppStatusPorLocal.get(l.id)?.cor ?? null,
        gmv: gmvPorLocal.get(l.id) ?? null,
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
    tipo_id: l.tipo_id ?? null,
    observacoes: l.observacoes ?? null,
    site: l.site ?? null,
    instagram: l.instagram ?? null,
    aliases: l.aliases ?? null,
    funil_stage_id: l.funil_stage_id ?? null,
    classificacao: l.classificacao ?? null,
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
  await softDelete('crm_locals', id)
}

/** Atualiza em massa campos de vários locais (classe, tipo, estágio). */
export async function bulkUpdateLocais(
  ids: string[],
  patch: { classificacao?: CrmClasse | null; tipo_id?: string | null; funil_stage_id?: string | null },
) {
  if (ids.length === 0) return
  const { error } = await supabase.from('crm_locals').update(patch).in('id', ids)
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
  funil_stage_id: string | null
  classificacao: CrmClasse | null
  created_at: string
}

export interface CrmEventRow extends CrmEvent {
  local_nome: string | null
  organization_nome: string | null
  segmento_nome: string | null
  datas: string[]
  oportunidade_id: string | null
  oportunidade_status: string | null
  oportunidade_cor: string | null
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
          .is('deleted_at', null)
          .order('nome'),
        supabase
          .from('crm_event_editions')
          .select('crm_event_id, data')
          .eq('org_id', orgId!),
        supabase
          .from('opportunities')
          .select('id, crm_event_id, funnel_stages(nome, cor)')
          .eq('org_id', orgId!)
          .is('deleted_at', null)
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
      const oppByEvent = new Map<string, { id: string; stage: string | null; cor: string | null }>()
      for (const op of opps.data ?? []) {
        if (!op.crm_event_id || oppByEvent.has(op.crm_event_id)) continue
        const fs = op.funnel_stages as unknown as { nome: string; cor: string | null } | null
        oppByEvent.set(op.crm_event_id, { id: op.id as string, stage: fs?.nome ?? null, cor: fs?.cor ?? null })
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
          oportunidade_cor: opp?.cor ?? null,
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
    funil_stage_id: e.funil_stage_id ?? null,
    classificacao: e.classificacao ?? null,
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
  await softDelete('crm_events', id)
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

export interface LocalOrgRow {
  id: string // id do vínculo (organization_locals)
  organization_id: string
  nome: string
  cidade: string | null
  uf: string | null
}

/** Organizações vinculadas a um local (lado inverso de useOrgLocais). */
export function useLocalOrgs(localId: string | undefined) {
  return useQuery({
    enabled: !!localId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'local-orgs', localId],
    queryFn: async (): Promise<LocalOrgRow[]> => {
      const { data, error } = await supabase
        .from('organization_locals')
        .select('id, organization_id, organizations(nome, cidade, uf)')
        .eq('local_id', localId!)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => {
        const o = r.organizations as unknown as { nome: string; cidade: string | null; uf: string | null } | null
        return {
          id: r.id as string,
          organization_id: r.organization_id as string,
          nome: o?.nome ?? '?',
          cidade: o?.cidade ?? null,
          uf: o?.uf ?? null,
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
