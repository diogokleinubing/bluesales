import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useDefaultOrg } from '@/lib/org'
import { fmtInt } from '@/lib/format'

function useBaseStatus(orgId: string | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ['base-status', orgId],
    queryFn: async () => {
      const [sales, events, batches] = await Promise.all([
        supabase
          .from('sales')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId!),
        supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId!),
        supabase
          .from('import_batches')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId!),
      ])
      return {
        sales: sales.count ?? 0,
        events: events.count ?? 0,
        batches: batches.count ?? 0,
      }
    },
  })
}

export function BasePage() {
  const org = useDefaultOrg()
  const status = useBaseStatus(org.data?.id)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Armazenamento/Base
        </h1>
        <p className="text-sm text-muted-foreground">
          Status e gestão da base de dados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {org.isError ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-[var(--success)]" />
            )}
            Conexão Supabase
          </CardTitle>
          <CardDescription>
            Organização ativa (multi-tenant futuro)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {org.isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : org.isError ? (
            <p className="text-sm text-destructive">
              Falha ao conectar: {(org.error as Error).message}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{org.data?.nome}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {org.data?.id}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Vendas"
          value={status.data?.sales}
          loading={status.isLoading}
        />
        <StatCard
          label="Eventos"
          value={status.data?.events}
          loading={status.isLoading}
        />
        <StatCard
          label="Importações"
          value={status.data?.batches}
          loading={status.isLoading}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        A base está vazia. Use a tela de <strong>Importação</strong> (Fase 2)
        para carregar as planilhas de vendas.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string
  value: number | undefined
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-semibold">{fmtInt(value)}</div>
        )}
      </CardContent>
    </Card>
  )
}
