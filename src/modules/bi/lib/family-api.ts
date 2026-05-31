import { supabase } from '@/lib/supabase'
import { classifyFamilia, type FamilyRules } from './family'
import type { EventFamilyOverrideRow } from '@/lib/database.types'

export async function fetchFamilyOverrides(
  orgId: string,
): Promise<EventFamilyOverrideRow[]> {
  const { data, error } = await supabase
    .from('event_family_override')
    .select('*')
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)
  return (data ?? []) as EventFamilyOverrideRow[]
}

export async function setFamilyOverride(
  orgId: string,
  codigo_evento: string,
  familia: string,
) {
  const { error } = await supabase
    .from('event_family_override')
    .upsert(
      { org_id: orgId, codigo_evento, familia },
      { onConflict: 'org_id,codigo_evento' },
    )
  if (error) throw new Error(error.message)
}

export async function deleteFamilyOverride(id: string) {
  const { error } = await supabase
    .from('event_family_override')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Zera todos os agrupamentos: apaga overrides e limpa events.familia.
 * Usa RPC server-side (transação única, sem o timeout/limites do PostgREST no
 * update em massa). Retorna quantos eventos foram limpos.
 */
export async function clearAllFamilias(orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('clear_event_families', {
    p_org: orgId,
  })
  if (error) throw new Error(`clear_event_families: ${error.message}`)
  return Number(data ?? 0)
}

/**
 * Recalcula a família de todos os eventos (sugestão pelo nome + overrides) e
 * grava em events.familia via RPC set-based. Retorna a quantidade atualizada.
 */
export async function reclassifyFamilias(orgId: string): Promise<number> {
  const overridesRows = await fetchFamilyOverrides(orgId)
  const rules: FamilyRules = {
    overrides: new Map(overridesRows.map((o) => [o.codigo_evento, o.familia])),
  }

  // Busca todos os eventos (paginado).
  const events: { codigo_evento: string; nome: string | null }[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('events')
      .select('codigo_evento, nome')
      .eq('org_id', orgId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    events.push(...(rows as typeof events))
    if (rows.length < PAGE) break
    from += PAGE
  }

  const codigos: string[] = []
  const familias: (string | null)[] = []
  for (const e of events) {
    codigos.push(e.codigo_evento)
    familias.push(classifyFamilia(e, rules))
  }

  // Atualiza em lotes.
  let updated = 0
  const BATCH = 1000
  for (let i = 0; i < codigos.length; i += BATCH) {
    const { data, error } = await supabase.rpc('set_event_families', {
      p_org: orgId,
      p_codigos: codigos.slice(i, i + BATCH),
      p_familias: familias.slice(i, i + BATCH),
    })
    if (error) throw new Error(`set_event_families: ${error.message}`)
    updated += Number(data ?? 0)
  }
  return updated
}
