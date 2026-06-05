import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { restoreDeleted, ENTITY_TABLE } from '@/lib/softDelete'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '../components/ListView'
import {
  useAuditGlobal, ENTITY_LABEL, ACTION_LABEL, FIELD_LABEL,
  type AuditEntry,
} from '../hooks/useAuditGlobal'

const ALL = 'all'

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function acaoBadge(action: string) {
  const label = ACTION_LABEL[action] ?? action
  if (action === 'create') return <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{label}</Badge>
  if (action === 'delete') return <Badge variant="destructive">{label}</Badge>
  if (action === 'restore') return <Badge className="border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{label}</Badge>
  if (action === 'stage_change') return <Badge className="border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

function alteracao(e: AuditEntry): string {
  if (e.action === 'create' || e.action === 'delete' || e.action === 'restore') return '—'
  const campo = e.field_name ? (FIELD_LABEL[e.field_name] ?? e.field_name) : null
  const de = e.old_value?.trim() || '—'
  const para = e.new_value?.trim() || '—'
  if (!campo) return `${de} → ${para}`
  return `${campo}: ${de} → ${para}`
}

export function Logs() {
  const qc = useQueryClient()
  const [entityType, setEntityType] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const { data, isLoading } = useAuditGlobal({ entityType, action })

  // Pode desfazer se foi remoção (soft delete) e o registro ainda existe.
  const podeDesfazer = (e: AuditEntry) =>
    e.action === 'delete' && !!ENTITY_TABLE[e.entity_type] && e.entityNome !== '(removido)'

  async function desfazer(e: AuditEntry) {
    setBusy(e.id)
    try {
      await restoreDeleted(ENTITY_TABLE[e.entity_type], e.entity_id)
      await qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success('Remoção desfeita', { description: e.entityNome })
    } catch (err) {
      toast.error('Erro ao desfazer', { description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((e) =>
      e.entityNome.toLowerCase().includes(q) ||
      e.actorNome.toLowerCase().includes(q) ||
      (e.field_name ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  return (
    <ListView
      title="Logs"
      count={data ? String(data.length) : undefined}
      footer={data ? `${rows.length} de ${data.length} (até 500 mais recentes)` : undefined}
      toolbar={
        <>
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por entidade, usuário ou campo…" />
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Entidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as entidades</SelectItem>
              {Object.entries(ENTITY_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as ações</SelectItem>
              {Object.entries(ACTION_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      }
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead className="whitespace-nowrap">Quando</TableHead>
          <TableHead>Usuário</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Entidade</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>Alteração</TableHead>
          <TableHead className="w-24 text-right"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">Nenhuma alteração registrada.</TableCell></TableRow>
          ) : rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{quando(e.created_at)}</TableCell>
              <TableCell>{e.actorNome}</TableCell>
              <TableCell><Badge variant="outline">{ENTITY_LABEL[e.entity_type] ?? e.entity_type}</Badge></TableCell>
              <TableCell className="max-w-[220px] truncate font-medium" title={e.entityNome}>{e.entityNome}</TableCell>
              <TableCell>{acaoBadge(e.action)}</TableCell>
              <TableCell className="max-w-[360px] truncate text-muted-foreground" title={alteracao(e)}>{alteracao(e)}</TableCell>
              <TableCell className="text-right">
                {podeDesfazer(e) && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" disabled={busy === e.id} onClick={() => desfazer(e)} title="Restaurar item removido">
                    <Undo2 className="size-3.5" /> Desfazer
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListView>
  )
}
