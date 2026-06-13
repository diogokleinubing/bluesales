import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenItem } from '@/lib/useOpenItem'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useContacts, createContact } from '../hooks/useContacts'
import { useCrmOrgId, useFunnel } from '../hooks/useFunnelStages'
import { LinkedinIcon, InstagramIcon } from '../components/SocialIcons'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '../components/ListView'

const ALL = '__all__'
const NONE = '__none__'

function linkedinUrl(v: string) {
  return v.startsWith('http') ? v : `https://www.linkedin.com/in/${v.replace(/^@/, '')}`
}
function instagramUrl(v: string) {
  return v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`
}

export function Contatos() {
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useContacts()
  const { stages } = useFunnel('relacionamento')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState(ALL)
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((p) => {
      if (q && !p.nome.toLowerCase().includes(q)) return false
      if (stageFilter === ALL) return true
      if (stageFilter === NONE) return !p.funil_stage_id
      return p.funil_stage_id === stageFilter
    })
  }, [data, search, stageFilter])

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
    <>
      <ListView
        title="Contatos"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Novo contato</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          <>
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-52`} size="sm"><SelectValue placeholder="Estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os estágios</SelectItem>
                <SelectItem value={NONE}>Sem estágio</SelectItem>
                {stages.filter((s) => s.ativo).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Organizações / cargo</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="text-center">LinkedIn</TableHead>
              <TableHead className="text-center">Instagram</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum contato.</TableCell></TableRow>
            ) : rows.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={(e) => openItem(e, `/comercial/contatos/${p.id}`)}>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={p.nome}>{p.nome}</div></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.orgs.length ? p.orgs.map((o, i) => (
                      <Badge key={i} variant="outline">{o.nome}{o.papel ? ` · ${o.papel}` : ''}</Badge>
                    )) : '—'}
                  </div>
                </TableCell>
                <TableCell>
                  {p.stageNome ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: p.stageCor ?? 'var(--muted-foreground)' }} />
                      {p.stageNome}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.email ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{p.telefone ?? '—'}</TableCell>
                <TableCell className="text-center">
                  {p.linkedin ? (
                    <a href={linkedinUrl(p.linkedin)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex text-muted-foreground hover:text-primary" title="Abrir LinkedIn">
                      <LinkedinIcon className="size-4" />
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {p.instagram ? (
                    <a href={instagramUrl(p.instagram)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex text-muted-foreground hover:text-primary" title="Abrir Instagram">
                      <InstagramIcon className="size-4" />
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>

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
    </>
  )
}
