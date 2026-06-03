import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  useLocais, saveLocal, deleteLocal, LOCAL_TIPOS, type Local, type LocalTipo,
} from '../hooks/useCadastros'
import { fmtInt } from '@/lib/format'

const NONE = '__none__'

export function Locais() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useLocais()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Local | null>(null)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [tipo, setTipo] = useState<string>(NONE)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((l) => !q || l.nome.toLowerCase().includes(q) || (l.cidade ?? '').toLowerCase().includes(q))
  }, [data, search])

  function openNew() {
    setEdit(null); setNome(''); setCidade(''); setUf(''); setCapacidade(''); setTipo(NONE); setOpen(true)
  }
  function openEdit(l: Local) {
    setEdit(l); setNome(l.nome); setCidade(l.cidade ?? ''); setUf(l.uf ?? '')
    setCapacidade(l.capacidade != null ? String(l.capacidade) : ''); setTipo(l.tipo ?? NONE); setOpen(true)
  }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    try {
      await saveLocal(orgId, {
        nome: nome.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        capacidade: capacidade ? Number(capacidade) : null,
        tipo: tipo === NONE ? null : (tipo as LocalTipo),
      }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(l: Local) {
    try { await deleteLocal(l.id); qc.invalidateQueries({ queryKey: ['crm', 'locais'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locais</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} locais.</p>
        </div>
        <Button onClick={openNew}><Plus className="size-4" /> Novo local</Button>
      </div>
      <Card><CardContent className="p-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou cidade…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Cidade/UF</TableHead>
            <TableHead>Capacidade</TableHead><TableHead>Tipo</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum local.</TableCell></TableRow>
            ) : rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground">{[l.cidade, l.uf].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell>{l.capacidade != null ? fmtInt(l.capacidade) : '—'}</TableCell>
                <TableCell>{l.tipo ? <Badge variant="outline">{l.tipo}</Badge> : '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(l)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                    <button onClick={() => remover(l)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? 'Editar local' : 'Novo local'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label>
              <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <div className="space-y-1"><Label>Cidade</Label>
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
              <div className="space-y-1"><Label>UF</Label>
                <Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Capacidade</Label>
                <Input type="number" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} /></div>
              <div className="space-y-1"><Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {LOCAL_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
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
