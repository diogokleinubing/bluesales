import { useEffect, useState } from 'react'

/**
 * Retorna `value` com um pequeno atraso (debounce). Padrão do projeto para
 * buscas em tempo real no front: o input continua respondendo na hora, mas o
 * processamento (filtro/consulta) só roda quando o usuário para de digitar.
 *
 * Ex.: const debounced = useDebouncedValue(search, 300)
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
