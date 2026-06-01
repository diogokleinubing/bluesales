import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { fetchProfiles, setAdmin } from './admin-api'
import { fmtDate } from '@/lib/format'

export function UsersPanel() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: fetchProfiles,
  })

  async function toggleAdmin(id: string, value: boolean) {
    try {
      await setAdmin(id, value)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      toast.success(value ? 'Usuário promovido a admin' : 'Admin removido')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  const users = query.data ?? []

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        A criação e remoção de usuários é feita no painel do Supabase
        (Authentication → Users). Aqui você gerencia o papel de cada usuário.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Nenhum usuário.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === user?.id
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email ?? '—'}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2">
                            você
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={u.is_admin}
                          disabled={isSelf}
                          onCheckedChange={(v) => toggleAdmin(u.id, v)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
