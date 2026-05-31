import type { ColumnMap } from './types'
import type { SheetType } from './detect'

// Cache de mapeamentos por "fingerprint" das colunas (reuso entre importações).

const KEY = 'bt:import-mappings'

interface CacheShape {
  [fingerprint: string]: {
    events?: ColumnMap<string>
    sales?: ColumnMap<string>
    /** Tipo detectado/confirmado para este conjunto de colunas. */
    type?: SheetType
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

/** Tipo confirmado para um conjunto de colunas (reaproveita a detecção). */
export function loadType(fingerprint: string): SheetType | null {
  return read()[fingerprint]?.type ?? null
}

export function saveType(fingerprint: string, type: SheetType): void {
  try {
    const all = read()
    all[fingerprint] = { ...all[fingerprint], type }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignora
  }
}
