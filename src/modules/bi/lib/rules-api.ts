import { supabase } from '@/lib/supabase'
import type { ClassificationRules } from './classify'
import type {
  GeneroRow,
  KeywordRuleRow,
  SegmentRow,
  VenueRuleRow,
  VenueSegmentMapRow,
} from '@/lib/database.types'

export interface RulesBundle {
  segments: SegmentRow[]
  generos: GeneroRow[]
  keywordRules: KeywordRuleRow[]
  venueRules: VenueRuleRow[]
  venueMap: VenueSegmentMapRow[]
}

export async function fetchRules(orgId: string): Promise<RulesBundle> {
  const [segments, generos, keywordRules, venueRules, venueMap] =
    await Promise.all([
      supabase.from('segments').select('*').eq('org_id', orgId).order('nome'),
      supabase.from('generos').select('*').eq('org_id', orgId).order('nome'),
      supabase.from('keyword_rules').select('*').eq('org_id', orgId).order('ordem'),
      supabase.from('venue_rules').select('*').eq('org_id', orgId).order('ordem'),
      supabase.from('venue_segment_map').select('*').eq('org_id', orgId),
    ])
  const err =
    segments.error ||
    generos.error ||
    keywordRules.error ||
    venueRules.error ||
    venueMap.error
  if (err) throw new Error(err.message)
  return {
    segments: (segments.data ?? []) as SegmentRow[],
    generos: (generos.data ?? []) as GeneroRow[],
    keywordRules: (keywordRules.data ?? []) as KeywordRuleRow[],
    venueRules: (venueRules.data ?? []) as VenueRuleRow[],
    venueMap: (venueMap.data ?? []) as VenueSegmentMapRow[],
  }
}

/** Converte o bundle para o formato do motor de classificação. */
export function toClassificationRules(bundle: RulesBundle): ClassificationRules {
  return {
    keywordRules: bundle.keywordRules.map((k) => ({
      keyword: k.keyword,
      segmento: k.segmento,
      genero: k.genero,
      ordem: k.ordem,
    })),
    venueRules: bundle.venueRules.map((k) => ({
      keyword: k.keyword,
      segmento: k.segmento,
      genero: k.genero,
      ordem: k.ordem,
    })),
    venueMap: bundle.venueMap.map((v) => ({
      local: v.local,
      segmento: v.segmento,
      genero: v.genero,
    })),
  }
}

// ----------------------------------------------------------------------------
// CRUD — Segmentos
// ----------------------------------------------------------------------------
export async function addSegment(orgId: string, nome: string) {
  const { error } = await supabase.from('segments').insert({ org_id: orgId, nome })
  if (error) throw new Error(error.message)
}
export async function renameSegment(id: string, nome: string) {
  const { error } = await supabase.from('segments').update({ nome }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteSegment(id: string) {
  const { error } = await supabase.from('segments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ----------------------------------------------------------------------------
// CRUD — Gêneros
// ----------------------------------------------------------------------------
export async function addGenero(orgId: string, nome: string) {
  const { error } = await supabase.from('generos').insert({ org_id: orgId, nome })
  if (error) throw new Error(error.message)
}
export async function renameGenero(id: string, nome: string) {
  const { error } = await supabase.from('generos').update({ nome }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteGenero(id: string) {
  const { error } = await supabase.from('generos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ----------------------------------------------------------------------------
// CRUD — Regras por keyword (nome ou local)
// ----------------------------------------------------------------------------
export interface KeywordRuleInput {
  keyword: string
  segmento: string | null
  genero: string | null
  ordem: number
}

export async function addKeywordRule(
  table: 'keyword_rules' | 'venue_rules',
  orgId: string,
  rule: KeywordRuleInput,
) {
  const { error } = await supabase.from(table).insert({ org_id: orgId, ...rule })
  if (error) throw new Error(error.message)
}
export async function updateKeywordRule(
  table: 'keyword_rules' | 'venue_rules',
  id: string,
  patch: Partial<KeywordRuleInput>,
) {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteKeywordRule(
  table: 'keyword_rules' | 'venue_rules',
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ----------------------------------------------------------------------------
// CRUD — Mapa de locais (venue_segment_map)
// ----------------------------------------------------------------------------
/** Upsert da classificação de um local (segmento e/ou gênero). */
export async function setVenueClassification(
  orgId: string,
  local: string,
  segmento: string | null,
  genero: string | null,
) {
  const { error } = await supabase
    .from('venue_segment_map')
    .upsert(
      { org_id: orgId, local, segmento, genero },
      { onConflict: 'org_id,local' },
    )
  if (error) throw new Error(error.message)
}
export async function deleteVenueClassification(id: string) {
  const { error } = await supabase.from('venue_segment_map').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ----------------------------------------------------------------------------
// Classificação manual no próprio evento (substitui os "overrides")
// ----------------------------------------------------------------------------
/** Define segmento e/ou gênero manual de vários eventos (em lote). */
export async function setEventManual(
  orgId: string,
  codigos: string[],
  patch: { segmento_manual?: string; genero_manual?: string },
) {
  for (let i = 0; i < codigos.length; i += 500) {
    const slice = codigos.slice(i, i + 500)
    const { error } = await supabase
      .from('events')
      .update(patch)
      .eq('org_id', orgId)
      .in('codigo_evento', slice)
    if (error) throw new Error(error.message)
  }
}

/**
 * Atualiza a definição manual de UMA dimensão de um evento.
 * `value` = string define manual; `null` limpa (volta a "automático").
 */
export async function setEventDimensionManual(
  orgId: string,
  codigo: string,
  dim: 'segmento' | 'genero',
  value: string | null,
) {
  const col = dim === 'segmento' ? 'segmento_manual' : 'genero_manual'
  const { error } = await supabase
    .from('events')
    .update({ [col]: value })
    .eq('org_id', orgId)
    .eq('codigo_evento', codigo)
  if (error) throw new Error(error.message)
}

/** Mapa codigo -> { segmento_manual, genero_manual } para a tela de Eventos. */
export async function fetchEventManuals(
  orgId: string,
): Promise<Map<string, { segmento_manual: string | null; genero_manual: string | null }>> {
  const map = new Map<
    string,
    { segmento_manual: string | null; genero_manual: string | null }
  >()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('codigo_evento, segmento_manual, genero_manual')
      .eq('org_id', orgId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      codigo_evento: string
      segmento_manual: string | null
      genero_manual: string | null
    }[]
    for (const r of rows)
      map.set(r.codigo_evento, {
        segmento_manual: r.segmento_manual,
        genero_manual: r.genero_manual,
      })
    if (rows.length < PAGE) break
    from += PAGE
  }
  return map
}
