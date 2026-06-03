import { History } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuditLog } from '../hooks/useAuditLog'
import { fmtDate } from '@/lib/format'

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  cidade: 'Cidade',
  uf: 'UF',
  classificacao: 'Classificação',
  origem_lead: 'Origem do lead',
  sociedade: 'Sociedade',
  estrutura: 'Estrutura',
  gmv_anual: 'GMV anual',
  gmv_estimado: 'GMV estimado',
  probabilidade: 'Probabilidade',
  bi_organizador: 'BI organizador',
  funil_stage_id: 'Estágio',
  stage_id: 'Estágio',
  titulo: 'Título',
  cargo: 'Cargo',
  email: 'Email',
  telefone: 'Telefone',
  data_prevista_fechamento: 'Data prevista',
  owner_id: 'Responsável',
}

function dt(s: string) {
  const d = new Date(s)
  return `${fmtDate(d)} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function AuditLog({
  entityType,
  entityId,
}: {
  entityType: string
  entityId: string | undefined
}) {
  const { data, isLoading } = useAuditLog(entityType, entityId)

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem histórico ainda.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {data.map((e) => {
        const field = e.field ? FIELD_LABELS[e.field] ?? e.field : null
        let texto: React.ReactNode
        if (e.action === 'create') texto = 'Criado'
        else if (e.action === 'delete') texto = 'Removido'
        else if (e.action === 'stage_change')
          texto = (
            <>
              Estágio: <span className="text-muted-foreground">{e.oldValue ?? '—'}</span> →{' '}
              <span className="font-medium">{e.newValue ?? '—'}</span>
            </>
          )
        else
          texto = (
            <>
              <span className="font-medium">{field}</span>:{' '}
              <span className="text-muted-foreground">{e.oldValue || '—'}</span> →{' '}
              <span className="font-medium">{e.newValue || '—'}</span>
            </>
          )
        return (
          <li key={e.id} className="flex gap-3 text-sm">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History className="size-3.5" />
            </div>
            <div className="flex-1">
              <div>{texto}</div>
              <div className="text-xs text-muted-foreground">
                {dt(e.at)}
                {e.user ? ` · ${e.user}` : ''}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
