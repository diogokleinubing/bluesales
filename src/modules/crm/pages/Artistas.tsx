import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
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
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useGeneroOptions, useOrgOptions } from '../hooks/useCrmLookups'
import { usePlatforms } from '../hooks/useConfigCadastros'
import {
  useArtists, saveArtist, deleteArtist, ESCALOES, type ArtistRow, type Escalao,
} from '../hooks/useCadastros'
import { ListView, ToolbarSearch } from '../components/ListView'

const NONE = '__none__'

export function Artistas() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useArtists()
  const generos = useGeneroOptions()
  const orgs = useOrgOptions()
  const platforms = usePlatforms()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<ArtistRow | null>(null)
  const [nome, setNome] = useState('')
  const [generoId, setGeneroId] = useState(NONE)
  const [escalao, setEscalao] = useState<string>(NONE)
  const [orgSel, setOrgSel] = useState(NONE)
  const [platSel, setPlatSel] = useState(NONE)
  const [obs, setObs] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((a) => !q || a.nome.toLowerCase().includes(q))
  }, [data, search])

  function openNew() {
    setEdit(null); setNome(''); setGeneroId(NONE); setEscalao(NONE); setOrgSel(NONE)
    setPlatSel(NONE); setObs(''); setOpen(true)
  }
  function openEdit(a: ArtistRow) {
    setEdit(a); setNome(a.nome); setGeneroId(a.genero_id ?? NONE)
    setEscalao(a.escalao ?? NONE); setOrgSel(a.organization_id ?? NONE)
    setPlatSel(a.platform_id ?? NONE); setObs(a.observacoes ?? ''); setOpen(true)
  }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    try {
      await saveArtist(orgId, {
        nome: nome.trim(),
        genero_id: generoId === NONE ? null : generoId,
        escalao: escalao === NONE ? null : (escalao as Escalao),
        organization_id: orgSel === NONE ? null : orgSel,
        platform_id: platSel === NONE ? null : platSel,
        observacoes: obs.trim() || null,
      }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'artists'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(a: ArtistRow) {
    try { await deleteArtist(a.id); qc.invalidateQueries({ queryKey: ['crm', 'artists'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <>
      <ListView
        title="Artistas"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={openNew}><Plus className="size-4" /> Novo artista</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={<ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />}
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Gênero</TableHead>
            <TableHead>Escalão</TableHead><TableHead>Organização</TableHead>
            <TableHead>Plataforma</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum artista.</TableCell></TableRow>
            ) : rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onDoubleClick={() => openEdit(a)}>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell>{a.genero_nome ?? '—'}</TableCell>
                <TableCell>{a.escalao ? <Badge variant="outline">{a.escalao}</Badge> : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{a.organization_nome ?? '—'}</TableCell>
                <TableCell>{a.platform_nome ? <Badge variant="outline">{a.platform_nome}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(a)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                    <button onClick={() => remover(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? 'Editar artista' : 'Novo artista'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label>
              <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Gênero</Label>
                <Select value={generoId} onValueChange={setGeneroId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(generos.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Escalão</Label>
                <Select value={escalao} onValueChange={setEscalao}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {ESCALOES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Organização</Label>
                <Select value={orgSel} onValueChange={setOrgSel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(orgs.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Plataforma</Label>
                <Select value={platSel} onValueChange={setPlatSel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(platforms.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1"><Label>Observações</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
