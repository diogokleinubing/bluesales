import { useParams } from 'react-router-dom'
import { Stub } from '../components/Stub'

/** Destino da ponte BI -> Comercial (organizador vira conta). Stub por ora. */
export function ContaDetailPage() {
  const { ref } = useParams<{ ref: string }>()
  return (
    <Stub
      title="Conta"
      description={`Detalhe da conta "${ref ?? '—'}". Esta tela do módulo Comercial está em construção.`}
    />
  )
}
