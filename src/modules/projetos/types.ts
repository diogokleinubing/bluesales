// Domínio do módulo Projetos (mock front — sem backend por enquanto).
//
// Conceito: distinguir trabalho estratégico de não-estratégico. Cada Ação
// (unidade de trabalho) cai em uma de quatro "trilhas": puxa um objetivo da
// empresa (Estratégico), puxa uma meta de área (Objetivo de área), é uma
// iniciativa sem objetivo (Avulso) ou é manutenção do dia a dia (Rotina).

/** As quatro trilhas em que uma ação pode cair. */
export type Trilha = 'estrategico' | 'area' | 'avulso' | 'rotina'

/** Status de uma ação. */
export type AcaoStatus = 'a_fazer' | 'fazendo' | 'stand_by' | 'concluido'

/** Tipo de tarefa: entrega (execução) vs. pesquisa/validação (descoberta). */
export type TarefaTipo = 'execucao' | 'descoberta'

/** Objetivo: poucos da empresa (estratégicos) + metas próprias de cada área. */
export interface Objetivo {
  id: string
  nome: string
  tipo: 'empresa' | 'area'
  /** Para objetivos de área: a qual área pertence. */
  areaId: string | null
}

export interface Area {
  id: string
  nome: string
}

export interface Pessoa {
  id: string
  nome: string
  /** Área principal da pessoa (opcional, só para agrupar). */
  areaId: string | null
}

export interface Tarefa {
  id: string
  acaoId: string
  titulo: string
  /** Responsável próprio — pode ser diferente do responsável da ação. */
  responsavelId: string | null
  tipo: TarefaTipo
  concluida: boolean
  /** Data máxima (ISO yyyy-mm-dd) — opcional. */
  prazo: string | null
}

export interface Acao {
  id: string
  titulo: string
  /** Texto livre; a UI mostra um indicador quando preenchido. */
  detalhes: string
  areaId: string | null
  responsavelId: string | null
  status: AcaoStatus
  /**
   * Vínculo com objetivo. Quando preenchido, a trilha vem do tipo do objetivo
   * (empresa → Estratégico, área → Objetivo de área). Quando nulo, `semVinculo`
   * distingue Avulso de Rotina.
   */
  objetivoId: string | null
  semVinculo: 'avulso' | 'rotina' | null
}

/** Estado completo do módulo (o que a store guarda). */
export interface ProjetosState {
  areas: Area[]
  pessoas: Pessoa[]
  objetivos: Objetivo[]
  /** Ordem do array = ordem manual dos cards (respeitada nas colunas). */
  acoes: Acao[]
  tarefas: Tarefa[]
}

// --- Metadados de apresentação (labels + cores) ---

export interface TrilhaMeta {
  id: Trilha
  label: string
  /** Cor sólida (hex) para badge, coluna e barra de esforço. */
  cor: string
}

/** Cores escolhidas para as quatro trilhas serem visualmente distintas. */
export const TRILHAS: Record<Trilha, TrilhaMeta> = {
  estrategico: { id: 'estrategico', label: 'Estratégico', cor: '#6366f1' }, // indigo
  area: { id: 'area', label: 'Objetivo de área', cor: '#10b981' }, // emerald
  avulso: { id: 'avulso', label: 'Avulso', cor: '#f59e0b' }, // amber
  rotina: { id: 'rotina', label: 'Rotina', cor: '#94a3b8' }, // slate
}

/** Ordem canônica das trilhas (mais estratégico → menos). */
export const TRILHA_ORDER: Trilha[] = ['estrategico', 'area', 'avulso', 'rotina']

export interface StatusMeta {
  id: AcaoStatus
  label: string
  cor: string
}

export const STATUS: Record<AcaoStatus, StatusMeta> = {
  a_fazer: { id: 'a_fazer', label: 'Pendente', cor: '#94a3b8' },
  fazendo: { id: 'fazendo', label: 'Em andamento', cor: '#3b82f6' },
  stand_by: { id: 'stand_by', label: 'Stand-by', cor: '#f59e0b' },
  concluido: { id: 'concluido', label: 'Concluído', cor: '#22c55e' },
}

export const STATUS_ORDER: AcaoStatus[] = ['a_fazer', 'fazendo', 'stand_by', 'concluido']

export const TIPO_TAREFA: Record<TarefaTipo, { id: TarefaTipo; label: string }> = {
  execucao: { id: 'execucao', label: 'Execução' },
  descoberta: { id: 'descoberta', label: 'Descoberta' },
}
