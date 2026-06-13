import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tags, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import {
  useObjectionsBase, saveObjection, deleteObjection,
  useObjectionCategorias, saveObjectionCategoria, deleteObjectionCategoria,
  type Objection,
} from '../../hooks/useConfigCadastros'

const NONE = '__none__'

export function ObjecoesConfig() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const editable = true
  const { data, isLoading } = useObjectionsBase()
  const cats = useObjectionCategorias()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Objection | null>(null)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<string>(NONE)
  const [descricao, setDescricao] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [novaCat, setNovaCat] = useState('')

  // Opções da categoria (inclui a atual do registro editado, mesmo que removida).
  const categoriaOpts = (() => {
    const nomes = (cats.data ?? []).map((c) => c.nome)
    if (categoria !== NONE && !nomes.includes(categoria)) return [categoria, ...nomes]
    return nomes
  })()

  function openNew() { setEdit(null); setTitulo(''); setCategoria(NONE); setDescricao(''); setOpen(true) }
  function openEdit(o: Objection) {
    setEdit(o); setTitulo(o.titulo); setCategoria(o.categoria ?? NONE); setDescricao(o.descricao ?? ''); setOpen(true)
  }

  async function salvar() {
    if (!orgId || !titulo.trim()) return
    try {
      await saveObjection(orgId, {
        titulo: titulo.trim(),
        categoria: categoria === NONE ? null : categoria,
        descricao: descricao.trim() || null,
      }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'objections-base'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  function refreshCats() { qc.invalidateQueries({ queryKey: ['crm', 'objection-categorias'] }) }
  async function addCat() {
    if (!orgId || !novaCat.trim()) return
    try { await saveObjectionCategoria(orgId, novaCat.trim()); setNovaCat(''); refreshCats() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function removeCat(id: string) {
    try { await deleteObjectionCategoria(id); refreshCats() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(o: Objection) {
    try { await deleteObjection(o.id); qc.invalidateQueries({ queryKey: ['crm', 'objections-base'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Objeções</h1>
          <p className="text-sm text-muted-foreground">Base de objeções por categoria.</p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCatOpen(true)}><Tags className="size-4" /> Categorias</Button>
            <Button onClick={openNew}><Plus className="size-4" /> Nova objeção</Button>
          </div>
        )}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Título</TableHead><TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>{editable && <TableHead className="w-20" />}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma objeção.</TableCell></TableRow>
            ) : (data ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.titulo}</TableCell>
                <TableCell>{o.categoria ? <Badge variant="secondary">{o.categoria}</Badge> : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{o.descricao ?? '—'}</TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(o)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                      <button onClick={() => remover(o)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
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
          <DialogHeader><DialogTitle>{edit ? 'Editar objeção' : 'Nova objeção'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título</Label>
              <Input value={titulo} autoFocus onChange={(e) => setTitulo(e.target.value)} /></div>
            <div className="space-y-1"><Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {categoriaOpts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!titulo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Categorias de objeção</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={novaCat} placeholder="Nova categoria…" onChange={(e) => setNovaCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCat()} />
              <Button onClick={addCat} disabled={!novaCat.trim()}><Plus className="size-4" /></Button>
            </div>
            {cats.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (cats.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>
            ) : (
              <ul className="space-y-1">
                {(cats.data ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                    <span>{c.nome}</span>
                    <button onClick={() => removeCat(c.id)} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
