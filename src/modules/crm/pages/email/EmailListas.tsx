import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Mail, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ListView } from '../../components/ListView'
import { DeleteEntityButton } from '../../components/DeleteEntityButton'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useProfile } from '../../hooks/useProfile'
import { useEmailLists, createEmailList, deleteEmailList } from '../../hooks/useEmailLists'

export function EmailListas() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const { data, isLoading } = useEmailLists()
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'email', 'lists'] })

  async function criar() {
    if (!orgId || !nome.trim()) return
    setSaving(true)
    try {
      await createEmailList(orgId, nome, descricao || null, profile?.id)
      setOpen(false); setNome(''); setDescricao(''); refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <ListView
      title="Listas de email"
      count={data ? `${data.length} listas` : undefined}
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Nova lista</Button>}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lista</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Inscritos</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : (data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma lista ainda.</TableCell></TableRow>
          ) : (data ?? []).map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                <Link to={`/comercial/email/listas/${l.id}`} className="inline-flex items-center gap-2 hover:underline">
                  <Mail className="size-4 text-muted-foreground" /> {l.nome}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{l.descricao || '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="inline-flex items-center gap-1"><Users className="size-3.5 text-muted-foreground" /> {l.inscritos}</span>
              </TableCell>
              <TableCell>
                <DeleteEntityButton
                  title="Remover lista?"
                  description={`"${l.nome}" será removida (os contatos não são afetados).`}
                  onDelete={() => deleteEmailList(l.id)}
                  onDeleted={refresh}
                  variant="menu"
                  label="Remover"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova lista</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da lista" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            <Input placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={criar} disabled={!nome.trim() || saving}>{saving ? 'Criando…' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListView>
  )
}
