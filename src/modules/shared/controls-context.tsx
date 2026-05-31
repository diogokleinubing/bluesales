import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_CONTROLS,
  loadControls,
  saveControls,
  type GlobalControls,
} from '@/modules/bi/lib/controls'

interface ControlsContextValue extends GlobalControls {
  setControls: (patch: Partial<GlobalControls>) => void
  reset: () => void
}

const ControlsContext = createContext<ControlsContextValue | null>(null)

export function ControlsProvider({ children }: { children: React.ReactNode }) {
  const [controls, setState] = useState<GlobalControls>(() => loadControls())

  useEffect(() => {
    saveControls(controls)
  }, [controls])

  const setControls = useCallback((patch: Partial<GlobalControls>) => {
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  const reset = useCallback(() => setState(DEFAULT_CONTROLS), [])

  const value = useMemo<ControlsContextValue>(
    () => ({ ...controls, setControls, reset }),
    [controls, setControls, reset],
  )

  return (
    <ControlsContext.Provider value={value}>
      {children}
    </ControlsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useControls(): ControlsContextValue {
  const ctx = useContext(ControlsContext)
  if (!ctx)
    throw new Error('useControls deve ser usado dentro de <ControlsProvider>')
  return ctx
}
