import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useCrmOrgId } from '../hooks/useFunnelStages'

export function PainelComercial() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Visão Geral</h1>
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
      const cut30 = new Date(now)
      cut30.setDate(cut30.getDate() - 30)

      const [actToday, opps, acts] = await Promise.all([
        supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .gte('data_hora', startToday.toISOString())
          .lt('data_hora', endToday.toISOString()),
        supabase
          .from('opportunities')
          .select('id, titulo, created_at')
          .eq('org_id', orgId!)
          .is('resultado', null),
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
        staleCount: stale.length,
      }
    },
  })

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }
  const d = q.data
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ResumoCard
        icon={<CalendarClock className="size-5" />}
        label="Atividades hoje"
        value={d?.activitiesToday ?? 0}
      />
      <ResumoCard
        icon={<AlertTriangle className="size-5" />}
        label="Oportunidades em aberto sem atividade +30d"
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
