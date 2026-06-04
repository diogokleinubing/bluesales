import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { StageSelector } from '../components/StageSelector'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { AuditLog } from '../components/AuditLog'
import { TextField, TextareaField, FormActions, useDraft, toText } from '../components/EditFields'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import { useContact, updateContact, deleteContact, type Person } from '../hooks/useContacts'
import { usePersonOptions } from '../hooks/useCrmLookups'
import { useCrmOrgId } from '../hooks/useFunnelStages'

export function ContatoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: p, isLoading } = useContact(id)
  const [histOpen, setHistOpen] = useState(false)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!p) return <p className="text-muted-foreground">Contato não encontrado.</p>

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      {/* Breadcrumb */}
      <div className="border-b border-border px-6 py-2">
        <button
          onClick={() => navigate('/comercial/contatos')}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Contatos
        </button>
      </div>

      {/* Título */}
      <div className="border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{p.nome}</h1>
      </div>

      {/* Corpo */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 px-6 py-4">
          <AtividadesPanel entityType="person" entityId={p.id} allowObjection={false} />
        </div>

        <aside className="space-y-5 border-border px-6 py-4 lg:border-l">
          <ContatoDados p={p} />

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Organizações</h3>
            <ContatoOrgs personId={p.id} />
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Conexões</h3>
            <ContatoConexoes personId={p.id} />
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Opções</h3>
            <div className="space-y-1">
              <button
                onClick={() => setHistOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <History className="size-4" /> Histórico
              </button>
              <DeleteEntityButton
                title="Excluir contato?"
                description={`Esta ação remove "${p.nome}" e seus vínculos com organizações e conexões. Não pode ser desfeita.`}
                onDelete={() => deleteContact(p.id)}
                onDeleted={() => navigate('/comercial/contatos')}
                variant="menu"
                label="Remover"
              />
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Histórico</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <AuditLog entityType="person" entityId={p.id} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ContatoOrgs({ personId }: { personId: string }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const [sel, setSel] = useState('')
  const [papel, setPapel] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editPapel, setEditPapel] = useState('')
  const orgs = useQuery({
    enabled: !!orgId,
    queryKey: ['crm', 'org-options-all', orgId],
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('id, nome').eq('org_id', orgId!).order('nome')
      return data ?? []
    },
  })
  const q = useQuery({
    queryKey: ['crm', 'contato-orgs', personId],
    queryFn: async () => {
      const { data } = await supabase
        .from('org_persons')
        .select('id, papel, ativo, organization_id, organizations(nome)')
        .eq('person_id', personId)
        .order('ativo', { ascending: false })
      return data ?? []
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'contato-orgs', personId] })
    qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
  }

  async function vincular() {
    if (!orgId || !sel) return
    const { error } = await supabase.from('org_persons').insert({
      org_id: orgId, organization_id: sel, person_id: personId,
      papel: papel.trim() || null, data_inicio: new Date().toISOString().slice(0, 10),
    })
    if (error) return toast.error('Erro', { description: error.message })
    setSel(''); setPapel(''); refresh()
  }

  async function salvarPapel(id: string) {
    const { error } = await supabase.from('org_persons').update({ papel: editPapel.trim() || null }).eq('id', id)
    if (error) return toast.error('Erro', { description: error.message })
    setEditId(null); refresh()
  }

  async function remover(id: string) {
    const { error } = await supabase.from('org_persons').delete().eq('id', id)
    if (error) return toast.error('Erro', { description: error.message })
    refresh()
  }

  if (q.isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <div className="space-y-3">
      {(q.data ?? []).map((r) => {
        const o = r.organizations as unknown as { nome: string } | null
        const editing = editId === r.id
        return (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <Link
                to={`/comercial/organizacoes/${r.organization_id}`}
                className="inline-flex items-center gap-2 font-medium hover:underline"
              >
                {o?.nome}
                {!r.ativo && <Badge variant="outline">anterior</Badge>}
              </Link>
              {editing ? (
                <Input
                  className="mt-1 h-8 max-w-56"
                  placeholder="Papel"
                  value={editPapel}
                  autoFocus
                  onChange={(e) => setEditPapel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarPapel(r.id)
                    if (e.key === 'Escape') setEditId(null)
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground">{r.papel || '—'}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {editing ? (
                <>
                  <button onClick={() => salvarPapel(r.id)} className="text-muted-foreground hover:text-foreground" title="Salvar">
                    <Check className="size-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditId(r.id); setEditPapel(r.papel ?? '') }}
                    className="text-muted-foreground hover:text-foreground"
                    title="Editar papel"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => remover(r.id)} className="text-muted-foreground hover:text-destructive" title="Remover relação">
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sel} onValueChange={setSel}>
          <SelectTrigger className="h-9 w-56" size="sm"><SelectValue placeholder="Vincular organização…" /></SelectTrigger>
          <SelectContent>
            {(orgs.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Papel" className="h-9 max-w-40" value={papel} onChange={(e) => setPapel(e.target.value)} />
        <Button size="sm" variant="secondary" onClick={vincular} disabled={!sel}><Plus className="size-4" /> Vincular</Button>
      </div>
    </div>
  )
}

function ContatoConexoes({ personId }: { personId: string }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const persons = usePersonOptions()
  const [sel, setSel] = useState('')
  const [coment, setComent] = useState('')
  const q = useQuery({
    queryKey: ['crm', 'conexoes', personId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_connections')
        .select('id, comentario, person_a_id, person_b_id, a:persons!contact_connections_person_a_id_fkey(nome), b:persons!contact_connections_person_b_id_fkey(nome)')
        .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`)
      return data ?? []
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'conexoes', personId] })

  async function add() {
    if (!orgId || !sel || sel === personId) return
    const [a, b] = personId < sel ? [personId, sel] : [sel, personId]
    const { error } = await supabase.from('contact_connections').insert({
      org_id: orgId, person_a_id: a, person_b_id: b, comentario: coment.trim() || null,
    })
    if (error) return toast.error('Erro', { description: error.message })
    setSel(''); setComent(''); refresh()
  }

  if (q.isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <div className="space-y-3">
      {(q.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conexão.</p>}
      {(q.data ?? []).map((c) => {
        const other = c.person_a_id === personId
          ? (c.b as unknown as { nome: string } | null)
          : (c.a as unknown as { nome: string } | null)
        const otherId = c.person_a_id === personId ? c.person_b_id : c.person_a_id
        return (
          <div key={c.id} className="rounded-md border border-border p-3">
            <Link to={`/comercial/contatos/${otherId}`} className="font-medium hover:underline">{other?.nome}</Link>
            {c.comentario && <p className="text-sm text-muted-foreground">{c.comentario}</p>}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sel} onValueChange={setSel}>
          <SelectTrigger className="h-9 w-56" size="sm"><SelectValue placeholder="Conectar contato…" /></SelectTrigger>
          <SelectContent>
            {(persons.data ?? []).filter((x) => x.id !== personId).map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Como se conhecem" className="h-9 max-w-xs" value={coment} onChange={(e) => setComent(e.target.value)} />
        <Button size="sm" variant="secondary" onClick={add} disabled={!sel}><Plus className="size-4" /> Adicionar</Button>
      </div>
    </div>
  )
}

function ContatoDados({ p }: { p: Person }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const initial = useMemo(
    () => ({
      nome: p.nome ?? '',
      funil_stage_id: p.funil_stage_id ?? '',
      email: p.email ?? '',
      telefone: p.telefone ?? '',
      linkedin: p.linkedin ?? '',
      instagram: p.instagram ?? '',
      observacoes: p.observacoes ?? '',
    }),
    [p],
  )
  const { draft, set, dirty, reset } = useDraft(initial, p.updated_at)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['crm', 'contact', p.id] })
    qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
  }

  async function salvar() {
    setSaving(true)
    try {
      await updateContact(p.id, {
        nome: draft.nome.trim() || p.nome,
        funil_stage_id: draft.funil_stage_id || null,
        email: toText(draft.email),
        telefone: toText(draft.telefone),
        linkedin: toText(draft.linkedin),
        instagram: toText(draft.instagram),
        observacoes: toText(draft.observacoes),
      })
      invalidate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Detalhes</h3>
      <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Estágio (relacionamento)</Label>
        <StageSelector
          slug="relacionamento"
          value={draft.funil_stage_id || null}
          onChange={(s) => set('funil_stage_id', s ?? '')}
          className="h-8 w-full"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Email" type="email" value={draft.email} onChange={(v) => set('email', v)} />
        <TextField label="Telefone" value={draft.telefone} onChange={(v) => set('telefone', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="LinkedIn" value={draft.linkedin} onChange={(v) => set('linkedin', v)} />
        <TextField label="Instagram" value={draft.instagram} onChange={(v) => set('instagram', v)} />
      </div>
      <TextareaField label="Observações" value={draft.observacoes} onChange={(v) => set('observacoes', v)} />
      {dirty && <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />}
    </section>
  )
}
