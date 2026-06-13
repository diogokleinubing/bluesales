import {
  Users,
  Phone,
  Mail,
  MessageCircle,
  StickyNote,
  CheckSquare,
  CircleDot,
  FileText,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useActivities, setActivityRealizada, type ActivityFilter, type ActivityTipo } from '../hooks/useActivities'
import { fmtDate } from '@/lib/format'

const ICON: Record<ActivityTipo, typeof Users> = {
  Reunião: Users,
  Ligação: Phone,
  Email: Mail,
  WhatsApp: MessageCircle,
  Nota: StickyNote,
  Tarefa: CheckSquare,
  Outro: CircleDot,
}

function dt(s: string) {
  const d = new Date(s)
  return `${fmtDate(d)} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Timeline de atividades. `filter` define o escopo (org, oportunidade, contato). */
export function ActivityTimeline({
  filter,
  showOrg = false,
}: {
  filter: ActivityFilter
  showOrg?: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useActivities(filter)

  async function toggleRealizada(id: string, v: boolean) {
    await setActivityRealizada(id, v)
    qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma atividade registrada.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {data.map((a) => {
        const Icon = a.tipo ? ICON[a.tipo] : CircleDot
        return (
          <li key={a.id} className="flex gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div className={cn('min-w-0 flex-1 rounded-md border p-3',
              a.realizada ? 'border-[var(--success)]/40 bg-[var(--success)]/5' : 'border-[var(--warning)]/50 bg-[var(--warning)]/5')}>
              <div className="flex items-start justify-between gap-2">
                <span className={cn('font-medium', a.realizada && 'line-through opacity-70')}>{a.titulo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.data_hora ? dt(a.data_hora) : 'Sem data'}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={a.realizada} onCheckedChange={(v) => toggleRealizada(a.id, v === true)} className="size-3.5" />
                  <span className={a.realizada ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{a.realizada ? 'Realizada' : 'Pendente'}</span>
                </label>
                {a.tipo && <Badge variant="secondary">{a.tipo}</Badge>}
                {showOrg && a.organization?.nome && (
                  <span>· {a.organization.nome}</span>
                )}
                {a.author && <span>· {a.author}</span>}
                {a.transcricao_file_url && (
                  <a
                    href={a.transcricao_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="size-3" /> transcrição
                  </a>
                )}
              </div>
              {a.resumo && <p className="mt-2 text-sm">{a.resumo}</p>}
              {a.participants && a.participants.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.participants.map((p) => (
                    <Badge key={p.person_id} variant="outline" className="text-xs">
                      {p.nome}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
