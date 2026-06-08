import { useState } from 'react'

export type ListKanban = 'list' | 'kanban'

/** Preferência de visualização (lista/kanban) persistida em localStorage. */
export function useViewPref(key: string, def: ListKanban = 'list') {
  const [view, setViewState] = useState<ListKanban>(() => {
    try {
      const v = localStorage.getItem(key)
      return v === 'kanban' || v === 'list' ? v : def
    } catch {
      return def
    }
  })
  function setView(v: ListKanban) {
    setViewState(v)
    try { localStorage.setItem(key, v) } catch { /* ignore */ }
  }
  return [view, setView] as const
}

/** Estado genérico persistido em localStorage (JSON). Para lembrar filtros. */
export function usePersistedState<T>(key: string, def: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? (JSON.parse(raw) as T) : def
    } catch {
      return def
    }
  })
  function set(next: T) {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return [value, set] as const
}
