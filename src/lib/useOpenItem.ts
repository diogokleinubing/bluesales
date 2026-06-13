import { useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Abre um item: clique normal navega na mesma aba; Ctrl/Cmd (ou clique do meio)
 * abre em nova aba — como um link nativo.
 */
export function useOpenItem() {
  const navigate = useNavigate()
  return useCallback((e: ReactMouseEvent, href: string) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    } else {
      navigate(href)
    }
  }, [navigate])
}
