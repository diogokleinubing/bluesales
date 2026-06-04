import type { ModuleId } from './nav'
import { getModule } from './nav'

// Persistência da última rota visitada (global e por módulo), para o seletor de
// módulo e o redirect da raiz lembrarem onde o usuário estava.

const LAST_GLOBAL = 'bt-last-route'
const lastByModuleKey = (m: ModuleId) => `bt-last-route:${m}`

function moduleOf(pathname: string): ModuleId {
  if (pathname.startsWith('/comercial')) return 'comercial'
  if (pathname.startsWith('/pesquisa')) return 'pesquisa'
  return 'bi'
}

export function rememberRoute(pathname: string, search = '') {
  const full = pathname + search
  try {
    localStorage.setItem(LAST_GLOBAL, full)
    localStorage.setItem(lastByModuleKey(moduleOf(pathname)), full)
  } catch {
    // ignore
  }
}

export function lastRoute(): string {
  try {
    const v = localStorage.getItem(LAST_GLOBAL)
    if (v && (v.startsWith('/bi/') || v.startsWith('/comercial/') || v.startsWith('/pesquisa/'))) return v
  } catch {
    // ignore
  }
  return getModule('comercial').home
}

/** Última rota visitada de um módulo, ou a home dele. */
export function lastRouteOfModule(m: ModuleId): string {
  try {
    const v = localStorage.getItem(lastByModuleKey(m))
    if (v && v.startsWith(`/${m}/`)) return v
  } catch {
    // ignore
  }
  return getModule(m).home
}

/** Rota da org no Comercial (ponte BI -> Comercial via organizador). */
export function contaComercialRoute(ref: string): string {
  return `/comercial/organizacoes?bi_organizador=${encodeURIComponent(ref)}`
}
