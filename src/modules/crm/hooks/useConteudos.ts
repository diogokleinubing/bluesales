import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ConteudoSecao = 'destaque' | 'novidade' | 'como_usar'

export interface ConteudoRow {
  id: string
  campaign_id: string | null
  secao: ConteudoSecao
  ordem: number
  codigo: string
  titulo: string
  resumo: string | null
  cover_url: string | null
  corpo: string | null
  publicado: boolean
}

const COLS = 'id, campaign_id, secao, ordem, codigo, titulo, resumo, cover_url, corpo, publicado'

/** Matérias (conteúdos) de uma campanha, agrupáveis por seção. */
export function useConteudos(campaignId: string | undefined) {
  return useQuery({
    enabled: !!campaignId,
    queryKey: ['crm', 'conteudos', campaignId],
    queryFn: async (): Promise<ConteudoRow[]> => {
      const { data, error } = await supabase
        .from('crm_conteudos')
        .select(COLS)
        .eq('campaign_id', campaignId!)
        .is('deleted_at', null)
        .order('secao')
        .order('ordem')
      if (error) throw new Error(error.message)
      return (data ?? []) as ConteudoRow[]
    },
  })
}

export async function createConteudo(
  orgId: string,
  campaignId: string,
  secao: ConteudoSecao,
  ordem: number,
  createdBy?: string | null,
): Promise<{ id: string; codigo: string }> {
  const { data, error } = await supabase
    .from('crm_conteudos')
    .insert({ org_id: orgId, campaign_id: campaignId, secao, ordem, created_by: createdBy ?? null })
    .select('id, codigo')
    .single()
  if (error) throw new Error(error.message)
  return data as { id: string; codigo: string }
}

export async function updateConteudo(id: string, patch: Partial<Omit<ConteudoRow, 'id' | 'codigo'>>) {
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
