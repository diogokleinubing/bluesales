import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type ConteudoStatus = 'rascunho' | 'pronto' | 'utilizado'
export type ConteudoSecao = 'destaque' | 'novidade' | 'como_usar'

export const CONTEUDO_STATUS: { value: ConteudoStatus; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'pronto', label: 'Pronto' },
  { value: 'utilizado', label: 'Utilizado' },
]

export interface ConteudoRow {
  id: string
  categoria_id: string | null
  categoria_nome: string | null
  status: ConteudoStatus
  codigo: string
  titulo: string
  resumo: string | null
  cover_url: string | null
  corpo: string | null
  created_at: string
}

const COLS = 'id, categoria_id, status, codigo, titulo, resumo, cover_url, corpo, created_at, crm_conteudo_categorias(nome)'

function mapRow(r: Record<string, unknown>): ConteudoRow {
  const cat = r.crm_conteudo_categorias as unknown as { nome: string } | null
  return {
    id: r.id as string,
    categoria_id: (r.categoria_id as string | null) ?? null,
    categoria_nome: cat?.nome ?? null,
    status: (r.status as ConteudoStatus) ?? 'rascunho',
    codigo: r.codigo as string,
    titulo: (r.titulo as string) ?? '',
    resumo: (r.resumo as string | null) ?? null,
    cover_url: (r.cover_url as string | null) ?? null,
    corpo: (r.corpo as string | null) ?? null,
    created_at: r.created_at as string,
  }
}

export interface ConteudoFiltro { search?: string; categoriaId?: string | null; status?: ConteudoStatus[] }

/** Biblioteca de conteúdos (artigos) da organização, com filtros. */
export function useConteudos(filtro?: ConteudoFiltro) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    queryKey: ['crm', 'conteudos', orgId, filtro?.categoriaId ?? '', (filtro?.status ?? []).join(','), filtro?.search ?? ''],
    queryFn: async (): Promise<ConteudoRow[]> => {
      let q = supabase.from('crm_conteudos').select(COLS).eq('org_id', orgId!).is('deleted_at', null).order('created_at', { ascending: false })
      if (filtro?.categoriaId) q = q.eq('categoria_id', filtro.categoriaId)
      if (filtro?.status && filtro.status.length > 0) q = q.in('status', filtro.status)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      let rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
      const s = filtro?.search?.trim().toLowerCase()
      if (s) rows = rows.filter((r) => r.titulo.toLowerCase().includes(s) || (r.resumo ?? '').toLowerCase().includes(s))
      return rows
    },
  })
}

/** Um conteúdo por id (para edição). */
export function useConteudo(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['crm', 'conteudo', id],
    queryFn: async (): Promise<ConteudoRow | null> => {
      const { data, error } = await supabase.from('crm_conteudos').select(COLS).eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? mapRow(data as Record<string, unknown>) : null
    },
  })
}

export async function createConteudo(orgId: string, createdBy?: string | null): Promise<{ id: string; codigo: string }> {
  const { data, error } = await supabase
    .from('crm_conteudos')
    .insert({ org_id: orgId, status: 'rascunho', created_by: createdBy ?? null })
    .select('id, codigo')
    .single()
  if (error) throw new Error(error.message)
  return data as { id: string; codigo: string }
}

export async function updateConteudo(
  id: string,
  patch: Partial<Pick<ConteudoRow, 'titulo' | 'resumo' | 'cover_url' | 'corpo' | 'categoria_id' | 'status'>>,
) {
  const { error } = await supabase.from('crm_conteudos').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteConteudo(id: string) {
  const { error } = await supabase.from('crm_conteudos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Sobe uma imagem da matéria para o bucket público `conteudos` e devolve a URL. */
export async function uploadConteudoImage(orgId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from('conteudos').upload(path, file, { upsert: false })
  if (up.error) throw new Error(up.error.message)
  return supabase.storage.from('conteudos').getPublicUrl(path).data.publicUrl
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------
export interface CategoriaRow { id: string; nome: string }

export function useConteudoCategorias() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    queryKey: ['crm', 'conteudo-categorias', orgId],
    queryFn: async (): Promise<CategoriaRow[]> => {
      const { data, error } = await supabase
        .from('crm_conteudo_categorias')
        .select('id, nome')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw new Error(error.message)
      return (data ?? []) as CategoriaRow[]
    },
  })
}

export async function createCategoria(orgId: string, nome: string, createdBy?: string | null) {
  const { error } = await supabase.from('crm_conteudo_categorias').insert({ org_id: orgId, nome: nome.trim(), created_by: createdBy ?? null })
  if (error) throw new Error(error.message)
}

export async function updateCategoria(id: string, nome: string) {
  const { error } = await supabase.from('crm_conteudo_categorias').update({ nome: nome.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteCategoria(id: string) {
  const { error } = await supabase.from('crm_conteudo_categorias').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Vínculo campanha ↔ conteúdo (seleção dos artigos por seção da newsletter)
// ---------------------------------------------------------------------------
export interface CampaignConteudo {
  id: string
  conteudo_id: string
  secao: ConteudoSecao
  ordem: number
  titulo: string
  resumo: string | null
  cover_url: string | null
  codigo: string
  status: ConteudoStatus
}

export function useCampaignConteudos(campaignId: string | undefined) {
  return useQuery({
    enabled: !!campaignId,
    queryKey: ['crm', 'campaign-conteudos', campaignId],
    queryFn: async (): Promise<CampaignConteudo[]> => {
      const { data, error } = await supabase
        .from('email_campaign_conteudos')
        .select('id, conteudo_id, secao, ordem, crm_conteudos(titulo, resumo, cover_url, codigo, status)')
        .eq('campaign_id', campaignId!)
        .order('secao')
        .order('ordem')
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => {
        const c = r.crm_conteudos as unknown as { titulo?: string; resumo?: string | null; cover_url?: string | null; codigo?: string; status?: ConteudoStatus } | null
        return {
          id: r.id as string,
          conteudo_id: r.conteudo_id as string,
          secao: r.secao as ConteudoSecao,
          ordem: (r.ordem as number) ?? 0,
          titulo: c?.titulo ?? '',
          resumo: c?.resumo ?? null,
          cover_url: c?.cover_url ?? null,
          codigo: c?.codigo ?? '',
          status: c?.status ?? 'rascunho',
        }
      })
    },
  })
}

export async function addCampaignConteudo(orgId: string, campaignId: string, conteudoId: string, secao: ConteudoSecao, ordem: number) {
  const { error } = await supabase
    .from('email_campaign_conteudos')
    .insert({ org_id: orgId, campaign_id: campaignId, conteudo_id: conteudoId, secao, ordem })
  if (error) throw new Error(error.message)
}

export async function removeCampaignConteudo(joinId: string) {
  const { error } = await supabase.from('email_campaign_conteudos').delete().eq('id', joinId)
  if (error) throw new Error(error.message)
}
