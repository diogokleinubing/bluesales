import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Plus, Power } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { fmtBRL } from '@/lib/format'
import { StageSelector } from '../components/StageSelector'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ActivityDialog } from '../components/ActivityDialog'
import { ObjecoesTags } from '../components/ObjecoesTags'
import { AuditLog } from '../components/AuditLog'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import {
  TextField, SelectField, FormActions, useDraft, toText, toNumber,
} from '../components/EditFields'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import {
  useOrganization,
  updateOrganization,
  deleteOrganization,
  type Organization,
} from '../hooks/useOrganizations'
import { useOpportunities } from '../hooks/useOpportunities'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { PersonAutocomplete, type PersonPick } from '../components/PersonAutocomplete'

const CLASSES = ['A+', 'A', 'B', 'C']
const ORIGENS = ['Indicação', 'Prospecção ativa', 'Inbound', 'Evento', 'Outro']
const SOCIEDADES = ['Sócio Único', 'Grupo de Sócios']
const ESTRUTURAS = ['Pequena', 'Média', 'Grande']

export function OrganizacaoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: org, isLoading } = useOrganization(id)
  const [actOpen, setActOpen] = useState(false)
  const [oppOpen, setOppOpen] = useState(false)

  function refresh() {
    qc.invalidateQueries({ queryKey: ['crm', 'organization', id] })
    qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
  }

  async function save(patch: Partial<Organization>) {
    if (!id) return
    try {
      await updateOrganization(id, patch)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!org) return <p className="text-muted-foreground">Organização não encontrada.</p>

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/comercial/organizacoes')}>
        <ArrowLeft className="size-4" /> Organizações
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{org.nome}</h1>
          {org.classificacao && <Badge variant="secondary">{org.classificacao}</Badge>}
        </div>
        <DeleteEntityButton
          title="Excluir organização?"
          description={`Esta ação remove "${org.nome}" e todos os dados vinculados (oportunidades, atividades, tarefas e contatos vinculados). Não pode ser desfeita.`}
          onDelete={() => deleteOrganization(org.id)}
          onDeleted={() => navigate('/comercial/organizacoes')}
        />
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            {/* Coluna principal — tudo na mesma tela */}
            <div className="space-y-4">
              <OrgVisaoGeral org={org} />

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Atividades</h3>
                    <Button size="sm" variant="secondary" onClick={() => setActOpen(true)}>
                      <Plus className="size-4" /> Registrar
                    </Button>
                  </div>
                  <ActivityTimeline filter={{ organizationId: org.id }} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="text-sm font-medium">Contatos</h3>
                  <OrgContatos orgId={org.id} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Oportunidades</h3>
                    <Button size="sm" variant="secondary" onClick={() => setOppOpen(true)}>
                      <Plus className="size-4" /> Nova
                    </Button>
                  </div>
                  <OrgOportunidades organizationId={org.id} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="text-sm font-medium">Objeções</h3>
                  <ObjecoesTags entityType="organization" entityId={org.id} />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Estágio (relacionamento)</CardTitle>
                </CardHeader>
                <CardContent>
                  <StageSelector
                    slug="relacionamento"
                    value={org.funil_stage_id}
                    onChange={(stageId) => save({ funil_stage_id: stageId })}
                    className="h-8 w-full"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Ponte com o BI</CardTitle>
                </CardHeader>
                <OrgBiPonte org={org} />
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <AuditLog entityType="organization" entityId={org.id} />
        </TabsContent>
      </Tabs>

      <ActivityDialog open={actOpen} onOpenChange={setActOpen} organizationId={org.id} />
      <NovaOportunidadeDialog open={oppOpen} onOpenChange={setOppOpen} organizationId={org.id} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function OrgOportunidades({ organizationId }: { organizationId: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useOpportunities(organizationId)
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhuma oportunidade.</p>
  return (
    <div className="space-y-2">
      {data.map((o) => (
        <button
          key={o.id}
          onClick={() => navigate(`/comercial/oportunidades/${o.id}`)}
          className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left hover:border-primary"
        >
          <div>
            <div className="font-medium">{o.titulo}</div>
            <div className="text-xs text-muted-foreground">
              {o.stageNome ?? '—'} · {o.ownerNome ?? '—'}
            </div>
          </div>
          <div className="text-sm tabular-nums">
            {o.gmv_estimado != null ? fmtBRL(o.gmv_estimado) : '—'}
          </div>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
function OrgContatos({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const [selected, setSelected] = useState<PersonPick | null>(null)
  const [papel, setPapel] = useState('')

  const q = useQuery({
    queryKey: ['crm', 'org-contatos', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('org_persons')
        .select('id, papel, ativo, person_id, persons(nome, cargo, email, telefone)')
        .eq('organization_id', orgId)
        .eq('ativo', true)
      return data ?? []
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'org-contatos', orgId] })

  async function vincular() {
    if (!selected || !tenantOrgId) return
    const { error } = await supabase.from('org_persons').insert({
      org_id: tenantOrgId,
      organization_id: orgId,
      person_id: selected.id,
      papel: papel.trim() || null,
      data_inicio: new Date().toISOString().slice(0, 10),
    })
    if (error) return toast.error('Erro', { description: error.message })
    setSelected(null)
    setPapel('')
    refresh()
    qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
  }

  async function encerrar(id: string) {
    const { error } = await supabase
      .from('org_persons')
      .update({ ativo: false, data_fim: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) return toast.error('Erro', { description: error.message })
    refresh()
  }

  if (q.isLoading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-3">
      {(q.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum contato vinculado.</p>
      )}
      {(q.data ?? []).map((r) => {
        const p = r.persons as unknown as { nome: string; cargo: string | null; email: string | null; telefone: string | null } | null
        return (
          <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <Link to={`/comercial/contatos/${r.person_id}`} className="hover:underline">
              <div className="font-medium">{p?.nome}</div>
              <div className="text-xs text-muted-foreground">
                {[r.papel, p?.cargo, p?.email, p?.telefone].filter(Boolean).join(' · ') || '—'}
              </div>
            </Link>
            <Button size="sm" variant="ghost" onClick={() => encerrar(r.id)} title="Encerrar vínculo">
              <Power className="size-4" />
            </Button>
          </div>
        )
      })}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <PersonAutocomplete
            className="w-56"
            placeholder="Buscar ou criar contato…"
            onPick={(p) => setSelected(p)}
          />
          <Input placeholder="Papel" className="h-9 max-w-40" value={papel} onChange={(e) => setPapel(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={vincular} disabled={!selected}>
            <Plus className="size-4" /> Vincular
          </Button>
        </div>
        {selected && (
          <p className="text-xs text-muted-foreground">
            Selecionado: <span className="font-medium text-foreground">{selected.nome}</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function OrgVisaoGeral({ org }: { org: Organization }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const initial = useMemo(
    () => ({
      nome: org.nome ?? '',
      cidade: org.cidade ?? '',
      uf: org.uf ?? '',
      gmv_anual: org.gmv_anual != null ? String(org.gmv_anual) : '',
      classificacao: org.classificacao ?? '',
      origem_lead: org.origem_lead ?? '',
      sociedade: org.sociedade ?? '',
      estrutura: org.estrutura ?? '',
    }),
    [org],
  )
  const { draft, set, dirty, reset } = useDraft(initial, org.updated_at)

  async function salvar() {
    setSaving(true)
    try {
      await updateOrganization(org.id, {
        nome: draft.nome.trim() || org.nome,
        cidade: toText(draft.cidade),
        uf: toText(draft.uf),
        gmv_anual: toNumber(draft.gmv_anual),
        classificacao: toText(draft.classificacao),
        origem_lead: toText(draft.origem_lead),
        sociedade: toText(draft.sociedade),
        estrutura: toText(draft.estrutura),
      })
      qc.invalidateQueries({ queryKey: ['crm', 'organization', org.id] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
          <TextField label="Cidade" value={draft.cidade} onChange={(v) => set('cidade', v)} />
          <TextField label="UF" value={draft.uf} onChange={(v) => set('uf', v)} />
          <TextField label="GMV anual" type="number" value={draft.gmv_anual} onChange={(v) => set('gmv_anual', v)} />
          <SelectField label="Classificação" value={draft.classificacao} options={CLASSES} onChange={(v) => set('classificacao', v)} />
          <SelectField label="Origem do lead" value={draft.origem_lead} options={ORIGENS} onChange={(v) => set('origem_lead', v)} />
          <SelectField label="Sociedade" value={draft.sociedade} options={SOCIEDADES} onChange={(v) => set('sociedade', v)} />
          <SelectField label="Estrutura" value={draft.estrutura} options={ESTRUTURAS} onChange={(v) => set('estrutura', v)} />
        </div>
        <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />
      </CardContent>
    </Card>
  )
}

function OrgBiPonte({ org }: { org: Organization }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const initial = useMemo(() => ({ bi: org.bi_organizador ?? '' }), [org])
  const { draft, set, dirty, reset } = useDraft(initial, org.updated_at)

  async function salvar() {
    setSaving(true)
    try {
      await updateOrganization(org.id, { bi_organizador: toText(draft.bi) })
      qc.invalidateQueries({ queryKey: ['crm', 'organization', org.id] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardContent className="space-y-2">
      <TextField label="Organizador no BI" value={draft.bi} onChange={(v) => set('bi', v)} />
      {org.bi_organizador && (
        <Link
          to={`/bi/organizadores?organizador=${encodeURIComponent(org.bi_organizador)}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Ver no BI <ExternalLink className="size-3.5" />
        </Link>
      )}
      <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />
    </CardContent>
  )
}
