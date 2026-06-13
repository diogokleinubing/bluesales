import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import {
  useLocalTipos, saveLocalTipo, deleteLocalTipo, type LocalTipoRow,
} from '../../hooks/useConfigCadastros'

export function TiposLocalConfig() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const editable = true
  const { data, isLoading } = useLocalTipos()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<LocalTipoRow | null>(null)
  const [nome, setNome] = useState('')

  function openNew() { setEdit(null); setNome(''); setOpen(true) }
  function openEdit(t: LocalTipoRow) { setEdit(t); setNome(t.nome); setOpen(true) }

  function refresh() { qc.invalidateQueries({ queryKey: ['crm', 'local-tipos'] }) }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    try {
      await saveLocalTipo(orgId, { nome: nome.trim() }, edit?.id)
      refresh()
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(t: LocalTipoRow) {
    try { await deleteLocalTipo(t.id); refresh() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tipos de local</h1>
          <p className="text-sm text-muted-foreground">Tipos usados no cadastro de locais (ex.: Teatro, Casa de show).</p>
        </div>
        {editable && <Button onClick={openNew}><Plus className="size-4" /> Novo tipo</Button>}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead>
            {editable && <TableHead className="w-20" />}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={2}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={2} className="py-10 text-center text-muted-foreground">Nenhum tipo cadastrado.</TableCell></TableRow>
            ) : (data ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.nome}</TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                      <button onClick={() => remover(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{edit ? 'Editar tipo' : 'Novo tipo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label>
              <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
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
