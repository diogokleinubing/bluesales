import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useContacts, createContact } from '../hooks/useContacts'
import { useCrmOrgId } from '../hooks/useFunnelStages'

export function Contatos() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useContacts()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((p) => !q || p.nome.toLowerCase().includes(q))
  }, [data, search])

  async function criar() {
    if (!orgId || !nome.trim()) return
    try {
      const id = await createContact(orgId, nome.trim())
      qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
      setOpen(false); setNome('')
      navigate(`/comercial/contatos/${id}`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} contatos.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Novo contato</Button>
      </div>
      <Card><CardContent className="p-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Cargo</TableHead>
            <TableHead>Organizações</TableHead><TableHead>Email</TableHead><TableHead>Telefone</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum contato — adicione o primeiro.</TableCell></TableRow>
            ) : rows.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/comercial/contatos/${p.id}`)}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{p.cargo ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.orgs.length ? p.orgs.map((o, i) => <Badge key={i} variant="outline">{o}</Badge>) : '—'}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.email ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{p.telefone ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
          <Input placeholder="Nome" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={!nome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
