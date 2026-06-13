import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import {
  usePlatforms, savePlatform, deletePlatform, type Platform,
} from '../../hooks/useConfigCadastros'

export function PlataformasConfig() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const editable = true
  const { data, isLoading } = usePlatforms()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Platform | null>(null)
  const [nome, setNome] = useState('')
  const [site, setSite] = useState('')
  const [obs, setObs] = useState('')

  function openNew() { setEdit(null); setNome(''); setSite(''); setObs(''); setOpen(true) }
  function openEdit(p: Platform) {
    setEdit(p); setNome(p.nome); setSite(p.site ?? ''); setObs(p.observacoes ?? ''); setOpen(true)
  }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    try {
      await savePlatform(orgId, { nome: nome.trim(), site: site.trim() || null, observacoes: obs.trim() || null }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'platforms'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(p: Platform) {
    try { await deletePlatform(p.id); qc.invalidateQueries({ queryKey: ['crm', 'platforms'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plataformas</h1>
          <p className="text-sm text-muted-foreground">Plataformas de ticketing (concorrência/uso).</p>
        </div>
        {editable && <Button onClick={openNew}><Plus className="size-4" /> Nova plataforma</Button>}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Site</TableHead>
            <TableHead>Observações</TableHead>{editable && <TableHead className="w-20" />}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma plataforma.</TableCell></TableRow>
            ) : (data ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>
                  {p.site ? (
                    <a href={p.site.startsWith('http') ? p.site : `https://${p.site}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {p.site} <ExternalLink className="size-3" />
                    </a>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.observacoes ?? '—'}</TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                      <button onClick={() => remover(p)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? 'Editar plataforma' : 'Nova plataforma'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label>
              <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1"><Label>Site</Label>
              <Input value={site} placeholder="https://…" onChange={(e) => setSite(e.target.value)} /></div>
            <div className="space-y-1"><Label>Observações</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
