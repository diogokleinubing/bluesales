import type { ProjetosState } from '../types'

// Estado inicial vazio — o módulo começa do zero. Áreas, pessoas, objetivos,
// ações e tarefas são todos cadastrados pela própria UI.
export const SEED: ProjetosState = {
  areas: [],
  pessoas: [],
  objetivos: [],
  acoes: [],
  tarefas: [],
}
