import { supabase } from '@/lib/supabase'
import { classifyMany, type ClassificationRules } from './classify'

export type ReclassifyScope =
  | 'all'
  | { local: string }
  | { codigos: string[] }

export interface ReclassifyResult {
  /** Eventos cujo segmento/gênero calculado mudou (e foram gravados). */
  updated: number
  /** Eventos que já estavam corretos (não houve gravação). */
  unchanged: number
}

interface EventRowForClass {
  id: string
  codigo_evento: string
  nome: string | null
  local: string | null
  segmento: string | null
  genero: string | null
  segmento_manual: string | null
  genero_manual: string | null
}

const SELECT =
  'id, codigo_evento, nome, local, segmento, genero, segmento_manual, genero_manual'

async function fetchScope(
  orgId: string,
  scope: ReclassifyScope,
): Promise<EventRowForClass[]> {
  const out: EventRowForClass[] = []
  const PAGE = 1000

  if (typeof scope === 'object' && 'codigos' in scope) {
    // Busca por códigos, em lotes (limite do IN).
    for (let i = 0; i < scope.codigos.length; i += 500) {
      const slice = scope.codigos.slice(i, i + 500)
      const { data, error } = await supabase
        .from('events')
        .select(SELECT)
        .eq('org_id', orgId)
        .in('codigo_evento', slice)
      if (error) throw new Error(error.message)
      out.push(...((data ?? []) as EventRowForClass[]))
    }
    return out
  }

  // 'all' ou { local } — paginado.
  let from = 0
  for (;;) {
    let q = supabase.from('events').select(SELECT).eq('org_id', orgId)
    if (typeof scope === 'object' && 'local' in scope) {
      q = q.eq('local', scope.local)
    }
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as EventRowForClass[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

/**
 * Reclassifica os eventos do scope rodando o motor e gravando o resultado
 * resolvido em events.segmento / events.genero (o cache exibido).
 *
 * O motor já honra as definições manuais: para um evento com segmento_manual
 * ou genero_manual, ele devolve o próprio valor manual naquela dimensão (as
 * regras nunca o sobrescrevem). Por isso gravamos sempre o valor resolvido —
 * inclusive o manual, garantindo que o cache reflita o que o usuário definiu.
 * `skipped` conta os eventos que tinham ao menos uma dimensão manual preservada.
 */
export async function reclassifyEvents(
  scope: ReclassifyScope,
  rules: ClassificationRules,
  orgId: string,
): Promise<ReclassifyResult> {
  const events = await fetchScope(orgId, scope)
  const results = classifyMany(events, rules)

  let updated = 0
  let unchanged = 0

  type Patch = { segmento: string | null; genero: string | null }
  const groups = new Map<string, { patch: Patch; ids: string[] }>()

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const r = results[i]
    const novoSeg = r.segmento ?? null
    const novoGen = r.genero ?? null

    // Só grava (e conta) o que realmente mudou em relação ao cache atual.
    if ((e.segmento ?? null) === novoSeg && (e.genero ?? null) === novoGen) {
      unchanged++
      continue
    }

    const patch: Patch = { segmento: novoSeg, genero: novoGen }
    const key = `${novoSeg ?? ' '}|${novoGen ?? ' '}`
    const g = groups.get(key) ?? { patch, ids: [] }
    g.ids.push(e.id)
    groups.set(key, g)
    updated++
  }

  for (const { patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500)
      const { error } = await supabase
        .from('events')
        .update(patch)
        .in('id', slice)
      if (error) throw new Error(error.message)
    }
  }

  return { updated, unchanged }
}
