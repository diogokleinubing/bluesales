import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface PresentationBlock {
  id: string
  org_id: string
  titulo: string
  categoria: string | null
  descricao: string | null
  ordem: number
  ativo: boolean
  updated_at: string
}

export interface BlockSlide {
  id: string
  block_id: string
  ordem: number
  conteudo: unknown
  thumb: string | null
  versao: number
  updated_at: string
}

export interface Presentation {
  id: string
  org_id: string
  organization_id: string | null
  opportunity_id: string | null
  activity_id: string | null
  titulo: string
  cliente_nome: string | null
  empresa_info: Record<string, unknown>
  status: 'rascunho' | 'montada' | 'compartilhada'
  share_token: string
  share_expira_em: string | null
  created_at: string
  updated_at: string
}

export interface PresentationSlide {
  id: string
  presentation_id: string
  ordem: number
  conteudo: unknown
  thumb: string | null
  incluido: boolean
  source_block_id: string | null
  source_slide_id: string | null
  source_versao: number | null
  updated_at: string
  /** Versão atual do slide-origem na biblioteca (para o alerta de atualização). */
  source_versao_atual?: number | null
}

// ---------------------------------------------------------------------------
// Biblioteca de blocos
// ---------------------------------------------------------------------------
export function useBlocks() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['crm', 'apr-blocks', orgId],
    queryFn: async (): Promise<PresentationBlock[]> => {
      const { data, error } = await supabase.from('presentation_blocks')
        .select('*').eq('org_id', orgId!).order('ordem').order('titulo')
      if (error) throw new Error(error.message)
      return (data ?? []) as PresentationBlock[]
    },
  })
}

export function useBlockSlides(blockId: string | null) {
  return useQuery({
    enabled: !!blockId,
    staleTime: 10_000,
    queryKey: ['crm', 'apr-block-slides', blockId],
    queryFn: async (): Promise<BlockSlide[]> => {
      const { data, error } = await supabase.from('presentation_block_slides')
        .select('*').eq('block_id', blockId!).order('ordem')
      if (error) throw new Error(error.message)
      return (data ?? []) as BlockSlide[]
    },
  })
}

export async function saveBlock(orgId: string, b: { titulo: string; categoria?: string | null; descricao?: string | null }, id?: string) {
  const payload = { titulo: b.titulo, categoria: b.categoria ?? null, descricao: b.descricao ?? null, updated_at: new Date().toISOString() }
  const { data, error } = id
    ? await supabase.from('presentation_blocks').update(payload).eq('id', id).select('id').single()
    : await supabase.from('presentation_blocks').insert({ org_id: orgId, ...payload }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from('presentation_blocks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Cria/atualiza um slide da biblioteca. Em update, incrementa a versão. */
export async function saveBlockSlide(
  orgId: string,
  blockId: string,
  s: { conteudo: unknown; thumb: string | null; ordem?: number },
  id?: string,
): Promise<string> {
  if (id) {
    // Incrementa a versão (para o alerta de atualização nas apresentações).
    const { data: cur } = await supabase.from('presentation_block_slides').select('versao').eq('id', id).maybeSingle()
    const { data, error } = await supabase.from('presentation_block_slides')
      .update({ conteudo: s.conteudo, thumb: s.thumb, versao: (cur?.versao ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq('id', id).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  let ordem = s.ordem
  if (ordem == null) {
    const { data: last } = await supabase.from('presentation_block_slides')
      .select('ordem').eq('block_id', blockId).order('ordem', { ascending: false }).limit(1)
    ordem = (last?.[0]?.ordem ?? -1) + 1
  }
  const { data, error } = await supabase.from('presentation_block_slides')
    .insert({ org_id: orgId, block_id: blockId, ordem, conteudo: s.conteudo, thumb: s.thumb })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function deleteBlockSlide(id: string) {
  const { error } = await supabase.from('presentation_block_slides').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function reorderBlockSlides(orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('presentation_block_slides').update({ ordem: i }).eq('id', id)))
}

// ---------------------------------------------------------------------------
// Apresentações (instâncias)
// ---------------------------------------------------------------------------
export function usePresentations() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30_000,
    queryKey: ['crm', 'apresentacoes', orgId],
    queryFn: async (): Promise<(Presentation & { organization_nome: string | null; slides: number })[]> => {
      const { data, error } = await supabase.from('presentations')
        .select('*, organizations(nome), presentation_slides(count)')
        .eq('org_id', orgId!).order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map((p) => ({
        ...(p as Presentation),
        organization_nome: (p.organizations as unknown as { nome: string } | null)?.nome ?? null,
        slides: ((p.presentation_slides as unknown as { count: number }[])?.[0]?.count) ?? 0,
      }))
    },
  })
}

export function usePresentation(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['crm', 'apresentacao', id],
    queryFn: async (): Promise<Presentation | null> => {
      const { data, error } = await supabase.from('presentations').select('*').eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Presentation) ?? null
    },
  })
}

export function usePresentationSlides(presId: string | undefined) {
  return useQuery({
    enabled: !!presId,
    queryKey: ['crm', 'apr-slides', presId],
    queryFn: async (): Promise<PresentationSlide[]> => {
      const { data, error } = await supabase.from('presentation_slides')
        .select('*, src:presentation_block_slides!source_slide_id(versao)')
        .eq('presentation_id', presId!).order('ordem')
      if (error) throw new Error(error.message)
      return (data ?? []).map((s) => ({
        ...(s as PresentationSlide),
        source_versao_atual: (s.src as unknown as { versao: number } | null)?.versao ?? null,
      }))
    },
  })
}

export async function createPresentation(orgId: string, p: Partial<Presentation> & { titulo: string }, createdBy: string | null) {
  const { data, error } = await supabase.from('presentations').insert({
    org_id: orgId, titulo: p.titulo, cliente_nome: p.cliente_nome ?? null,
    organization_id: p.organization_id ?? null, opportunity_id: p.opportunity_id ?? null,
    activity_id: p.activity_id ?? null, empresa_info: p.empresa_info ?? {}, created_by: createdBy,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function savePresentation(id: string, patch: Partial<Presentation>) {
  const { error } = await supabase.from('presentations')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deletePresentation(id: string) {
  const { error } = await supabase.from('presentations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function savePresentationSlide(
  orgId: string, presId: string,
  s: { conteudo: unknown; thumb: string | null; ordem?: number },
  id?: string,
): Promise<string> {
  if (id) {
    const { data, error } = await supabase.from('presentation_slides')
      .update({ conteudo: s.conteudo, thumb: s.thumb, updated_at: new Date().toISOString() })
      .eq('id', id).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  let ordem = s.ordem
  if (ordem == null) {
    const { data: last } = await supabase.from('presentation_slides')
      .select('ordem').eq('presentation_id', presId).order('ordem', { ascending: false }).limit(1)
    ordem = (last?.[0]?.ordem ?? -1) + 1
  }
  const { data, error } = await supabase.from('presentation_slides')
    .insert({ org_id: orgId, presentation_id: presId, ordem, conteudo: s.conteudo, thumb: s.thumb })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function deletePresentationSlide(id: string) {
  const { error } = await supabase.from('presentation_slides').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setSlideIncluido(id: string, incluido: boolean) {
  const { error } = await supabase.from('presentation_slides').update({ incluido }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function reorderPresentationSlides(orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('presentation_slides').update({ ordem: i }).eq('id', id)))
}

/** Adiciona (snapshot) os slides de um bloco ao final da apresentação. */
export async function assembleAddBlock(orgId: string, presId: string, blockId: string) {
  const { data: slides, error } = await supabase.from('presentation_block_slides')
    .select('*').eq('block_id', blockId).order('ordem')
  if (error) throw new Error(error.message)
  const { data: last } = await supabase.from('presentation_slides')
    .select('ordem').eq('presentation_id', presId).order('ordem', { ascending: false }).limit(1)
  let ordem = (last?.[0]?.ordem ?? -1) + 1
  const rows = (slides ?? []).map((s) => ({
    org_id: orgId, presentation_id: presId, ordem: ordem++,
    conteudo: s.conteudo, thumb: s.thumb, incluido: true,
    source_block_id: blockId, source_slide_id: s.id, source_versao: s.versao,
  }))
  if (rows.length) {
    const { error: e2 } = await supabase.from('presentation_slides').insert(rows)
    if (e2) throw new Error(e2.message)
  }
  return rows.length
}

/** Puxa a versão atual do slide-origem (biblioteca) para o slide da instância. */
export async function pullSlideFromSource(presSlideId: string, sourceSlideId: string) {
  const { data: src, error } = await supabase.from('presentation_block_slides')
    .select('conteudo, thumb, versao').eq('id', sourceSlideId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!src) return
  const { error: e2 } = await supabase.from('presentation_slides')
    .update({ conteudo: src.conteudo, thumb: src.thumb, source_versao: src.versao, updated_at: new Date().toISOString() })
    .eq('id', presSlideId)
  if (e2) throw new Error(e2.message)
}

// ---------------------------------------------------------------------------
// Mídia (Storage)
// ---------------------------------------------------------------------------
export async function uploadMedia(orgId: string, file: File, rand: number): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${orgId}/${rand}.${ext}`
  const { error } = await supabase.storage.from('apresentacoes').upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)
  return supabase.storage.from('apresentacoes').getPublicUrl(path).data.publicUrl
}
