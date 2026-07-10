import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, X, GitMerge } from 'lucide-react'
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
  useCrmEvents, saveCrmEvent, deleteCrmEvent, fetchEventEditions, replaceEventEditions,
  EVENTO_STATUS, CRM_CLASSES, type CrmClasse, type EventoStatus, type CrmEventRow,
} from '../hooks/useCadastros'
import { useLocalOptions, useOrgOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import { usePlatforms } from '../hooks/useConfigCadastros'
import { EntityAutocomplete, type Lookup } from '../components/EntityAutocomplete'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { OportunidadesCard } from '../components/OportunidadesCard'
import { EntityContatos } from '../components/EntityContatos'
import { EmTrabalhoToggle } from '../components/EmTrabalhoToggle'
import { MergeEntityDialog } from '../components/MergeEntityDialog'
import { StageSelector } from '../components/StageSelector'
import { ClasseBadge } from '../components/ClasseBadge'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import {
  useDraft, TextField, SelectField, TextareaField, CurrencyField, FormActions, toText, toNumber,
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
      </div>

      <MergeEntityDialog tipo="evento" entityId={ev.id} entityNome={ev.nome} open={mergeOpen} onOpenChange={setMergeOpen} />

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <AtividadesPanel entityType="evento" entityId={ev.id} allowObjection={false} />
        </div>
        <aside className="space-y-6 p-4">
          <EventoDetalhesForm ev={ev} />
          <EventoEdicoes ev={ev} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Contatos</h3>
            <EntityContatos entityType="evento" entityId={ev.id} />
          </div>
          <OportunidadesCard crmEventId={ev.id} initialTitulo={ev.nome} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Opções</h3>
            <EmTrabalhoToggle tipo="evento" entityId={ev.id} />
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
  const locais = useLocalOptions()
  const orgs = useOrgOptions()
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
  const { draft, set, dirty, reset } = useDraft(initial, ev.id + (ev.classificacao ?? '') + (ev.funil_stage_id ?? '') + (ev.local_id ?? '') + (ev.organization_id ?? ''))
  const [stage, setStage] = useState<string | null>(ev.funil_stage_id)
  const [localPick, setLocalPick] = useState<Lookup | null>(ev.local_id ? { id: ev.local_id, nome: ev.local_nome ?? '—' } : null)
  const [orgPick, setOrgPick] = useState<Lookup | null>(ev.organization_id ? { id: ev.organization_id, nome: ev.organization_nome ?? '—' } : null)
  const [saving, setSaving] = useState(false)
  const changed = dirty || stage !== ev.funil_stage_id || (localPick?.id ?? null) !== ev.local_id || (orgPick?.id ?? null) !== ev.organization_id

  async function salvar() {
    if (!orgId) return
    setSaving(true)
    try {
      await saveCrmEvent(orgId, {
        nome: draft.nome.trim() || ev.nome,
        local_id: localPick?.id ?? null,
        organization_id: orgPick?.id ?? null,
        capacidade_estimada: toNumber(draft.capacidade),
        gmv_estimado: toNumber(draft.gmv),
        segmento_id: toText(draft.segmento_id),
        status: (toText(draft.status) as EventoStatus | null),
        observacoes: toText(draft.observacoes),
        bi_event_codigo: toText(draft.bi),
        site: toText(draft.site), instagram: toText(draft.instagram),
        classificacao: (toText(draft.classificacao) as CrmClasse | null),
        funil_stage_id: stage,
      }, ev.id)
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  function cancelar() {
    reset(); setStage(ev.funil_stage_id)
    setLocalPick(ev.local_id ? { id: ev.local_id, nome: ev.local_nome ?? '—' } : null)
    setOrgPick(ev.organization_id ? { id: ev.organization_id, nome: ev.organization_nome ?? '—' } : null)
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Detalhes</h3>
      <div className="space-y-3">
        <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Local</Label>
          <EntityAutocomplete value={localPick} onPick={setLocalPick} options={locais.data ?? []} placeholder="Buscar local…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Organização</Label>
          <EntityAutocomplete value={orgPick} onPick={setOrgPick} options={orgs.data ?? []} placeholder="Buscar organização…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Classe" value={draft.classificacao} options={[...CRM_CLASSES]} onChange={(v) => set('classificacao', v)} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estágio</Label>
            <StageSelector slug="relacionamento" value={stage} onChange={setStage} className="h-8 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Status" value={draft.status} options={[...EVENTO_STATUS]} onChange={(v) => set('status', v)} />
          <SelectField label="Segmento" value={draft.segmento_id}
            options={(segs.data ?? []).map((s) => ({ value: s.id, label: s.nome }))} onChange={(v) => set('segmento_id', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Capacidade" type="number" value={draft.capacidade} onChange={(v) => set('capacidade', v)} />
          <CurrencyField label="GMV estimado" value={draft.gmv} onChange={(v) => set('gmv', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Site" value={draft.site} onChange={(v) => set('site', v)} placeholder="https://…" />
          <TextField label="Instagram" value={draft.instagram} onChange={(v) => set('instagram', v)} placeholder="@perfil" />
        </div>
        <TextField label="Código BI" value={draft.bi} onChange={(v) => set('bi', v)} />
        <TextareaField label="Observações" value={draft.observacoes} onChange={(v) => set('observacoes', v)} />
        {changed && <FormActions dirty={changed} saving={saving} onSave={salvar} onCancel={cancelar} />}
      </div>
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
  const [newEd, setNewEd] = useState<{ data: string; platform_ids: string[] }>({ data: '', platform_ids: [] })

  async function persist(next: { data: string; platform_ids: string[] }[]) {
    if (!orgId) return
    try {
      await replaceEventEditions(orgId, ev.id, next.map((e) => ({ data: e.data || null, platform_ids: e.platform_ids })))
      edsQ.refetch()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Edições (datas e plataformas)</h3>
      <div className="space-y-2 rounded-md border border-border p-3">
        {edicoes.length > 0 && (
          <ul className="space-y-1">
            {edicoes.map((ed, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{ed.data ? fmtDate(ed.data) : 'Sem data'}</span>
                  {ed.platform_ids.map((pid) => <Badge key={pid} variant="outline" className="text-xs">{platformById.get(pid) ?? '?'}</Badge>)}
                </span>
                <button onClick={() => persist(edicoes.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
        {!addOpen ? (
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => { setNewEd({ data: '', platform_ids: [] }); setAddOpen(true) }}>
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
                onClick={() => { persist([...edicoes, newEd]); setNewEd({ data: '', platform_ids: [] }); setAddOpen(false) }}>Adicionar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setAddOpen(false); setNewEd({ data: '', platform_ids: [] }) }}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
