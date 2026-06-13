import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Images, Library } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { usePresentations, createPresentation } from '../../hooks/useApresentacoes'
import { fmtDate } from '@/lib/format'

const STATUS_LABEL: Record<string, string> = { rascunho: 'Rascunho', montada: 'Montada', compartilhada: 'Compartilhada' }

export function Apresentacoes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const { data, isLoading } = usePresentations()
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [cliente, setCliente] = useState('')

  async function criar() {
    if (!orgId || !titulo.trim()) return
    try {
      const id = await createPresentation(orgId, { titulo: titulo.trim(), cliente_nome: cliente.trim() || null }, user?.id ?? null)
      qc.invalidateQueries({ queryKey: ['crm', 'apresentacoes'] })
      setOpen(false); setTitulo(''); setCliente('')
      navigate(`/comercial/apresentacoes/${id}`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Apresentações</h1>
          <p className="text-sm text-muted-foreground">Apresentações comerciais montadas a partir da biblioteca.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/comercial/apresentacoes/biblioteca')}><Library className="size-4" /> Biblioteca</Button>
          <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova apresentação</Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma apresentação ainda.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((p) => (
            <Card key={p.id} className="cursor-pointer transition-colors hover:border-primary" onClick={() => navigate(`/comercial/apresentacoes/${p.id}`)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{p.titulo}</span>
                  <Badge variant="secondary">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{p.cliente_nome ?? p.organization_nome ?? '—'}</p>
                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Images className="size-3.5" /> {p.slides} slide(s)</span>
                  <span>· {fmtDate(new Date(p.updated_at))}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova apresentação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título</Label><Input value={titulo} autoFocus onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Proposta — Teatro X" /></div>
            <div className="space-y-1"><Label>Cliente</Label><Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome da empresa/cliente" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={!titulo.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
