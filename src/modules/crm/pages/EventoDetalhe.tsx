import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, X, GitMerge, Building2, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  useCrmEvents, saveCrmEvent, setEventOrganization, deleteCrmEvent, fetchEventEditions, replaceEventEditions,
  CRM_CLASSES, type CrmClasse, type EventoStatus, type CrmEventRow,
} from '../hooks/useCadastros'
import { useOrgOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import { usePlatforms } from '../hooks/useConfigCadastros'
import { EntityAutocomplete, type Lookup } from '../components/EntityAutocomplete'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { OportunidadesCard } from '../components/OportunidadesCard'
import { EntityContatos } from '../components/EntityContatos'
import { EmTrabalhoToggle } from '../components/EmTrabalhoToggle'
import { MergeEntityDialog } from '../components/MergeEntityDialog'
import { StageChanger } from '../components/StageChanger'
import { ClasseBadge } from '../components/ClasseBadge'
import { SocialLinks } from '../components/SocialLinks'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import {
  useDraft, TextField, SelectField, CurrencyField, FormActions, toText, toNumber,
} from '../components/EditFields'
import { fmtDate } from '@/lib/format'

export function EventoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useCrmEvents()
  const ev = useMemo(() => (data ?? []).find((e) => e.id === id) ?? null, [data, id])
  const [mergeOpen, setMergeOpen] = useState(false)

  if (isLoading) return <div className="-mx-6 -mt-6 p-6"><Skeleton className="h-96 w-full" /></div>
  if (!ev) return <div className="-mx-6 -mt-6 p-6 text-muted-foreground">Evento não encontrado.</div>

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-sm">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/comercial/eventos'))} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{ev.nome}</h1>
        <ClasseBadge classe={ev.classificacao} />
        <div className="ml-auto flex items-center gap-2">
          <EmTrabalhoToggle tipo="evento" entityId={ev.id} />
          <SocialLinks site={ev.site} instagram={ev.instagram} />
        </div>
      </div>

      <MergeEntityDialog tipo="evento" entityId={ev.id} entityNome={ev.nome} open={mergeOpen} onOpenChange={setMergeOpen} />

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_450px]">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <AtividadesPanel entityType="evento" entityId={ev.id} allowObjection={false} />
        </div>
        <aside className="space-y-6 p-4">
          <EventoDetalhesForm ev={ev} />
          <div className="-mx-4 border-t border-border" />
          <EventoEdicoes ev={ev} />
          <div className="-mx-4 border-t border-border" />
          <EventoOrganizacao ev={ev} />
          <div className="-mx-4 border-t border-border" />
          <EntityContatos entityType="evento" entityId={ev.id} />
          <div className="-mx-4 border-t border-border" />
          <OportunidadesCard crmEventId={ev.id} initialTitulo={ev.nome} />
          <div className="-mx-4 border-t border-border" />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Opções</h3>
            <button
              onClick={() => setMergeOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <GitMerge className="size-4" /> Unificar duplicado
            </button>
            <DeleteEntityButton
              title="Remover evento?"
              description={`"${ev.nome}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
              onDelete={() => deleteCrmEvent(ev.id)}
              onDeleted={() => navigate('/comercial/eventos')}
              label="Remover evento"
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function EventoDetalhesForm({ ev }: { ev: CrmEventRow }) {
  const orgId = useCrmOrgId()
  const qc = useQueryClient()
  const segs = useSegmentOptions()
  const initial = useMemo(() => ({
    nome: ev.nome,
    status: ev.status ?? '',
    segmento_id: ev.segmento_id ?? '',
    capacidade: ev.capacidade_estimada != null ? String(ev.capacidade_estimada) : '',
    gmv: ev.gmv_estimado != null ? String(Math.round(ev.gmv_estimado)) : '',
    site: ev.site ?? '',
    instagram: ev.instagram ?? '',
    bi: ev.bi_event_codigo ?? '',
    classificacao: ev.classificacao ?? '',
    observacoes: ev.observacoes ?? '',
  }), [ev])
  const { draft, set, dirty, reset } = useDraft(initial, ev.id + (ev.classificacao ?? ''))
  const [saving, setSaving] = useState(false)
  const changed = dirty
  const [maisDetalhes, setMaisDetalhes] = useState(false)

  async function salvar() {
    if (!orgId) return
    setSaving(true)
    try {
      await saveCrmEvent(orgId, {
        nome: draft.nome.trim() || ev.nome,
        local_id: ev.local_id,
        organization_id: ev.organization_id,
        capacidade_estimada: toNumber(draft.capacidade),
        gmv_estimado: toNumber(draft.gmv),
        segmento_id: toText(draft.segmento_id),
        status: (toText(draft.status) as EventoStatus | null),
        observacoes: toText(draft.observacoes),
        bi_event_codigo: toText(draft.bi),
        site: toText(draft.site), instagram: toText(draft.instagram),
        classificacao: (toText(draft.classificacao) as CrmClasse | null),
        funil_stage_id: ev.funil_stage_id,
      }, ev.id)
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  function cancelar() {
    reset()
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Detalhes</h3>
      <div className="space-y-3">
        <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Classe" value={draft.classificacao} options={[...CRM_CLASSES]} onChange={(v) => set('classificacao', v)} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estágio</Label>
            <StageChanger tipo="evento" entityId={ev.id} currentStageId={ev.funil_stage_id} className="h-8 w-full" />
          </div>
        </div>
        <SelectField label="Segmento" value={draft.segmento_id}
          options={(segs.data ?? []).map((s) => ({ value: s.id, label: s.nome }))} onChange={(v) => set('segmento_id', v)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Público" type="number" value={draft.capacidade} onChange={(v) => set('capacidade', v)} />
          <CurrencyField label="GMV estimado" value={draft.gmv} onChange={(v) => set('gmv', v)} />
        </div>
        <button type="button" onClick={() => setMaisDetalhes((v) => !v)} className="text-xs font-medium text-primary hover:underline">
          {maisDetalhes ? '− Menos detalhes' : '+ Mais detalhes'}
        </button>
        {maisDetalhes && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Site" value={draft.site} onChange={(v) => set('site', v)} placeholder="https://…" />
              <TextField label="Instagram" value={draft.instagram} onChange={(v) => set('instagram', v)} placeholder="@perfil" />
            </div>
            <TextField label="Código BI" value={draft.bi} onChange={(v) => set('bi', v)} />
          </>
        )}
        {changed && <FormActions dirty={changed} saving={saving} onSave={salvar} onCancel={cancelar} />}
      </div>
    </div>
  )
}

function EventoOrganizacao({ ev }: { ev: CrmEventRow }) {
  const qc = useQueryClient()
  const orgs = useOrgOptions()
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState<Lookup | null>(null)
  const [saving, setSaving] = useState(false)

  const linked = ev.organization_id ? { id: ev.organization_id, nome: ev.organization_nome ?? '—' } : null

  async function setOrg(organizationId: string | null) {
    setSaving(true)
    try {
      await setEventOrganization(ev.id, organizationId)
      setPick(null); setAdding(false)
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Organização</h3>
        {!linked && (
          <button onClick={() => setAdding((v) => !v)} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground" title="Vincular organização">
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {linked ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
          <Link to={`/comercial/organizacoes/${linked.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:underline">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{linked.nome}</span>
          </Link>
          <button onClick={() => setOrg(null)} disabled={saving} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover vínculo">
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <EntityAutocomplete className="w-56" value={pick} onPick={setPick} options={orgs.data ?? []} placeholder="Buscar organização…" />
          <Button size="sm" variant="secondary" onClick={() => pick && setOrg(pick.id)} disabled={!pick || saving}>
            <Plus className="size-4" /> Vincular
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setPick(null) }}>Cancelar</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma organização vinculada</p>
      )}
    </div>
  )
}

function EventoEdicoes({ ev }: { ev: CrmEventRow }) {
  const orgId = useCrmOrgId()
  const platforms = usePlatforms()
  const platformById = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p.nome])), [platforms.data])
  const edsQ = useQuery({ queryKey: ['crm', 'event-editions', ev.id], queryFn: () => fetchEventEditions(ev.id) })
  const edicoes = (edsQ.data ?? []).map((e) => ({ data: e.data ?? '', platform_ids: e.platform_ids ?? [] }))
  const [addOpen, setAddOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [newEd, setNewEd] = useState<{ data: string; platform_ids: string[] }>({ data: '', platform_ids: [] })

  function fecharForm() { setAddOpen(false); setEditIdx(null); setNewEd({ data: '', platform_ids: [] }) }
  function salvarEdicao() {
    const next = editIdx == null ? [...edicoes, newEd] : edicoes.map((e, j) => (j === editIdx ? newEd : e))
    persist(next)
    fecharForm()
  }

  async function persist(next: { data: string; platform_ids: string[] }[]) {
    if (!orgId) return
    try {
      await replaceEventEditions(orgId, ev.id, next.map((e) => ({ data: e.data || null, platform_ids: e.platform_ids })))
      edsQ.refetch()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Edições</h3>
      <div className="space-y-2 rounded-md border border-border p-3">
        {edicoes.length > 0 && (
          <ul className="space-y-1">
            {edicoes.map((ed, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{ed.data ? fmtDate(ed.data) : 'Sem data'}</span>
                  {ed.platform_ids.map((pid) => <Badge key={pid} variant="outline" className="text-xs">{platformById.get(pid) ?? '?'}</Badge>)}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button onClick={() => { setEditIdx(i); setNewEd(ed); setAddOpen(true) }} className="text-muted-foreground hover:text-foreground" title="Editar edição"><Pencil className="size-3.5" /></button>
                  <button onClick={() => persist(edicoes.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Remover edição"><X className="size-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!addOpen ? (
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => { setEditIdx(null); setNewEd({ data: '', platform_ids: [] }); setAddOpen(true) }}>
            <Plus className="size-4" /> Adicionar edição
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border border-dashed border-border p-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" className="h-8" value={newEd.data} onChange={(e) => setNewEd({ ...newEd, data: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Plataforma</Label>
              <Select value="" onValueChange={(pid) => setNewEd((e) => (e.platform_ids.includes(pid) ? e : { ...e, platform_ids: [...e.platform_ids, pid] }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Adicionar plataforma…" /></SelectTrigger>
                <SelectContent>
                  {(platforms.data ?? []).filter((p) => !newEd.platform_ids.includes(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newEd.platform_ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {newEd.platform_ids.map((pid) => (
                  <Badge key={pid} variant="outline" className="gap-1">
                    {platformById.get(pid) ?? '?'}
                    <button onClick={() => setNewEd((e) => ({ ...e, platform_ids: e.platform_ids.filter((x) => x !== pid) }))} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={!newEd.data && newEd.platform_ids.length === 0}
                onClick={salvarEdicao}>{editIdx == null ? 'Adicionar' : 'Salvar'}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={fecharForm}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
