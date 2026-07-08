import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Acao, Area, Objetivo, Pessoa, ProjetosState, Tarefa } from './types'
import { SEED } from './data/seed'

// v2: dados zerados — o módulo começa vazio e é populado pela UI.
const STORAGE_KEY = 'bt-projetos-mock-v2'
// Pessoa marcada como "você" (mock do usuário logado) — preferência local.
const EU_KEY = 'bt-projetos-eu'

/** id curto e estável para novos itens do mock. */
function nid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}

function loadState(): ProjetosState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProjetosState
      // Sanidade mínima: precisa ter os arrays esperados.
      if (parsed && Array.isArray(parsed.acoes) && Array.isArray(parsed.tarefas)) {
        return parsed
      }
    }
  } catch {
    // ignora e cai no seed
  }
  return structuredClone(SEED)
}

/** Move `activeId` para junto de `overId` no array (reordenação manual). */
function arrayMoveBy<T extends { id: string }>(arr: T[], activeId: string, overId: string): T[] {
  const from = arr.findIndex((x) => x.id === activeId)
  const to = arr.findIndex((x) => x.id === overId)
  if (from < 0 || to < 0 || from === to) return arr
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export interface ProjetosStore extends ProjetosState {
  /** Busca global compartilhada entre todas as visões. */
  busca: string
  setBusca: (q: string) => void

  /** Pessoa marcada como "você" (mock do usuário logado); persistida. */
  currentPessoaId: string | null
  setCurrentPessoa: (id: string | null) => void

  // Ações
  addAcao: (patch?: Partial<Acao>) => string
  updateAcao: (id: string, patch: Partial<Acao>) => void
  removeAcao: (id: string) => void
  /** Reatribui o vínculo (drop numa coluna de objetivo/avulso/rotina). */
  setVinculo: (id: string, vinculo: Pick<Acao, 'objetivoId' | 'semVinculo'>) => void
  setAcaoArea: (id: string, areaId: string | null) => void
  reorderAcoes: (activeId: string, overId: string) => void

  // Tarefas
  addTarefa: (acaoId: string, patch?: Partial<Tarefa>) => string
  updateTarefa: (id: string, patch: Partial<Tarefa>) => void
  toggleTarefa: (id: string) => void
  removeTarefa: (id: string) => void
  reorderTarefas: (activeId: string, overId: string) => void

  // Objetivos
  addObjetivo: (patch: Omit<Objetivo, 'id'>) => string
  updateObjetivo: (id: string, patch: Partial<Objetivo>) => void
  removeObjetivo: (id: string) => void

  // Áreas
  addArea: (patch: Omit<Area, 'id'>) => string
  updateArea: (id: string, patch: Partial<Area>) => void
  removeArea: (id: string) => void

  // Pessoas
  addPessoa: (patch: Omit<Pessoa, 'id'>) => string
  updatePessoa: (id: string, patch: Partial<Pessoa>) => void
  removePessoa: (id: string) => void

  /** Apaga todos os dados do módulo (volta ao estado vazio). */
  resetSeed: () => void
}

const Ctx = createContext<ProjetosStore | null>(null)

export function ProjetosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjetosState>(() => loadState())
  const [busca, setBusca] = useState('')
  const [currentPessoaId, setCurrentPessoaState] = useState<string | null>(() => {
    try { return localStorage.getItem(EU_KEY) || null } catch { return null }
  })

  const setCurrentPessoa = useCallback((id: string | null) => {
    setCurrentPessoaState(id)
    try {
      if (id) localStorage.setItem(EU_KEY, id)
      else localStorage.removeItem(EU_KEY)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  const addAcao = useCallback((patch: Partial<Acao> = {}) => {
    const id = nid('ac')
    const nova: Acao = {
      id,
      titulo: patch.titulo ?? 'Nova ação',
      detalhes: patch.detalhes ?? '',
      areaId: patch.areaId ?? null,
      responsavelId: patch.responsavelId ?? null,
      status: patch.status ?? 'a_fazer',
      objetivoId: patch.objetivoId ?? null,
      semVinculo: patch.objetivoId ? null : patch.semVinculo ?? 'avulso',
    }
    setState((s) => ({ ...s, acoes: [nova, ...s.acoes] }))
    return id
  }, [])

  const updateAcao = useCallback((id: string, patch: Partial<Acao>) => {
    setState((s) => ({
      ...s,
      acoes: s.acoes.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))
  }, [])

  const removeAcao = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      acoes: s.acoes.filter((a) => a.id !== id),
      tarefas: s.tarefas.filter((t) => t.acaoId !== id),
    }))
  }, [])

  const setVinculo = useCallback(
    (id: string, vinculo: Pick<Acao, 'objetivoId' | 'semVinculo'>) => {
      setState((s) => ({
        ...s,
        acoes: s.acoes.map((a) => (a.id === id ? { ...a, ...vinculo } : a)),
      }))
    },
    [],
  )

  const setAcaoArea = useCallback((id: string, areaId: string | null) => {
    setState((s) => ({ ...s, acoes: s.acoes.map((a) => (a.id === id ? { ...a, areaId } : a)) }))
  }, [])

  const reorderAcoes = useCallback((activeId: string, overId: string) => {
    setState((s) => ({ ...s, acoes: arrayMoveBy(s.acoes, activeId, overId) }))
  }, [])

  const addTarefa = useCallback((acaoId: string, patch: Partial<Tarefa> = {}) => {
    const id = nid('t')
    const nova: Tarefa = {
      id,
      acaoId,
      titulo: patch.titulo ?? '',
      responsavelId: patch.responsavelId ?? null,
      tipo: patch.tipo ?? 'execucao',
      concluida: patch.concluida ?? false,
      prazo: patch.prazo ?? null,
    }
    setState((s) => ({ ...s, tarefas: [...s.tarefas, nova] }))
    return id
  }, [])

  const updateTarefa = useCallback((id: string, patch: Partial<Tarefa>) => {
    setState((s) => ({
      ...s,
      tarefas: s.tarefas.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }, [])

  const toggleTarefa = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tarefas: s.tarefas.map((t) => (t.id === id ? { ...t, concluida: !t.concluida } : t)),
    }))
  }, [])

  const removeTarefa = useCallback((id: string) => {
    setState((s) => ({ ...s, tarefas: s.tarefas.filter((t) => t.id !== id) }))
  }, [])

  const reorderTarefas = useCallback((activeId: string, overId: string) => {
    setState((s) => ({ ...s, tarefas: arrayMoveBy(s.tarefas, activeId, overId) }))
  }, [])

  const addObjetivo = useCallback((patch: Omit<Objetivo, 'id'>) => {
    const id = nid('ob')
    setState((s) => ({ ...s, objetivos: [...s.objetivos, { ...patch, id }] }))
    return id
  }, [])

  const updateObjetivo = useCallback((id: string, patch: Partial<Objetivo>) => {
    setState((s) => ({
      ...s,
      objetivos: s.objetivos.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }))
  }, [])

  const removeObjetivo = useCallback((id: string) => {
    // Ações ligadas a esse objetivo voltam a ser "avulso".
    setState((s) => ({
      ...s,
      objetivos: s.objetivos.filter((o) => o.id !== id),
      acoes: s.acoes.map((a) =>
        a.objetivoId === id ? { ...a, objetivoId: null, semVinculo: 'avulso' } : a,
      ),
    }))
  }, [])

  // --- Áreas ---
  const addArea = useCallback((patch: Omit<Area, 'id'>) => {
    const id = nid('ar')
    setState((s) => ({ ...s, areas: [...s.areas, { ...patch, id }] }))
    return id
  }, [])

  const updateArea = useCallback((id: string, patch: Partial<Area>) => {
    setState((s) => ({ ...s, areas: s.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  }, [])

  const removeArea = useCallback((id: string) => {
    // Solta as referências à área em ações, pessoas e objetivos de área.
    setState((s) => ({
      ...s,
      areas: s.areas.filter((a) => a.id !== id),
      acoes: s.acoes.map((a) => (a.areaId === id ? { ...a, areaId: null } : a)),
      pessoas: s.pessoas.map((p) => (p.areaId === id ? { ...p, areaId: null } : p)),
      objetivos: s.objetivos.map((o) => (o.areaId === id ? { ...o, areaId: null } : o)),
    }))
  }, [])

  // --- Pessoas ---
  const addPessoa = useCallback((patch: Omit<Pessoa, 'id'>) => {
    const id = nid('p')
    setState((s) => ({ ...s, pessoas: [...s.pessoas, { ...patch, id }] }))
    return id
  }, [])

  const updatePessoa = useCallback((id: string, patch: Partial<Pessoa>) => {
    setState((s) => ({ ...s, pessoas: s.pessoas.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }, [])

  const removePessoa = useCallback((id: string) => {
    // Solta as referências à pessoa como responsável em ações e tarefas.
    setState((s) => ({
      ...s,
      pessoas: s.pessoas.filter((p) => p.id !== id),
      acoes: s.acoes.map((a) => (a.responsavelId === id ? { ...a, responsavelId: null } : a)),
      tarefas: s.tarefas.map((t) => (t.responsavelId === id ? { ...t, responsavelId: null } : t)),
    }))
    // Se a pessoa removida era "você", limpa a marcação.
    setCurrentPessoaState((cur) => (cur === id ? null : cur))
    try { if (localStorage.getItem(EU_KEY) === id) localStorage.removeItem(EU_KEY) } catch { /* ignore */ }
  }, [])

  const resetSeed = useCallback(() => setState(structuredClone(SEED)), [])

  const value = useMemo<ProjetosStore>(
    () => ({
      ...state,
      busca,
      setBusca,
      currentPessoaId,
      setCurrentPessoa,
      addAcao,
      updateAcao,
      removeAcao,      setVinculo,
      setAcaoArea,
      reorderAcoes,
      addTarefa,
      updateTarefa,
      toggleTarefa,
      removeTarefa,
      reorderTarefas,
      addObjetivo,
      updateObjetivo,
      removeObjetivo,
      addArea,
      updateArea,
      removeArea,
      addPessoa,
      updatePessoa,
      removePessoa,
      resetSeed,
    }),
    [
      state,
      busca,
      currentPessoaId,
      setCurrentPessoa,
      addAcao,
      updateAcao,
      removeAcao,      setVinculo,
      setAcaoArea,
      reorderAcoes,
      addTarefa,
      updateTarefa,
      toggleTarefa,
      removeTarefa,
      reorderTarefas,
      addObjetivo,
      updateObjetivo,
      removeObjetivo,
      addArea,
      updateArea,
      removeArea,
      addPessoa,
      updatePessoa,
      removePessoa,
      resetSeed,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjetos(): ProjetosStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProjetos deve ser usado dentro de <ProjetosProvider>')
  return ctx
}
