import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchLoginEvents } from './admin-api'

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

/** Resumo curto do user agent (navegador). */
function shortUa(ua: string | null): string {
  if (!ua) return '—'
  if (/edg/i.test(ua)) return 'Edge'
  if (/chrome/i.test(ua)) return 'Chrome'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return ua.slice(0, 40)
}

export function LoginLogPanel() {
  const query = useQuery({
    queryKey: ['admin', 'login-events'],
    queryFn: () => fetchLoginEvents(200),
  })
  const events = query.data ?? []

  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Navegador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Nenhum acesso registrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums">
                      {fmtDateTime(e.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {e.email ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortUa(e.user_agent)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
