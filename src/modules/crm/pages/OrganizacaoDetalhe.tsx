import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, History, MapPin, CalendarSearch, GitMerge } from 'lucide-react'
import { useEventosDoOrganizador } from '@/modules/pesquisa/hooks/usePesquisa'
import { EventosDialog } from '@/modules/pesquisa/components/EventosDialog'
import { SocialLinks } from '../components/SocialLinks'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fmtBRL } from '@/lib/format'
import { StageSelector } from '../components/StageSelector'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { AuditLog } from '../components/AuditLog'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import {
  TextField, SelectField, CurrencyField, TextareaField, FormActions, useDraft, toText, toNumber,
} from '../components/EditFields'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import { ClasseBadge } from '../components/ClasseBadge'
import { EntityAutocomplete, type Lookup } from '../components/EntityAutocomplete'
import {
  useOrgLocais, useLocais, linkLocalToOrg, unlinkOrgLocal,
} from '../hooks/useCadastros'
import {
  useOrganization,
  useSubOrganizations,
  updateOrganization,
  deleteOrganization,
  STATUS_COMERCIAL,
  type Organization,
} from '../hooks/useOrganizations'
import { useOpportunities } from '../hooks/useOpportunities'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { EntityContatos } from '../components/EntityContatos'
import { EmTrabalhoToggle } from '../components/EmTrabalhoToggle'
import { MergeEntityDialog } from '../components/MergeEntityDialog'

const CLASSES = ['A+', 'A', 'B', 'C']
const ORIGENS = ['Indicação', 'Prospecção ativa', 'Inbound', 'Evento', 'Pesquisa', 'Outro']
const SOCIEDADES = ['Sócio Único', 'Grupo de Sócios']
const ESTRUTURAS = ['Pequena', 'Média', 'Grande']

export function OrganizacaoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: org, isLoading } = useOrganization(id)
  const [oppOpen, setOppOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [verEventos, setVerEventos] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  // Eventos captados pelo módulo Pesquisa para este organizador (lazy: só ao abrir).
  const eventosOrg = useEventosDoOrganizador(verEventos && org ? org.nome : null)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!org) return <p className="text-muted-foreground">Organização não encontrada.</p>

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      {/* Breadcrumb (linha 100% acima do nome) */}
      <div className="border-b border-border px-6 py-2">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/comercial/organizacoes'))}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Voltar
        </button>
      </div>

      {/* Título */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{org.nome}</h1>
        {org.classificacao && <ClasseBadge classe={org.classificacao} />}
        <SocialLinks site={org.site} instagram={org.instagram} />
        <button
          onClick={() => setVerEventos(true)}
          className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          title="Ver eventos captados pelo módulo Pesquisa"
        >
          <CalendarSearch className="size-4" /> Ver eventos
        </button>
      </div>

      <EventosDialog
        open={verEventos}
        onOpenChange={setVerEventos}
        titulo={`Eventos captados — ${org.nome}`}
        subtitulo={eventosOrg.isLoading ? 'Carregando…' : `${eventosOrg.data?.length ?? 0} evento(s) do módulo Pesquisa`}
        loading={eventosOrg.isLoading}
        eventos={eventosOrg.data ?? []}
        showOrganizador={false}
      />

      {/* Corpo: principal | divisória | detalhes */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Coluna principal — atividades */}
        <div className="min-w-0 px-6 py-4">
          <AtividadesPanel entityType="organization" entityId={org.id} organizationId={org.id} />
        </div>

        {/* Coluna direita — detalhes, contatos e opções */}
        <aside className="space-y-5 border-border px-6 py-4 lg:border-l">
          <OrgVisaoGeral org={org} />

          <OrgSubs parentId={org.id} />

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Contatos</h3>
            <EntityContatos entityType="organization" entityId={org.id} />
          </section>

          <section className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Oportunidades</h3>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOppOpen(true)}>
                <Plus className="size-4" /> Nova
              </Button>
            </div>
            <OrgOportunidades organizationId={org.id} />
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Locais</h3>
            <OrgLocais organizationId={org.id} />
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium">Opções</h3>
            <div className="space-y-1">
              <EmTrabalhoToggle tipo="org" entityId={org.id} />
              <button
                onClick={() => setMergeOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <GitMerge className="size-4" /> Unificar duplicado
              </button>
              <button
                onClick={() => setHistOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <History className="size-4" /> Histórico
              </button>
              <DeleteEntityButton
                title="Excluir organização?"
                description={`"${org.nome}" sairá das listagens. Os dados vinculados (oportunidades, atividades, contatos) são preservados. Pode ser desfeito em Comercial → Logs.`}
                onDelete={() => deleteOrganization(org.id)}
                onDeleted={() => navigate('/comercial/organizacoes')}
                variant="menu"
                label="Remover"
              />
            </div>
          </section>
        </aside>
      </div>

      <NovaOportunidadeDialog open={oppOpen} onOpenChange={setOppOpen} organizationId={org.id} />

      <MergeEntityDialog tipo="org" entityId={org.id} entityNome={org.nome} open={mergeOpen} onOpenChange={setMergeOpen} />

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Histórico</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <AuditLog entityType="organization" entityId={org.id} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
/** Sub-organizações desta principal (só aparece quando há). */
function OrgSubs({ parentId }: { parentId: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useSubOrganizations(parentId)
  if (isLoading || !data || data.length === 0) return null
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-medium">Sub-organizações <span className="text-muted-foreground">({data.length})</span></h3>
      <div className="space-y-1">
        {data.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/comercial/organizacoes/${s.id}`)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate">{s.nome}</span>
            <span className="flex shrink-0 items-center gap-2">
              {s.classificacao && <ClasseBadge classe={s.classificacao} />}
              <span className="text-xs text-muted-foreground">
                {[s.cidade, s.uf].filter(Boolean).join('/') || '—'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
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
function OrgLocais({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { data: vinculos, isLoading } = useOrgLocais(organizationId)
  const { data: locais } = useLocais()
  const [pick, setPick] = useState<Lookup | null>(null)
  const [saving, setSaving] = useState(false)

  const jaVinculados = new Set((vinculos ?? []).map((v) => v.local_id))
  const options: Lookup[] = (locais ?? [])
    .filter((l) => !jaVinculados.has(l.id))
    .map((l) => ({ id: l.id, nome: l.cidade ? `${l.nome} — ${l.cidade}${l.uf ? `/${l.uf}` : ''}` : l.nome }))

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'org-locais', organizationId] })

  async function vincular() {
    if (!pick || !tenantOrgId) return
    setSaving(true)
    try {
      await linkLocalToOrg(tenantOrgId, organizationId, pick.id)
      setPick(null)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function remover(linkId: string) {
    try {
      await unlinkOrgLocal(linkId)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (isLoading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-3">
      {(vinculos ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum local vinculado.</p>
      )}
      {(vinculos ?? []).map((v) => (
        <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-medium">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{v.nome}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {[v.cidade ? `${v.cidade}${v.uf ? `/${v.uf}` : ''}` : null, v.tipo].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <button onClick={() => remover(v.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover vínculo">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <EntityAutocomplete
          className="w-56"
          value={pick}
          onPick={setPick}
          options={options}
          placeholder="Buscar local…"
        />
        <Button size="sm" variant="secondary" onClick={vincular} disabled={!pick || saving}>
          <Plus className="size-4" /> Vincular
        </Button>
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
      gmv_anual: org.gmv_anual != null ? String(Math.round(org.gmv_anual)) : '',
      cliente_desde: org.cliente_desde != null ? String(org.cliente_desde) : '',
      classificacao: org.classificacao ?? '',
      status_comercial: org.status_comercial ?? '',
      origem_lead: org.origem_lead ?? '',
      sociedade: org.sociedade ?? '',
      estrutura: org.estrutura ?? '',
      site: org.site ?? '',
      instagram: org.instagram ?? '',
      aliases: org.aliases ?? '',
      observacoes: org.observacoes ?? '',
    }),
    [org],
  )
  const { draft, set, dirty, reset } = useDraft(initial, org.updated_at)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['crm', 'organization', org.id] })
    qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
    // "Cliente desde" do BI depende de organizations.cliente_desde.
    qc.invalidateQueries({ queryKey: ['bi', 'org-cliente-desde'] })
  }

  async function salvar() {
    setSaving(true)
    try {
      await updateOrganization(org.id, {
        nome: draft.nome.trim() || org.nome,
        cidade: toText(draft.cidade),
        uf: toText(draft.uf),
        gmv_anual: toNumber(draft.gmv_anual),
        cliente_desde: toNumber(draft.cliente_desde),
        classificacao: toText(draft.classificacao),
        status_comercial: toText(draft.status_comercial),
        origem_lead: toText(draft.origem_lead),
        sociedade: toText(draft.sociedade),
        estrutura: toText(draft.estrutura),
        site: toText(draft.site),
        instagram: toText(draft.instagram),
        aliases: toText(draft.aliases),
        observacoes: toText(draft.observacoes),
      })
      invalidate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function setStage(stageId: string | null) {
    try {
      await updateOrganization(org.id, { funil_stage_id: stageId })
      invalidate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Detalhes</h3>
      <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Estágio (relacionamento)</Label>
        <StageSelector slug="relacionamento" value={org.funil_stage_id} onChange={setStage} className="h-8 w-full" />
      </div>
      <div className="grid grid-cols-[1fr_70px] gap-3">
        <TextField label="Cidade" value={draft.cidade} onChange={(v) => set('cidade', v)} />
        <TextField label="UF" value={draft.uf} onChange={(v) => set('uf', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CurrencyField label="GMV anual" value={draft.gmv_anual} onChange={(v) => set('gmv_anual', v)} />
        <SelectField label="Classificação" value={draft.classificacao} options={CLASSES} onChange={(v) => set('classificacao', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Status comercial" value={draft.status_comercial} options={[...STATUS_COMERCIAL]} onChange={(v) => set('status_comercial', v)} />
        <TextField label="Cliente desde (ano)" value={draft.cliente_desde} onChange={(v) => set('cliente_desde', v)} placeholder="ex.: 2019" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Estrutura" value={draft.estrutura} options={ESTRUTURAS} onChange={(v) => set('estrutura', v)} />
        <SelectField label="Sociedade" value={draft.sociedade} options={SOCIEDADES} onChange={(v) => set('sociedade', v)} />
      </div>
      <SelectField label="Origem do lead" value={draft.origem_lead} options={ORIGENS} onChange={(v) => set('origem_lead', v)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Site" value={draft.site} onChange={(v) => set('site', v)} placeholder="https://…" />
        <TextField label="Instagram" value={draft.instagram} onChange={(v) => set('instagram', v)} placeholder="@perfil" />
      </div>
      <TextField label="Nomes alternativos (match com a Pesquisa)" value={draft.aliases} onChange={(v) => set('aliases', v)} placeholder="Separe por vírgula" />
      <TextareaField label="Observações" value={draft.observacoes} onChange={(v) => set('observacoes', v)} />
      {dirty && <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />}
    </section>
  )
}
