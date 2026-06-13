import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type RelTipo = 'org' | 'local' | 'evento'

export interface RelItem {
  tipo: RelTipo
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  classificacao: string | null
  funil_stage_id: string | null
  /** GMV: org = gmv_anual; local = soma dos eventos; evento = gmv_estimado. */
  gmv: number | null
  /** status_comercial — só organizações. */
  status: string | null
  href: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

/** Busca todas as linhas de uma tabela (paginando) do tenant, vivas. */
async function fetchAll(table: string, cols: string, orgId: string, parentNull = false): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).eq('org_id', orgId).is('deleted_at', null)
    if (parentNull) q = q.is('parent_id', null)
    const res = await q.order('nome').range(from, from + 999)
    if (res.error) throw new Error(res.error.message)
    const data = (res.data ?? []) as Row[]
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** Itens do Funil de Relacionamento: organizações + locais + eventos. */
export function useRelacionamento() {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryKey: ['crm', 'relacionamento', orgId],
    queryFn: async (): Promise<RelItem[]> => {
      const [orgs, locs, evs] = await Promise.all([
        fetchAll('organizations', 'id, nome, cidade, uf, classificacao, status_comercial, funil_stage_id, gmv_anual', orgId!, true),
        fetchAll('crm_locals', 'id, nome, cidade, uf, classificacao, funil_stage_id', orgId!),
        fetchAll('crm_events', 'id, nome, classificacao, funil_stage_id, gmv_estimado, local_id, crm_locals(cidade, uf)', orgId!),
      ])

      // GMV por local = soma dos eventos do local.
      const gmvPorLocal = new Map<string, number>()
      for (const e of evs) {
        if (e.local_id && e.gmv_estimado != null) {
          gmvPorLocal.set(e.local_id, (gmvPorLocal.get(e.local_id) ?? 0) + Number(e.gmv_estimado))
        }
      }

      const items: RelItem[] = []
      for (const o of orgs) {
        items.push({
          tipo: 'org', id: o.id, nome: o.nome, cidade: o.cidade, uf: o.uf,
          classificacao: o.classificacao, funil_stage_id: o.funil_stage_id,
          gmv: o.gmv_anual != null ? Number(o.gmv_anual) : null,
          status: o.status_comercial, href: `/comercial/organizacoes/${o.id}`,
        })
      }
      for (const l of locs) {
        items.push({
          tipo: 'local', id: l.id, nome: l.nome, cidade: l.cidade, uf: l.uf,
          classificacao: l.classificacao, funil_stage_id: l.funil_stage_id,
          gmv: gmvPorLocal.get(l.id) ?? null, status: null, href: `/comercial/locais/${l.id}`,
        })
      }
      for (const e of evs) {
        const loc = (e.crm_locals as { cidade: string | null; uf: string | null } | null) ?? null
        items.push({
          tipo: 'evento', id: e.id, nome: e.nome, cidade: loc?.cidade ?? null, uf: loc?.uf ?? null,
          classificacao: e.classificacao, funil_stage_id: e.funil_stage_id,
          gmv: e.gmv_estimado != null ? Number(e.gmv_estimado) : null, status: null,
          href: `/comercial/eventos/${e.id}`,
        })
      }
      return items
    },
  })
}

const TABLE: Record<RelTipo, string> = { org: 'organizations', local: 'crm_locals', evento: 'crm_events' }

/** Move um item (org/local/evento) para outro estágio de relacionamento. */
export async function moveRelItemStage(tipo: RelTipo, id: string, stageId: string | null) {
  const { error } = await supabase.from(TABLE[tipo]).update({ funil_stage_id: stageId }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Altera a classe (A+/A/B/C ou null) de um item. */
export async function updateRelClasse(tipo: RelTipo, id: string, classe: string | null) {
  const { error } = await supabase.from(TABLE[tipo]).update({ classificacao: classe }).eq('id', id)
  if (error) throw new Error(error.message)
}
