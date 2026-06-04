import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
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
  useLocais, saveLocal, deleteLocal, fetchLocalPlatforms, replaceLocalPlatforms,
  LOCAL_TIPOS, RELACAO_PLATAFORMA,
  type LocalRow, type LocalTipo, type RelacaoPlataforma,
} from '../hooks/useCadastros'
import { usePlatforms } from '../hooks/useConfigCadastros'
import { ListView, ToolbarSearch } from '../components/ListView'
import { fmtInt } from '@/lib/format'

const NONE = '__none__'

type PlatRel = { platform_id: string; tipo_relacao: RelacaoPlataforma | null }

export function Locais() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useLocais()
  const platforms = usePlatforms()
  const platformById = useMemo(
    () => new Map((platforms.data ?? []).map((p) => [p.id, p.nome])),
    [platforms.data],
  )
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [tipo, setTipo] = useState<string>(NONE)
  const [plats, setPlats] = useState<PlatRel[]>([])
  const [newPlat, setNewPlat] = useState('')
  const [newRel, setNewRel] = useState<string>('Exclusividade')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((l) => !q || l.nome.toLowerCase().includes(q) || (l.cidade ?? '').toLowerCase().includes(q))
  }, [data, search])

  function openNew() {
    setEditId(null); setNome(''); setCidade(''); setUf(''); setCapacidade(''); setTipo(NONE)
    setPlats([]); setNewPlat(''); setNewRel('Exclusividade'); setOpen(true)
  }
  async function openEdit(l: LocalRow) {
    setEditId(l.id); setNome(l.nome); setCidade(l.cidade ?? ''); setUf(l.uf ?? '')
    setCapacidade(l.capacidade != null ? String(l.capacidade) : ''); setTipo(l.tipo ?? NONE)
    setNewPlat(''); setNewRel('Exclusividade'); setOpen(true)
    try { setPlats(await fetchLocalPlatforms(l.id)) } catch { setPlats([]) }
  }

  function addPlat() {
    if (!newPlat || plats.some((p) => p.platform_id === newPlat)) return
    setPlats((p) => [...p, { platform_id: newPlat, tipo_relacao: newRel as RelacaoPlataforma }])
    setNewPlat('')
  }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    try {
      const id = await saveLocal(orgId, {
        nome: nome.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        capacidade: capacidade ? Number(capacidade) : null,
        tipo: tipo === NONE ? null : (tipo as LocalTipo),
      }, editId ?? undefined)
      await replaceLocalPlatforms(orgId, id, plats)
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(l: LocalRow) {
    try { await deleteLocal(l.id); qc.invalidateQueries({ queryKey: ['crm', 'locais'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  const availPlatforms = (platforms.data ?? []).filter((p) => !plats.some((x) => x.platform_id === p.id))

  return (
    <>
      <ListView
        title="Locais"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={openNew}><Plus className="size-4" /> Novo local</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={<ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome ou cidade…" />}
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Cidade/UF</TableHead>
            <TableHead>Capacidade</TableHead><TableHead>Tipo</TableHead>
            <TableHead>Plataformas</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum local.</TableCell></TableRow>
            ) : rows.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onDoubleClick={() => openEdit(l)}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground">{[l.cidade, l.uf].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell>{l.capacidade != null ? fmtInt(l.capacidade) : '—'}</TableCell>
                <TableCell>{l.tipo ? <Badge variant="outline">{l.tipo}</Badge> : '—'}</TableCell>
                <TableCell>
                  {l.platforms.length ? (
                    <div className="flex flex-wrap gap-1">
                      {l.platforms.map((pl) => (
                        <Badge
                          key={pl.platform_id}
                          variant={pl.tipo_relacao === 'Exclusividade' ? 'default' : 'outline'}
                          title={pl.tipo_relacao ?? undefined}
                        >
                          {pl.nome}
                        </Badge>
                      ))}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
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
      </ListView>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar local' : 'Novo local'}</DialogTitle></DialogHeader>
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

            {/* Plataformas de ingressos */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label>Plataformas de ingressos</Label>
              {plats.length > 0 && (
                <ul className="space-y-1">
                  {plats.map((pl) => (
                    <li key={pl.platform_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{platformById.get(pl.platform_id) ?? '?'}</span>
                        {pl.tipo_relacao && <Badge variant="outline" className="text-xs">{pl.tipo_relacao}</Badge>}
                      </span>
                      <button onClick={() => setPlats((p) => p.filter((x) => x.platform_id !== pl.platform_id))} className="text-muted-foreground hover:text-destructive">
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
                <div className="min-w-40 flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Plataforma</Label>
                  <Select value={newPlat} onValueChange={setNewPlat}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {availPlatforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Relação</Label>
                  <Select value={newRel} onValueChange={setNewRel}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELACAO_PLATAFORMA.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addPlat} disabled={!newPlat}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </div>
              {(platforms.data ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">Cadastre plataformas em Configuração → Plataformas.</span>
              )}
            </div>
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
