import { Outlet } from 'react-router-dom'
import { ProjetosProvider } from './store'

/**
 * Layout do módulo: monta o ProjetosProvider uma única vez, para o estado
 * (mock em memória + busca global) persistir ao navegar entre as telas.
 */
export function ProjetosLayout() {
  return (
    <ProjetosProvider>
      <Outlet />
    </ProjetosProvider>
  )
}
