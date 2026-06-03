import { History } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuditLog, type HistoryChange } from '../hooks/useAuditLog'
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
  linkedin: 'LinkedIn',
  observacoes: 'Observações',
  data_prevista_fechamento: 'Data prevista',
  owner_id: 'Responsável',
}

function dt(s: string) {
  const d = new Date(s)
  return `${fmtDate(d)} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function ChangeLine({ c }: { c: HistoryChange }) {
  const field = c.field ? FIELD_LABELS[c.field] ?? c.field : null
  return (
    <div>
      {field && <span className="font-medium">{field}: </span>}
      <span className="text-muted-foreground">{c.oldValue || '—'}</span>
      {' → '}
      <span className="font-medium">{c.newValue || '—'}</span>
    </div>
  )
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
        let body: React.ReactNode
        if (e.action === 'create') body = <span>Criado</span>
        else if (e.action === 'delete') body = <span>Removido</span>
        else if (e.action === 'stage_change')
          body = (
            <span>
              Estágio:{' '}
              <span className="text-muted-foreground">{e.changes[0]?.oldValue ?? '—'}</span> →{' '}
              <span className="font-medium">{e.changes[0]?.newValue ?? '—'}</span>
            </span>
          )
        else if (e.changes.length === 1) body = <ChangeLine c={e.changes[0]} />
        else
          body = (
            <div className="space-y-0.5">
              <div className="text-muted-foreground">
                {e.changes.length} alterações
              </div>
              <div className="space-y-0.5 border-l-2 border-border pl-2">
                {e.changes.map((c, i) => (
                  <ChangeLine key={i} c={c} />
                ))}
              </div>
            </div>
          )

        return (
          <li key={e.id} className="flex gap-3 text-sm">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History className="size-3.5" />
            </div>
            <div className="flex-1">
              <div>{body}</div>
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
