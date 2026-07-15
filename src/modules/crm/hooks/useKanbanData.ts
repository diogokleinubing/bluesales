import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'
import { type RelHealth } from './useRelacionamento'

export interface KanbanCard {
  id: string
  stageId: string | null
  title: string
  subtitle?: string | null
  badge?: string | null
  meta?: string | null
  status?: string | null
  gmv?: number | null
  href: string
  /** Saúde derivada das atividades pendentes (usado no funil de prospecção). */
  health?: RelHealth
  proximaAcaoAt?: string | null
  atrasadaDesde?: string | null
  /** Responsável (owner) — para avatar e filtro na prospecção. */
  ownerId?: string | null
  ownerNome?: string | null
  ownerColor?: string | null
}

/** Organizações para o Kanban de relacionamento. */
export function useOrgsKanban() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'kanban', 'orgs', orgId],
    queryFn: async (): Promise<KanbanCard[]> => {
      const cols = 'id, nome, cidade, uf, classificacao, status_comercial, funil_stage_id, gmv_anual'
      const rows: Array<Record<string, string | null>> = []
      for (let from = 0; ; from += 1000) {
        const res = await supabase
          .from('organizations').select(cols)
          .eq('org_id', orgId!).is('deleted_at', null).is('parent_id', null).order('nome')
          .range(from, from + 999)
        if (res.error) throw new Error(res.error.message)
        rows.push(...((res.data ?? []) as unknown as Array<Record<string, string | null>>))
        if (!res.data || res.data.length < 1000) break
      }
      return rows.map((o) => ({
        id: o.id as string,
        stageId: o.funil_stage_id,
        title: o.nome as string,
        badge: o.classificacao,
        subtitle: [o.cidade, o.uf].filter(Boolean).join('/') || null,
        status: o.status_comercial,
        gmv: o.gmv_anual != null ? Number(o.gmv_anual) : null,
        href: `/comercial/organizacoes/${o.id}`,
      }))
    },
  })
}

/** Oportunidades para o Kanban de oportunidades. */
export function useOppsKanban() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'kanban', 'opps', orgId],
    queryFn: async (): Promise<KanbanCard[]> => {
      const [oppsRes, pendRes, profsRes] = await Promise.all([
        supabase
          .from('opportunities')
          .select('id, titulo, gmv_estimado, stage_id, owner_id, organizations(nome)')
          .eq('org_id', orgId!)
          .is('deleted_at', null)
          .is('resultado', null)
          .order('created_at', { ascending: false }),
        // Atividades pendentes agendadas ligadas a oportunidades — base da saúde.
        supabase
          .from('activities')
          .select('opportunity_id, data_hora')
          .eq('org_id', orgId!)
          .is('deleted_at', null)
          .eq('realizada', false)
          .not('data_hora', 'is', null)
          .not('opportunity_id', 'is', null)
          .limit(5000),
        supabase.from('profiles').select('id, nome, color'),
      ])
      if (oppsRes.error) throw new Error(oppsRes.error.message)
      const ownerById = new Map(
        (profsRes.data ?? []).map((p) => [p.id as string, p as { nome: string | null; color: string | null }]),
      )

      const now = Date.now()
      const agg = new Map<string, { minFuture: number | null; minOverdue: number | null }>()
      for (const a of pendRes.data ?? []) {
        const id = a.opportunity_id as string | null
        const t = a.data_hora ? Date.parse(a.data_hora as string) : NaN
        if (!id || Number.isNaN(t)) continue
        const cur = agg.get(id) ?? { minFuture: null, minOverdue: null }
        if (t >= now) cur.minFuture = cur.minFuture == null ? t : Math.min(cur.minFuture, t)
        else cur.minOverdue = cur.minOverdue == null ? t : Math.min(cur.minOverdue, t)
        agg.set(id, cur)
      }
      const saude = (id: string): Pick<KanbanCard, 'health' | 'proximaAcaoAt' | 'atrasadaDesde'> => {
        const a = agg.get(id)
        const proximaAcaoAt = a?.minFuture != null ? new Date(a.minFuture).toISOString() : null
        const atrasadaDesde = a?.minOverdue != null ? new Date(a.minOverdue).toISOString() : null
        const health: RelHealth = atrasadaDesde ? 'atrasada' : proximaAcaoAt ? 'em_dia' : 'sem_acao'
        return { health, proximaAcaoAt, atrasadaDesde }
      }

      return (oppsRes.data ?? []).map((o) => {
        const org = (o.organizations as { nome?: string } | null) ?? null
        const owner = o.owner_id ? ownerById.get(o.owner_id as string) : null
        return {
          id: o.id,
          stageId: o.stage_id,
          title: o.titulo,
          subtitle: org?.nome ?? null,
          meta: o.gmv_estimado != null ? Number(o.gmv_estimado).toString() : null,
          href: `/comercial/oportunidades/${o.id}`,
          ownerId: (o.owner_id as string | null) ?? null,
          ownerNome: owner?.nome ?? null,
          ownerColor: owner?.color ?? null,
          ...saude(o.id),
        }
      })
    },
  })
}

/** Move um card para outro estágio (o trigger registra stage_history/audit). */
export async function moveCardStage(
  kind: 'org' | 'opp',
  id: string,
  stageId: string | null,
) {
  const table = kind === 'org' ? 'organizations' : 'opportunities'
  const col = kind === 'org' ? 'funil_stage_id' : 'stage_id'
  if (kind === 'opp' && stageId == null) {
    throw new Error('Oportunidade precisa de um estágio.')
  }
  const { error } = await supabase
    .from(table)
    .update({ [col]: stageId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
