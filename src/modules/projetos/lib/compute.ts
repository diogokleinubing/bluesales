import type {
  Acao,
  Objetivo,
  ProjetosState,
  Tarefa,
  Trilha,
} from '../types'
import { TRILHA_ORDER } from '../types'

/** Deriva a trilha de uma ação a partir do vínculo com objetivo. */
export function trilhaDaAcao(acao: Acao, objetivos: Objetivo[]): Trilha {
  if (acao.objetivoId) {
    const o = objetivos.find((x) => x.id === acao.objetivoId)
    return o?.tipo === 'area' ? 'area' : 'estrategico'
  }
  return acao.semVinculo === 'rotina' ? 'rotina' : 'avulso'
}

/** Contagem de tarefas feitas / total de uma ação. */
export function contarTarefas(acaoId: string, tarefas: Tarefa[]): { feitas: number; total: number } {
  let feitas = 0
  let total = 0
  for (const t of tarefas) {
    if (t.acaoId !== acaoId) continue
    total++
    if (t.concluida) feitas++
  }
  return { feitas, total }
}

export interface MixSlice {
  trilha: Trilha
  valor: number
  pct: number
}

/**
 * Divisão do trabalho entre as quatro trilhas, por contagem de ações. Recebe já
 * as ações filtradas, para refletir os filtros ativos.
 */
export function calcularMix(
  acoes: Acao[],
  objetivos: Objetivo[],
): { slices: MixSlice[]; total: number } {
  const soma: Record<Trilha, number> = { estrategico: 0, area: 0, avulso: 0, rotina: 0 }
  for (const a of acoes) {
    soma[trilhaDaAcao(a, objetivos)] += 1
  }
  const total = TRILHA_ORDER.reduce((s, t) => s + soma[t], 0)
  const slices = TRILHA_ORDER.map((trilha) => ({
    trilha,
    valor: soma[trilha],
    pct: total > 0 ? (soma[trilha] / total) * 100 : 0,
  }))
  return { slices, total }
}

export interface AcaoFiltro {
  busca?: string
  areaIds?: string[] | null
  status?: string[] | null
  responsavelIds?: string[] | null
}

/** Aplica busca + filtros de área/status/responsável às ações (mantém a ordem original). */
export function filtrarAcoes(
  acoes: Acao[],
  { busca, areaIds, status, responsavelIds }: AcaoFiltro,
  ctx: { tarefas: Tarefa[]; pessoas: ProjetosState['pessoas'] },
): Acao[] {
  const q = (busca ?? '').trim().toLowerCase()
  return acoes.filter((a) => {
    if (areaIds && areaIds.length > 0 && (a.areaId == null || !areaIds.includes(a.areaId))) return false
    if (status && status.length > 0 && !status.includes(a.status)) return false
    if (responsavelIds && responsavelIds.length > 0 && (a.responsavelId == null || !responsavelIds.includes(a.responsavelId))) return false
    if (q) {
      const nomeResp = pessoaNome(a.responsavelId, ctx.pessoas)
      const emTarefa = ctx.tarefas.some(
        (t) => t.acaoId === a.id && t.titulo.toLowerCase().includes(q),
      )
      const hit =
        a.titulo.toLowerCase().includes(q) ||
        a.detalhes.toLowerCase().includes(q) ||
        nomeResp.toLowerCase().includes(q) ||
        emTarefa
      if (!hit) return false
    }
    return true
  })
}

export function pessoaNome(id: string | null, pessoas: ProjetosState['pessoas']): string {
  if (!id) return ''
  return pessoas.find((p) => p.id === id)?.nome ?? ''
}

/** Iniciais para avatar (ex.: "Ana Paula" → "AP"). */
export function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
