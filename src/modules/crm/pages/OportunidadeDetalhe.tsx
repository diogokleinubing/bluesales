import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, History } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
import { useOpportunity, updateOpportunity, deleteOpportunity, type Opportunity } from '../hooks/useOpportunities'
import { fmtBRL } from '@/lib/format'

export function OportunidadeDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { data: o, isLoading } = useOpportunity(id)
  const [histOpen, setHistOpen] = useState(false)

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

      {/* Título */}
      <div className="border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{o.titulo}</h1>
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
                  description={`Esta ação remove "${o.titulo}". As atividades e tarefas são preservadas (apenas desvinculadas). Não pode ser desfeita.`}
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
  const initial = useMemo(
    () => ({
      titulo: o.titulo ?? '',
      gmv_estimado: o.gmv_estimado != null ? String(Math.round(o.gmv_estimado)) : '',
      owner_id: o.owner_id,
      observacoes: o.observacoes ?? '',
    }),
    [o],
  )
  const { draft, set, dirty, reset } = useDraft(initial, o.updated_at)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['crm', 'opportunity', o.id] })
    qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
    qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
  }

  async function salvar() {
    setSaving(true)
    try {
      await updateOpportunity(o.id, {
        titulo: draft.titulo.trim() || o.titulo,
        gmv_estimado: toNumber(draft.gmv_estimado),
        owner_id: draft.owner_id,
        observacoes: toText(draft.observacoes),
      })
      invalidate()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
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
    </section>
  )
}
