import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { StageSelector } from '../components/StageSelector'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ActivityDialog } from '../components/ActivityDialog'
import { ObjecoesTags } from '../components/ObjecoesTags'
import { AuditLog } from '../components/AuditLog'
import {
  TextField, SelectField, TextareaField, FormActions, useDraft, toText, toNumber,
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
  const [actOpen, setActOpen] = useState(false)

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
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/comercial/oportunidades')}>
        <ArrowLeft className="size-4" /> Oportunidades
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{o.titulo}</h1>
        {canEdit(profile, o.owner_id) && (
          <DeleteEntityButton
            title="Excluir oportunidade?"
            description={`Esta ação remove "${o.titulo}". As atividades e tarefas são preservadas (apenas desvinculadas). Não pode ser desfeita.`}
            onDelete={() => deleteOpportunity(o.id)}
            onDeleted={() => navigate('/comercial/oportunidades')}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="visao">
          <TabsList>
            <TabsTrigger value="visao">Visão geral</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="objecoes">Objeções</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="visao" className="mt-4">
            <OppVisaoGeral
              o={o}
              isGestor={profile?.role === 'gestor'}
              profiles={profilesQ.data ?? []}
            />
          </TabsContent>

          <TabsContent value="atividades" className="mt-4 space-y-3">
            <Button onClick={() => setActOpen(true)}><Plus className="size-4" /> Registrar atividade</Button>
            <ActivityTimeline filter={{ opportunityId: o.id }} />
          </TabsContent>

          <TabsContent value="objecoes" className="mt-4">
            <ObjecoesTags entityType="opportunity" entityId={o.id} />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <AuditLog entityType="opportunity" entityId={o.id} />
          </TabsContent>
        </Tabs>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Vínculos</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
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
            </CardContent>
          </Card>
        </div>
      </div>

      <ActivityDialog open={actOpen} onOpenChange={setActOpen} organizationId={o.organization_id} opportunityId={o.id} />
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
      gmv_estimado: o.gmv_estimado != null ? String(o.gmv_estimado) : '',
      probabilidade: o.probabilidade != null ? String(o.probabilidade) : '0',
      data_prevista_fechamento: o.data_prevista_fechamento ?? '',
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
        probabilidade: toNumber(draft.probabilidade),
        data_prevista_fechamento: draft.data_prevista_fechamento || null,
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
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Título" value={draft.titulo} onChange={(v) => set('titulo', v)} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estágio</Label>
            <StageSelector slug="oportunidade" value={o.stage_id} onChange={setStage} allowNone={false} className="h-8 w-full" />
          </div>
          <TextField label="GMV estimado" type="number" value={draft.gmv_estimado} onChange={(v) => set('gmv_estimado', v)} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Probabilidade: {draft.probabilidade || 0}%</Label>
            <input
              type="range" min={0} max={100} step={5}
              value={draft.probabilidade || '0'}
              onChange={(e) => set('probabilidade', e.target.value)}
              className="w-full"
            />
          </div>
          <TextField label="Data prevista de fechamento" type="date" value={draft.data_prevista_fechamento} onChange={(v) => set('data_prevista_fechamento', v)} />
          {isGestor && (
            <SelectField
              label="Responsável"
              value={draft.owner_id}
              includeNone={false}
              options={profiles.map((p) => ({ value: p.id, label: p.nome ?? p.id }))}
              onChange={(v) => set('owner_id', v)}
            />
          )}
          <div className="col-span-2">
            <TextareaField label="Observações" value={draft.observacoes} onChange={(v) => set('observacoes', v)} />
          </div>
        </div>
        <FormActions dirty={dirty} saving={saving} onSave={salvar} onCancel={reset} />
      </CardContent>
    </Card>
  )
}
