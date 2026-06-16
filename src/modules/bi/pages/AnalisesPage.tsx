import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SegmentosPage } from './SegmentosPage'
import { GenerosPage } from './GenerosPage'
import { OrganizadoresPage } from './OrganizadoresPage'
import { LocaisPage } from './LocaisPage'
import { RecorrentesPage } from './RecorrentesPage'

const VIEWS = [
  { value: 'segmentos', label: 'Segmentos', Component: SegmentosPage },
  { value: 'generos', label: 'Gêneros', Component: GenerosPage },
  { value: 'organizadores', label: 'Organizadores', Component: OrganizadoresPage },
  { value: 'locais', label: 'Locais', Component: LocaisPage },
  { value: 'recorrentes', label: 'Eventos recorrentes', Component: RecorrentesPage },
] as const

type ViewId = (typeof VIEWS)[number]['value']

/**
 * Página unificada de Análises com abas internas (Segmentos, Gêneros,
 * Organizadores, Locais, Eventos). A aba ativa vem do path (/bi/analises/:view)
 * para não conflitar com os filtros da aba Eventos (querystring).
 */
export function AnalisesPage() {
  const { view } = useParams<{ view: string }>()
  const navigate = useNavigate()

  const current = VIEWS.find((v) => v.value === view)
  if (!current) return <Navigate to="/bi/analises/segmentos" replace />

  const Active = current.Component

  return (
    <div className="space-y-4">
      <Tabs
        value={current.value}
        onValueChange={(v) => navigate(`/bi/analises/${v as ViewId}`)}
      >
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Active />
    </div>
  )
}
