import type { ColumnMap } from './types'

// Cache de mapeamentos por "fingerprint" das colunas (reuso entre importações).

const KEY = 'bt:import-mappings'

interface CacheShape {
  [fingerprint: string]: {
    events?: ColumnMap<string>
    sales?: ColumnMap<string>
  }
}

function read(): CacheShape {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as CacheShape
  } catch {
    return {}
  }
}

export function loadMapping(
  fingerprint: string,
  kind: 'events' | 'sales',
): ColumnMap<string> | null {
  return read()[fingerprint]?.[kind] ?? null
}

export function saveMapping(
  fingerprint: string,
  kind: 'events' | 'sales',
  map: ColumnMap<string>,
): void {
  try {
    const all = read()
    all[fingerprint] = { ...all[fingerprint], [kind]: map }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignora
  }
}
