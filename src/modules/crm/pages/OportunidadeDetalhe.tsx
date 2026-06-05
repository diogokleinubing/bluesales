import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, History, Trophy, Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { StageSelector } from '../components/StageSelector'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { AuditLog } from '../components/AuditLog'
import {
  TextField, SelectField, CurrencyField, TextareaField, FormActions, useDraft, toText, toNumber,
} from '../components/EditFields'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import { useProfile } from '../hooks/useProfile'
import { canEdit } from '../lib/permissions'
import { useEventGmvOptions, useOrgGmvOptions, useLocalOptions } from '../hooks/useCrmLookups'
import { useGmvCopy } from '../hooks/useGmvCopy'
import { useOpportunity, updateOpportunity, deleteOpportunity, setOpportunityOutcome, type Opportunity } from '../hooks/useOpportunities'
import { fmtBRL, fmtBRL0 } from '@/lib/format'

export function OportunidadeDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useProfile()
  const { data: o, isLoading } = useOpportunity(id)
  const [histOpen, setHistOpen] = useState(false)

  async function setOutcome(r: 'Ganho' | 'Perdida' | null) {
    if (!o) return
    try {
      await setOpportunityOutcome(o.id, r)
      qc.invalidateQueries({ queryKey: ['crm', 'opportunity', o.id] })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  const orgQ = useQuery({
    enabled: !!o?.organization_id,
    queryKey: ['crm', 'opp-org', o?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('id, nome').eq('id', o!.organization_id).maybeSingle()
      return data
    },
  })
  const profilesQ = useQuery({
    enabled: profile?.role === 'gestor',
    queryKey: ['crm', 'profiles-all'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome').order('nome')
      return data ?? []
    },
  })

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!o) return <p className="text-muted-foreground">Oportunidade não encontrada.</p>

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      {/* Breadcrumb */}
      <div className="border-b border-border px-6 py-2">
        <button
          onClick={() => navigate('/comercial/oportunidades')}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Oportunidades
        </button>
      </div>

      {/* Título + resultado (Ganho/Perdida) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{o.titulo}</h1>
          {o.resultado === 'Ganho' && (
            <Badge className="border-transparent bg-[var(--success)]/15 text-[var(--success)]">Ganho</Badge>
          )}
          {o.resultado === 'Perdida' && (
            <Badge className="border-transparent bg-destructive/15 text-destructive">Perdida</Badge>
          )}
        </div>
        {canEdit(profile, o.owner_id) && (
          <div className="flex items-center gap-2">
            {o.resultado ? (
              <Button variant="ghost" size="sm" onClick={() => setOutcome(null)}>
                <RotateCcw className="size-4" /> Reabrir
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="bg-[var(--success)] text-white hover:bg-[var(--success)]/90"
                  onClick={() => setOutcome('Ganho')}
                >
                  <Trophy className="size-4" /> Ganho
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setOutcome('Perdida')}>
                  <Ban className="size-4" /> Perdida
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Corpo */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 px-6 py-4">
          <AtividadesPanel entityType="opportunity" entityId={o.id} organizationId={o.organization_id} opportunityId={o.id} />
        </div>

        <aside className="space-y-5 border-border px-6 py-4 lg:border-l">
          <OppVisaoGeral
            o={o}
            isGestor={profile?.role === 'gestor'}
            profiles={profilesQ.data ?? []}
          />

          <section className="border-t border-border pt-4 text-sm">
            <h3 className="mb-2 text-sm font-medium">Vínculos</h3>
            <div className="space-y-1">
              <div>
                <span className="text-muted-foreground">Organização: </span>
                {orgQ.data ? (
                  <Link to={`/comercial/organizacoes/${orgQ.data.id}`} className="text-primary hover:underline">
                    {orgQ.data.nome}
                  </Link>
                ) : '—'}
              </div>
              <div>
                <span className="text-muted-foreground">GMV estimado: </span>
                {o.gmv_estimado != null ? fmtBRL(o.gmv_estimado) : '—'}
              </div>
            </div>
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
              {canEdit(profile, o.owner_id) && (
                <DeleteEntityButton
                  title="Excluir oportunidade?"
                  description={`"${o.titulo}" sairá das listagens. As atividades e tarefas são preservadas. Pode ser desfeito em Comercial → Logs.`}
                  onDelete={() => deleteOpportunity(o.id)}
                  onDeleted={() => navigate('/comercial/oportunidades')}
                  variant="menu"
                  label="Remover"
                />
              )}
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Histórico</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <AuditLog entityType="opportunity" entityId={o.id} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OppVisaoGeral({
  o, isGestor, profiles,
}: {
  o: Opportunity
  isGestor: boolean
  profiles: { id: string; nome: string | null }[]
}) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const eventOptions = useEventGmvOptions()
  const orgOptions = useOrgGmvOptions()
  const localOptions = useLocalOptions()
  const [propagate, setPropagate] = useState<{ kind: 'event' | 'org'; id: string; nome: string; gmv: number } | null>(null)
  const initial = useMemo(
    () => ({
      titulo: o.titulo ?? '',
      gmv_estimado: o.gmv_estimado != null ? String(Math.round(o.gmv_estimado)) : '',
      crm_event_id: o.crm_event_id ?? '',
      local_id: o.local_id ?? '',
      owner_id: o.owner_id,
      observacoes: o.observacoes ?? '',
    }),
    [o],
  )
  const { draft, set, dirty, reset } = useDraft(initial, o.updated_at)
  const { consider, dialog: gmvDialog } = useGmvCopy(draft.gmv_estimado, (v) => set('gmv_estimado', v))

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['crm', 'opportunity', o.id] })
    qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
    qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
    qc.invalidateQueries({ queryKey: ['crm', 'events'] })
    qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
  }

  function onEventChange(id: string) {
    set('crm_event_id', id)
    if (!id) return
    const e = eventOptions.data?.find((x) => x.id === id)
    if (e) consider(e.gmv, `O evento "${e.nome}"`)
  }

  async function salvar() {
    setSaving(true)
    const newGmv = toNumber(draft.gmv_estimado)
    const prevGmv = o.gmv_estimado != null ? Math.round(o.gmv_estimado) : null
    const gmvChanged = newGmv != null && newGmv !== prevGmv
    try {
      await updateOpportunity(o.id, {
        titulo: draft.titulo.trim() || o.titulo,
        gmv_estimado: newGmv,
        crm_event_id: draft.crm_event_id || null,
        local_id: draft.local_id || null,
        owner_id: draft.owner_id,
        observacoes: toText(draft.observacoes),
      })
      invalidate()
      // Propagar o GMV: para o evento (se vinculado) ou para a organização.
      if (gmvChanged) {
        if (draft.crm_event_id) {
          const ev = eventOptions.data?.find((x) => x.id === draft.crm_event_id)
          if (ev && Math.round(ev.gmv ?? 0) !== newGmv) {
            setPropagate({ kind: 'event', id: ev.id, nome: ev.nome, gmv: newGmv })
          }
        } else if (o.organization_id) {
          const og = orgOptions.data?.find((x) => x.id === o.organization_id)
          if (og && Math.round(og.gmv ?? 0) !== newGmv) {
            setPropagate({ kind: 'org', id: og.id, nome: og.nome, gmv: newGmv })
          }
        }
      }
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function confirmPropagate() {
    if (!propagate) return
    try {
      if (propagate.kind === 'event') {
        const { error } = await supabase.from('crm_events').update({ gmv_estimado: propagate.gmv }).eq('id', propagate.id)
        if (error) throw new Error(error.message)
        qc.invalidateQueries({ queryKey: ['crm', 'events'] })
        qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'events-gmv'] })
      } else {
        const { error } = await supabase.from('organizations').update({ gmv_anual: propagate.gmv }).eq('id', propagate.id)
        if (error) throw new Error(error.message)
        qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
        qc.invalidateQueries({ queryKey: ['crm', 'organization', propagate.id] })
        qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'orgs-gmv'] })
      }
      toast.success('GMV atualizado')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setPropagate(null)
    }
  }

  async function setStage(s: string | null) {
    if (!s) return
    try {
      await updateOpportunity(o.id, { stage_id: s })
      invalidate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Detalhes</h3>
      <TextField label="Título" value={draft.titulo} onChange={(v) => set('titulo', v)} />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Estágio</Label>
        <StageSelector slug="oportunidade" value={o.stage_id} onChange={setStage} allowNone={false} className="h-8 w-full" />
      </div>
      <SelectField
        label="Evento"
        value={draft.crm_event_id}
        options={(eventOptions.data ?? []).map((e) => ({ value: e.id, label: e.nome }))}
        onChange={onEventChange}
      />
      <SelectField
        label="Local"
        value={draft.local_id}
        options={(localOptions.data ?? []).map((l) => ({ value: l.id, label: l.nome }))}
        onChange={(v) => set('local_id', v)}
      />
      <CurrencyField label="GMV estimado" value={draft.gmv_estimado} onChange={(v) => set('gmv_estimado', v)} />
      {isGestor && (
        <SelectField
          label="Responsável"
          value={draft.owner_id}
          includeNone={false}
          options={profiles.map((p) => ({ value: p.id, label: p.nome ?? p.id }))}
          onChange={(v) => set('owner_id', v)}
        />
      )}
      <TextareaField label="Observações" value={draft.observacoes} onChange={(v) => set('observacoes', v)} />
      {dirty && <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />}
      {gmvDialog}

      <Dialog open={!!propagate} onOpenChange={(o) => !o && setPropagate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar GMV {propagate?.kind === 'event' ? 'do evento' : 'da organização'}?</DialogTitle>
            <DialogDescription>
              {propagate &&
                `Deseja atualizar o GMV ${propagate.kind === 'event' ? 'do evento' : 'da organização'} "${propagate.nome}" para ${fmtBRL0(propagate.gmv)}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPropagate(null)}>Não</Button>
            <Button onClick={confirmPropagate}>Sim, atualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
