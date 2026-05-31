import { supabase } from '@/lib/supabase'
import {
  buildRules,
  classifyEvent,
  type ClassifyRules,
} from './classify'
import type {
  EventSegmentOverrideRow,
  KeywordRuleRow,
  SegmentRow,
  VenueRuleRow,
  VenueSegmentMapRow,
} from '@/lib/database.types'

export interface RulesBundle {
  segments: SegmentRow[]
  keywordRules: KeywordRuleRow[]
  venueRules: VenueRuleRow[]
  venueMap: VenueSegmentMapRow[]
  overrides: EventSegmentOverrideRow[]
}

export async function fetchRules(orgId: string): Promise<RulesBundle> {
  const [segments, keywordRules, venueRules, venueMap, overrides] =
    await Promise.all([
      supabase.from('segments').select('*').eq('org_id', orgId).order('nome'),
      supabase.from('keyword_rules').select('*').eq('org_id', orgId).order('ordem'),
      supabase.from('venue_rules').select('*').eq('org_id', orgId).order('ordem'),
      supabase.from('venue_segment_map').select('*').eq('org_id', orgId),
      supabase.from('event_segment_override').select('*').eq('org_id', orgId),
    ])
  const err =
    segments.error ||
    keywordRules.error ||
    venueRules.error ||
    venueMap.error ||
    overrides.error
  if (err) throw new Error(err.message)
  return {
    segments: (segments.data ?? []) as SegmentRow[],
    keywordRules: (keywordRules.data ?? []) as KeywordRuleRow[],
    venueRules: (venueRules.data ?? []) as VenueRuleRow[],
    venueMap: (venueMap.data ?? []) as VenueSegmentMapRow[],
    overrides: (overrides.data ?? []) as EventSegmentOverrideRow[],
  }
}

export function toClassifyRules(bundle: RulesBundle): ClassifyRules {
  return buildRules({
    overrides: bundle.overrides.map((o) => ({
      codigo_evento: o.codigo_evento,
      segmento: o.segmento,
    })),
    venueMap: bundle.venueMap.map((v) => ({
      local: v.local,
      segmento: v.segmento,
    })),
    keywordRules: bundle.keywordRules.map((k) => ({
      keyword: k.keyword,
      segmento: k.segmento,
      ordem: k.ordem,
    })),
    venueRules: bundle.venueRules.map((k) => ({
      keyword: k.keyword,
      segmento: k.segmento,
      ordem: k.ordem,
    })),
  })
}

// ----------------------------------------------------------------------------
// CRUD das regras
// ----------------------------------------------------------------------------

export async function addSegment(orgId: string, nome: string) {
  const { error } = await supabase.from('segments').insert({ org_id: orgId, nome })
  if (error) throw new Error(error.message)
}
export async function deleteSegment(id: string) {
  const { error } = await supabase.from('segments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addKeywordRule(
  table: 'keyword_rules' | 'venue_rules',
  orgId: string,
  rule: { keyword: string; segmento: string; ordem: number },
) {
  const { error } = await supabase.from(table).insert({ org_id: orgId, ...rule })
  if (error) throw new Error(error.message)
}
export async function deleteKeywordRule(
  table: 'keyword_rules' | 'venue_rules',
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Upsert do mapa local -> segmento (override por local). */
export async function setVenueSegment(
  orgId: string,
  local: string,
  segmento: string,
) {
  const { error } = await supabase
    .from('venue_segment_map')
    .upsert({ org_id: orgId, local, segmento }, { onConflict: 'org_id,local' })
  if (error) throw new Error(error.message)
}
export async function deleteVenueSegment(id: string) {
  const { error } = await supabase.from('venue_segment_map').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Upsert do override por evento. */
export async function setEventOverride(
  orgId: string,
  codigo_evento: string,
  segmento: string,
) {
  const { error } = await supabase
    .from('event_segment_override')
    .upsert(
      { org_id: orgId, codigo_evento, segmento },
      { onConflict: 'org_id,codigo_evento' },
    )
  if (error) throw new Error(error.message)
}
export async function deleteEventOverride(id: string) {
  const { error } = await supabase
    .from('event_segment_override')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Aplica um segmento (override) a vários eventos de uma vez. */
export async function bulkSetEventOverride(
  orgId: string,
  codigos: string[],
  segmento: string,
) {
  const rows = codigos.map((c) => ({
    org_id: orgId,
    codigo_evento: c,
    segmento,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('event_segment_override')
      .upsert(rows.slice(i, i + 500), { onConflict: 'org_id,codigo_evento' })
    if (error) throw new Error(error.message)
  }
}

/**
 * Recalcula o segmento de todos os eventos e grava em events.segmento.
 * Faz updates agrupados por segmento-alvo (poucas queries).
 * Retorna a quantidade de eventos atualizados.
 */
export async function reclassifyEvents(orgId: string): Promise<number> {
  const bundle = await fetchRules(orgId)
  const rules = toClassifyRules(bundle)

  // Busca todos os eventos (paginado).
  const events: { id: string; codigo_evento: string; nome: string | null; local: string | null }[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('id, codigo_evento, nome, local')
      .eq('org_id', orgId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    events.push(...(rows as typeof events))
    if (rows.length < PAGE) break
    from += PAGE
  }

  // Agrupa ids por segmento-alvo.
  const bySegment = new Map<string, string[]>()
  for (const e of events) {
    const seg = classifyEvent(e, rules)
    const arr = bySegment.get(seg) ?? []
    arr.push(e.id)
    bySegment.set(seg, arr)
  }

  // Update por segmento, em chunks (limite de tamanho do IN).
  let updated = 0
  for (const [segmento, ids] of bySegment) {
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500)
      const { error } = await supabase
        .from('events')
        .update({ segmento })
        .in('id', slice)
      if (error) throw new Error(error.message)
      updated += slice.length
    }
  }
  return updated
}
