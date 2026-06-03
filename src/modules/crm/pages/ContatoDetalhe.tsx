import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { StageSelector } from '../components/StageSelector'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ObjecoesTags } from '../components/ObjecoesTags'
import { AuditLog } from '../components/AuditLog'
import { useContact, updateContact, type Person } from '../hooks/useContacts'
import { usePersonOptions } from '../hooks/useCrmLookups'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { fmtDate } from '@/lib/format'

export function ContatoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: p, isLoading } = useContact(id)

  async function save(patch: Partial<Person>) {
    if (!id) return
    try {
      await updateContact(id, patch)
      qc.invalidateQueries({ queryKey: ['crm', 'contact', id] })
      qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!p) return <p className="text-muted-foreground">Contato não encontrado.</p>

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/comercial/contatos')}>
        <ArrowLeft className="size-4" /> Contatos
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">{p.nome}</h1>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="orgs">Organizações</TabsTrigger>
          <TabsTrigger value="conexoes">Conexões</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4 max-w-2xl space-y-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4">
              <F label="Nome" value={p.nome} onSave={(v) => save({ nome: v ?? p.nome })} />
              <F label="Cargo" value={p.cargo} onSave={(v) => save({ cargo: v })} />
              <F label="Email" value={p.email} onSave={(v) => save({ email: v })} />
              <F label="Telefone" value={p.telefone} onSave={(v) => save({ telefone: v })} />
              <F label="LinkedIn" value={p.linkedin} onSave={(v) => save({ linkedin: v })} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Estágio (relacionamento)</Label>
                <StageSelector
                  slug="relacionamento"
                  value={p.funil_stage_id}
                  onChange={(s) => save({ funil_stage_id: s })}
                  className="h-8 w-full"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Objeções</CardTitle></CardHeader>
            <CardContent><ObjecoesTags entityType="person" entityId={p.id} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orgs" className="mt-4">
          <ContatoOrgs personId={p.id} />
        </TabsContent>

        <TabsContent value="conexoes" className="mt-4">
          <ContatoConexoes personId={p.id} />
        </TabsContent>

        <TabsContent value="atividades" className="mt-4">
          <ActivityTimeline filter={{ personId: p.id }} showOrg />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <AuditLog entityType="person" entityId={p.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ContatoOrgs({ personId }: { personId: string }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const [sel, setSel] = useState('')
  const [papel, setPapel] = useState('')
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
        .select('id, papel, ativo, data_inicio, data_fim, organization_id, organizations(nome)')
        .eq('person_id', personId)
        .order('ativo', { ascending: false })
      return data ?? []
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'contato-orgs', personId] })

  async function vincular() {
    if (!orgId || !sel) return
    const { error } = await supabase.from('org_persons').insert({
      org_id: orgId, organization_id: sel, person_id: personId,
      papel: papel.trim() || null, data_inicio: new Date().toISOString().slice(0, 10),
    })
    if (error) return toast.error('Erro', { description: error.message })
    setSel(''); setPapel(''); refresh()
  }

  if (q.isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <div className="max-w-2xl space-y-3">
      {(q.data ?? []).map((r) => {
        const o = r.organizations as unknown as { nome: string } | null
        return (
          <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <Link to={`/comercial/organizacoes/${r.organization_id}`} className="hover:underline">
              <div className="flex items-center gap-2 font-medium">
                {o?.nome}
                {!r.ativo && <Badge variant="outline">anterior</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {[r.papel, r.data_inicio && fmtDate(new Date(r.data_inicio)), r.data_fim && `até ${fmtDate(new Date(r.data_fim))}`].filter(Boolean).join(' · ') || '—'}
              </div>
            </Link>
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
    <div className="max-w-2xl space-y-3">
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

function F({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? '')
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="h-8" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v.trim() || null)} />
    </div>
  )
}
