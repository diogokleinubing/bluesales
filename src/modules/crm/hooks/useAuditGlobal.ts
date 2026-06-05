import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from './useFunnelStages'

export interface AuditEntry {
  id: number
  entity_type: string
  entity_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  user_id: string | null
  created_at: string
  actorNome: string
  entityNome: string
}

export interface AuditFilters {
  entityType: string // entity_type | 'all'
  action: string // action | 'all'
}

/** Rótulos de tipo de entidade (entity_type singular -> label pt-BR). */
export const ENTITY_LABEL: Record<string, string> = {
  organization: 'Organização',
  person: 'Contato',
  opportunity: 'Oportunidade',
  crm_event: 'Evento',
  task: 'Tarefa',
  activity: 'Atividade',
  local: 'Local',
  artist: 'Artista',
}

export const ACTION_LABEL: Record<string, string> = {
  create: 'Criação',
  update: 'Edição',
  delete: 'Remoção',
  stage_change: 'Mudança de estágio',
  link: 'Vínculo',
  unlink: 'Desvínculo',
}

/** Rótulos de campos comuns (field_name -> label). */
export const FIELD_LABEL: Record<string, string> = {
  nome: 'Nome',
  titulo: 'Título',
  cidade: 'Cidade',
  uf: 'UF',
  gmv_anual: 'GMV anual',
  gmv_estimado: 'GMV estimado',
  classificacao: 'Classificação',
  status: 'Status',
  status_comercial: 'Status comercial',
  resultado: 'Resultado',
  observacoes: 'Observações',
  funil_stage_id: 'Estágio',
  stage_id: 'Estágio',
  escalao: 'Escalão',
  capacidade: 'Capacidade',
  capacidade_estimada: 'Capacidade estimada',
  tipo: 'Tipo',
  data_prevista: 'Data prevista',
  data_prevista_fechamento: 'Previsão de fechamento',
  probabilidade: 'Probabilidade',
  concluida: 'Concluída',
}

// Tabela + coluna de nome por entity_type.
const NAME_SOURCES: { type: string; table: string; col: string }[] = [
  { type: 'organization', table: 'organizations', col: 'nome' },
  { type: 'person', table: 'persons', col: 'nome' },
  { type: 'opportunity', table: 'opportunities', col: 'titulo' },
  { type: 'crm_event', table: 'crm_events', col: 'nome' },
  { type: 'task', table: 'tasks', col: 'titulo' },
  { type: 'activity', table: 'activities', col: 'titulo' },
  { type: 'local', table: 'crm_locals', col: 'nome' },
  { type: 'artist', table: 'artists', col: 'nome' },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Auditoria global do módulo Comercial (todas as entidades). */
export function useAuditGlobal(filters: AuditFilters, limit = 500) {
  const orgId = useCrmOrgId()
  return useQuery({
    enabled: !!orgId,
    staleTime: 15_000,
    queryKey: ['crm', 'audit-global', orgId, filters, limit],
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = supabase
        .from('audit_log')
        .select('id, entity_type, entity_id, action, field_name, old_value, new_value, user_id, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (filters.entityType !== 'all') q = q.eq('entity_type', filters.entityType)
      if (filters.action !== 'all') q = q.eq('action', filters.action)

      const [audit, profiles, stages] = await Promise.all([
        q,
        supabase.from('profiles').select('id, nome, email'),
        supabase.from('funnel_stages').select('id, nome'),
      ])
      if (audit.error) throw new Error(audit.error.message)

      const actorById = new Map(
        (profiles.data ?? []).map((p) => [
          p.id as string,
          (p.nome as string) || (p.email as string) || '',
        ]),
      )
      const stageById = new Map((stages.data ?? []).map((s) => [s.id as string, s.nome as string]))

      // Resolve nomes das entidades referenciadas (1 query por tabela usada).
      const rows = audit.data ?? []
      const usedTypes = new Set(rows.map((r) => r.entity_type as string))
      const nameByKey = new Map<string, string>()
      await Promise.all(
        NAME_SOURCES.filter((s) => usedTypes.has(s.type)).map(async (s) => {
          const ids = [...new Set(rows.filter((r) => r.entity_type === s.type).map((r) => r.entity_id as string))]
          if (!ids.length) return
          const res = await supabase.from(s.table).select(`id, ${s.col}`).in('id', ids)
          const data = (res.data ?? []) as unknown as Record<string, unknown>[]
          for (const d of data) nameByKey.set(`${s.type}:${d.id}`, String(d[s.col] ?? ''))
        }),
      )

      const resolveStage = (v: string | null) => (v && UUID_RE.test(v) ? stageById.get(v) ?? v : v)

      return rows.map((r) => {
        const isStage = r.field_name === 'funil_stage_id' || r.field_name === 'stage_id' || r.action === 'stage_change'
        return {
          id: r.id as number,
          entity_type: r.entity_type as string,
          entity_id: r.entity_id as string,
          action: r.action as string,
          field_name: (r.field_name as string | null) ?? null,
          old_value: isStage ? resolveStage(r.old_value as string | null) : (r.old_value as string | null),
          new_value: isStage ? resolveStage(r.new_value as string | null) : (r.new_value as string | null),
          user_id: (r.user_id as string | null) ?? null,
          created_at: r.created_at as string,
          actorNome: (r.user_id && actorById.get(r.user_id as string)) || 'Sistema',
          entityNome: nameByKey.get(`${r.entity_type}:${r.entity_id}`) || '(removido)',
        }
      })
    },
  })
}
