import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Trash2, Users, Building2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useOrgOptions } from '../../hooks/useCrmLookups'
import { PersonAutocomplete } from '../../components/PersonAutocomplete'
import { EntityAutocomplete, type Lookup } from '../../components/EntityAutocomplete'
import {
  useEmailList, useListMembers, addMembers, removeMember, personIdsByOrgs,
} from '../../hooks/useEmailLists'

export function EmailListaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const listQ = useEmailList(id)
  const membersQ = useListMembers(id)
  const orgOptions = useOrgOptions()
  const [orgPick, setOrgPick] = useState<Lookup | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'email', 'members', id] })
    qc.invalidateQueries({ queryKey: ['crm', 'email', 'lists'] })
  }

  async function inscreverPessoa(p: { id: string; nome: string }) {
    if (!orgId || !id) return
    try {
      await addMembers(orgId, id, [p.id])
      refresh()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function inscreverOrg(org: Lookup | null) {
    setOrgPick(null)
    if (!org || !orgId || !id) return
    setBusy(true)
    try {
      const ids = await personIdsByOrgs([org.id])
      const n = await addMembers(orgId, id, ids)
      toast.success(n > 0 ? `${n} contato(s) de "${org.nome}" inscritos` : 'Nenhum contato vinculado a essa organização')
      refresh()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setBusy(false) }
  }

  async function remover(memberId: string) {
    try { await removeMember(memberId); refresh() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  const membros = membersQ.data ?? []

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-sm">
        <button onClick={() => navigate('/comercial/email/listas')} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Listas
        </button>
      </div>
      <div className="border-b border-border px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{listQ.data?.nome ?? 'Lista'}</h1>
        {listQ.data?.descricao && <p className="text-sm text-muted-foreground">{listQ.data.descricao}</p>}
      </div>

      {/* Inscrever */}
      <div className="space-y-2 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Inscrever um contato</div>
            <PersonAutocomplete className="w-64" placeholder="Buscar contato…" onPick={inscreverPessoa} allowCreate={false} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Inscrever todos os contatos de uma organização</div>
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <EntityAutocomplete className="w-64" value={orgPick} onPick={inscreverOrg} options={orgOptions.data ?? []} placeholder="Buscar organização…" />
              {busy && <span className="text-xs text-muted-foreground">Inscrevendo…</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Membros */}
      <div className="min-w-0 flex-1 overflow-x-auto [&_tbody_td]:px-4 [&_tbody_td]:py-1 [&_thead_th]:h-11 [&_thead_th]:border-b [&_thead_th]:border-border [&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:text-xs [&_thead_th]:font-semibold">
        <div className="flex items-center gap-2 px-5 py-2 text-sm text-muted-foreground">
          <Users className="size-4" /> {membros.length} inscrito(s)
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersQ.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : membros.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum contato inscrito.</TableCell></TableRow>
            ) : membros.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.nome}</TableCell>
                <TableCell className={m.email ? '' : 'text-muted-foreground'}>{m.email || 'sem email'}</TableCell>
                <TableCell className="text-muted-foreground">{m.telefone || '—'}</TableCell>
                <TableCell>{m.status === 'descadastrado' ? <span className="text-destructive">Descadastrado</span> : 'Inscrito'}</TableCell>
                <TableCell>
                  <button onClick={() => remover(m.id)} className="text-muted-foreground hover:text-destructive" title="Remover da lista">
                    <Trash2 className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
