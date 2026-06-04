import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CheckSquare, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { KanbanBoard } from '../components/KanbanBoard'
import { useCrmOrgId, type FunnelSlug } from '../hooks/useFunnelStages'
import { STATUS_COMERCIAL } from '../hooks/useOrganizations'

export function PainelComercial() {
  const [slug, setSlug] = useState<FunnelSlug>('relacionamento')
  const [statuses, setStatuses] = useState<string[]>(['Eventual', 'Inativo'])

  function toggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <div className="flex flex-wrap items-center gap-2">
          {slug === 'relacionamento' && (
            <div className="flex items-center gap-1">
              {STATUS_COMERCIAL.map((s) => {
                const on = statuses.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary',
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          )}
          <Tabs value={slug} onValueChange={(v) => setSlug(v as FunnelSlug)}>
            <TabsList>
              <TabsTrigger value="relacionamento">Relacionamento</TabsTrigger>
              <TabsTrigger value="oportunidade">Oportunidades</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <KanbanBoard slug={slug} statusFilter={slug === 'relacionamento' ? statuses : null} />

      <Resumo />
    </div>
  )
}

function Resumo() {
  const orgId = useCrmOrgId()
  const navigate = useNavigate()
  const q = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['crm', 'painel-resumo', orgId],
    queryFn: async () => {
      const now = new Date()
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endToday = new Date(startToday)
      endToday.setDate(endToday.getDate() + 1)
      const in7 = new Date(startToday)
      in7.setDate(in7.getDate() + 7)
      const cut30 = new Date(now)
      cut30.setDate(cut30.getDate() - 30)

      const [actToday, tasks7, opps, acts] = await Promise.all([
        supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .gte('data_hora', startToday.toISOString())
          .lt('data_hora', endToday.toISOString()),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('concluida', false)
          .lte('data_vencimento', in7.toISOString().slice(0, 10)),
        supabase
          .from('opportunities')
          .select('id, titulo, created_at')
          .eq('org_id', orgId!),
        supabase
          .from('activities')
          .select('opportunity_id, data_hora')
          .eq('org_id', orgId!)
          .not('opportunity_id', 'is', null),
      ])
      const last = new Map<string, string>()
      for (const a of acts.data ?? []) {
        const k = a.opportunity_id as string
        const dd = a.data_hora as string
        if (!last.has(k) || dd > last.get(k)!) last.set(k, dd)
      }
      const stale = (opps.data ?? []).filter((o) => {
        const ref = last.get(o.id) ?? o.created_at
        return new Date(ref) < cut30
      })
      return {
        activitiesToday: actToday.count ?? 0,
        tasksDue7: tasks7.count ?? 0,
        staleCount: stale.length,
      }
    },
  })

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }
  const d = q.data
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ResumoCard
        icon={<CalendarClock className="size-5" />}
        label="Atividades hoje"
        value={d?.activitiesToday ?? 0}
      />
      <ResumoCard
        icon={<CheckSquare className="size-5" />}
        label="Tarefas vencendo (7 dias)"
        value={d?.tasksDue7 ?? 0}
        onClick={() => navigate('/comercial/tarefas')}
      />
      <ResumoCard
        icon={<AlertTriangle className="size-5" />}
        label="Oportunidades sem atividade +30d"
        value={d?.staleCount ?? 0}
        alert={(d?.staleCount ?? 0) > 0}
        onClick={() => navigate('/comercial/oportunidades')}
      />
    </div>
  )
}

function ResumoCard({
  icon,
  label,
  value,
  alert,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  alert?: boolean
  onClick?: () => void
}) {
  return (
    <Card
      className={onClick ? 'cursor-pointer transition-colors hover:border-primary' : ''}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            alert
              ? 'bg-destructive/15 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
