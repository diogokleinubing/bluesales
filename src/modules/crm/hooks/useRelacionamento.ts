import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export type RelTipo = 'org' | 'local' | 'evento'

/** Saúde derivada das atividades pendentes de uma entidade. */
export type RelHealth = 'em_dia' | 'atrasada' | 'sem_acao'
/** Estado de acompanhamento exibido (combina a flag manual + a saúde). */
export type AcompEstado = 'fora' | RelHealth

export interface RelItem {
  tipo: RelTipo
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  classificacao: string | null
  funil_stage_id: string | null
  /** GMV: org = gmv_anual; local = gmv_estimado (manual); evento = gmv_estimado. */
  gmv: number | null
  /** status_comercial — só organizações. */
  status: string | null
  /** Data de cadastro na base (created_at ISO). Local pode ser null até a coluna existir. */
  cadastro: string | null
  /** Flag manual: estamos em trabalho ativo de relacionamento nesta entidade? */
  emTrabalho: boolean
  /** Saúde derivada das activities pendentes (só relevante quando emTrabalho). */
  health: RelHealth
  /** Próxima ação futura agendada (ISO), para tooltip. */
  proximaAcaoAt: string | null
  /** Pendência vencida mais antiga (ISO), para tooltip "atrasada desde". */
  atrasadaDesde: string | null
  /** Sinal de oportunidade de prospecção ligada à entidade (ou null se não há). */
  oppSignal: OppSignal | null
  href: string
}

export interface RelOpp {
  id: string
  titulo: string
  gmv: number | null
  stageId: string | null
  resultado: 'Ganho' | 'Perdida' | null
}

/**
 * Sinal exibido no funil de relacionamento:
 * - 'ativa': há oportunidade(s) em aberto (azul) — lista as ativas.
 * - 'ganha'/'perdida': sem ativas; reflete a oportunidade resolvida mais recente.
 */
export interface OppSignal {
  estado: 'ativa' | 'ganha' | 'perdida'
  opps: RelOpp[]
}

/** Estado visual final: se não está em trabalho, é "fora"; senão, a saúde derivada. */
export function acompEstado(item: RelItem): AcompEstado {
  return item.emTrabalho ? item.health : 'fora'
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

interface PendRow {
  organization_id: string | null
  local_id: string | null
  crm_event_id: string | null
  data_hora: string | null
}

/** Atividades pendentes (não realizadas) com data marcada — base da saúde derivada. */
async function fetchPendentes(orgId: string): Promise<PendRow[]> {
  const out: PendRow[] = []
  for (let from = 0; ; from += 1000) {
    const res = await supabase
      .from('activities')
      .select('organization_id, local_id, crm_event_id, data_hora')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .eq('realizada', false)
      .not('data_hora', 'is', null)
      .range(from, from + 999)
    if (res.error) throw new Error(res.error.message)
    const data = (res.data ?? []) as PendRow[]
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

interface OppRow {
  id: string; titulo: string; gmv_estimado: number | null; stage_id: string | null
  resultado: 'Ganho' | 'Perdida' | null; resultado_em: string | null
  organization_id: string | null; local_id: string | null; crm_event_id: string | null
}

/** Oportunidades (ativas + resolvidas) — para sinalizar no funil de relacionamento. */
async function fetchOpps(orgId: string): Promise<OppRow[]> {
  const out: OppRow[] = []
  for (let from = 0; ; from += 1000) {
    const res = await supabase
      .from('opportunities')
      .select('id, titulo, gmv_estimado, stage_id, resultado, resultado_em, organization_id, local_id, crm_event_id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .range(from, from + 999)
    if (res.error) throw new Error(res.error.message)
    const data = (res.data ?? []) as OppRow[]
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
      const [orgs, locs, evs, pend, opps] = await Promise.all([
        // '*' é resiliente: pega em_trabalho_relacionamento quando a coluna existir, sem quebrar antes.
        fetchAll('organizations', '*', orgId!, true),
        fetchAll('crm_locals', '*', orgId!),
        fetchAll('crm_events', '*, crm_locals(cidade, uf)', orgId!),
        fetchPendentes(orgId!),
        fetchOpps(orgId!),
      ])

      // Oportunidades por entidade (org/local/evento), com resultado_em p/ ordenar.
      const oppsPorEntidade = new Map<string, { rel: RelOpp; resultadoEm: string | null }[]>()
      for (const o of opps) {
        const rel: RelOpp = {
          id: o.id, titulo: o.titulo,
          gmv: o.gmv_estimado != null ? Number(o.gmv_estimado) : null,
          stageId: o.stage_id, resultado: o.resultado,
        }
        const entry = { rel, resultadoEm: o.resultado_em }
        for (const eid of [o.organization_id, o.local_id, o.crm_event_id]) {
          if (!eid) continue
          const arr = oppsPorEntidade.get(eid) ?? []
          arr.push(entry); oppsPorEntidade.set(eid, arr)
        }
      }
      // Sinal: ativas (azul) têm prioridade; senão, a resolvida mais recente (ganha/perdida).
      function signalDe(id: string): OppSignal | null {
        const list = oppsPorEntidade.get(id) ?? []
        if (list.length === 0) return null
        const ativas = list.filter((x) => x.rel.resultado == null)
        if (ativas.length > 0) return { estado: 'ativa', opps: ativas.map((x) => x.rel) }
        const recente = [...list].sort((a, b) => (b.resultadoEm ?? '').localeCompare(a.resultadoEm ?? ''))[0]
        return { estado: recente.rel.resultado === 'Ganho' ? 'ganha' : 'perdida', opps: [recente.rel] }
      }

      // Saúde derivada: por entidade, menor data futura (próxima ação) e menor
      // data vencida (atrasada desde) entre as atividades pendentes agendadas.
      const now = Date.now()
      const agg = new Map<string, { minFuture: number | null; minOverdue: number | null }>()
      for (const a of pend) {
        const t = a.data_hora ? Date.parse(a.data_hora) : NaN
        if (Number.isNaN(t)) continue
        for (const id of [a.organization_id, a.local_id, a.crm_event_id]) {
          if (!id) continue
          const cur = agg.get(id) ?? { minFuture: null, minOverdue: null }
          if (t >= now) cur.minFuture = cur.minFuture == null ? t : Math.min(cur.minFuture, t)
          else cur.minOverdue = cur.minOverdue == null ? t : Math.min(cur.minOverdue, t)
          agg.set(id, cur)
        }
      }
      function saude(id: string): Pick<RelItem, 'health' | 'proximaAcaoAt' | 'atrasadaDesde'> {
        const a = agg.get(id)
        const proximaAcaoAt = a?.minFuture != null ? new Date(a.minFuture).toISOString() : null
        const atrasadaDesde = a?.minOverdue != null ? new Date(a.minOverdue).toISOString() : null
        const health: RelHealth = atrasadaDesde ? 'atrasada' : proximaAcaoAt ? 'em_dia' : 'sem_acao'
        return { health, proximaAcaoAt, atrasadaDesde }
      }

      const items: RelItem[] = []
      for (const o of orgs) {
        items.push({
          tipo: 'org', id: o.id, nome: o.nome, cidade: o.cidade, uf: o.uf,
          classificacao: o.classificacao, funil_stage_id: o.funil_stage_id,
          gmv: o.gmv_anual != null ? Number(o.gmv_anual) : null,
          status: o.status_comercial, cadastro: o.created_at ?? null,
          emTrabalho: !!o.em_trabalho_relacionamento, ...saude(o.id),
          oppSignal: signalDe(o.id),
          href: `/comercial/organizacoes/${o.id}`,
        })
      }
      for (const l of locs) {
        items.push({
          tipo: 'local', id: l.id, nome: l.nome, cidade: l.cidade, uf: l.uf,
          classificacao: l.classificacao, funil_stage_id: l.funil_stage_id,
          gmv: l.gmv_estimado != null ? Number(l.gmv_estimado) : null, status: null,
          cadastro: l.created_at ?? null,
          emTrabalho: !!l.em_trabalho_relacionamento, ...saude(l.id),
          oppSignal: signalDe(l.id),
          href: `/comercial/locais/${l.id}`,
        })
      }
      for (const e of evs) {
        const loc = (e.crm_locals as { cidade: string | null; uf: string | null } | null) ?? null
        items.push({
          tipo: 'evento', id: e.id, nome: e.nome, cidade: loc?.cidade ?? null, uf: loc?.uf ?? null,
          classificacao: e.classificacao, funil_stage_id: e.funil_stage_id,
          gmv: e.gmv_estimado != null ? Number(e.gmv_estimado) : null, status: null,
          cadastro: e.created_at ?? null,
          emTrabalho: !!e.em_trabalho_relacionamento, ...saude(e.id),
          oppSignal: signalDe(e.id),
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

/**
 * Muda o estágio de relacionamento registrando uma observação no histórico
 * (stage_history.comentario), via RPC transacional crm_change_stage.
 */
export async function changeStage(tipo: RelTipo, id: string, stageId: string, comentario: string | null) {
  const { error } = await supabase.rpc('crm_change_stage', {
    p_tipo: tipo, p_id: id, p_stage: stageId, p_comentario: comentario,
  })
  if (error) throw new Error(error.message)
}

/** Altera a classe (A+/A/B/C ou null) de um item. */
export async function updateRelClasse(tipo: RelTipo, id: string, classe: string | null) {
  const { error } = await supabase.from(TABLE[tipo]).update({ classificacao: classe }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Liga/desliga a flag de trabalho ativo de relacionamento de um item. */
export async function updateEmTrabalho(tipo: RelTipo, id: string, value: boolean) {
  const { error } = await supabase.from(TABLE[tipo]).update({ em_trabalho_relacionamento: value }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Aplica os campos escolhidos ao sobrevivente antes de unificar. */
export async function updateEntityFields(tipo: RelTipo, id: string, patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase.from(TABLE[tipo]).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Unifica um duplicado no sobrevivente (RPC transacional crm_merge_entity). */
export async function mergeEntity(tipo: RelTipo, survivorId: string, duplicateId: string) {
  const p_tipo = tipo === 'org' ? 'organization' : tipo
  const { error } = await supabase.rpc('crm_merge_entity', {
    p_tipo, p_survivor: survivorId, p_duplicate: duplicateId,
  })
  if (error) throw new Error(error.message)
}
