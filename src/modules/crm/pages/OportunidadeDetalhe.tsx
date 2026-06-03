import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { StageSelector } from '../components/StageSelector'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ActivityDialog } from '../components/ActivityDialog'
import { ObjecoesTags } from '../components/ObjecoesTags'
import { AuditLog } from '../components/AuditLog'
import { useProfile } from '../hooks/useProfile'
import { useOpportunity, updateOpportunity, type Opportunity } from '../hooks/useOpportunities'
import { fmtBRL } from '@/lib/format'

export function OportunidadeDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
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

  async function save(patch: Partial<Opportunity>) {
    if (!id) return
    try {
      await updateOpportunity(id, patch)
      qc.invalidateQueries({ queryKey: ['crm', 'opportunity', id] })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!o) return <p className="text-muted-foreground">Oportunidade não encontrada.</p>

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/comercial/oportunidades')}>
        <ArrowLeft className="size-4" /> Oportunidades
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">{o.titulo}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="visao">
          <TabsList>
            <TabsTrigger value="visao">Visão geral</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="objecoes">Objeções</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="visao" className="mt-4">
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <FText label="Título" value={o.titulo} onSave={(v) => save({ titulo: v ?? o.titulo })} />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Estágio</Label>
                  <StageSelector slug="oportunidade" value={o.stage_id} onChange={(s) => s && save({ stage_id: s })} allowNone={false} className="h-8 w-full" />
                </div>
                <FNum label="GMV estimado" value={o.gmv_estimado} onSave={(v) => save({ gmv_estimado: v })} />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Probabilidade: {o.probabilidade ?? 0}%</Label>
                  <input
                    type="range" min={0} max={100} step={5}
                    defaultValue={o.probabilidade ?? 0}
                    onMouseUp={(e) => save({ probabilidade: Number((e.target as HTMLInputElement).value) })}
                    onTouchEnd={(e) => save({ probabilidade: Number((e.target as HTMLInputElement).value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data prevista de fechamento</Label>
                  <Input type="date" className="h-8" defaultValue={o.data_prevista_fechamento ?? ''} onBlur={(e) => save({ data_prevista_fechamento: e.target.value || null })} />
                </div>
                {profile?.role === 'gestor' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Responsável</Label>
                    <select
                      className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
                      value={o.owner_id}
                      onChange={(e) => save({ owner_id: e.target.value })}
                    >
                      {(profilesQ.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Observações</Label>
                  <Input className="h-8" defaultValue={o.observacoes ?? ''} onBlur={(e) => save({ observacoes: e.target.value || null })} />
                </div>
              </CardContent>
            </Card>
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

function FText({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? '')
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="h-8" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v.trim() || null)} />
    </div>
  )
}

function FNum({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value != null ? String(value) : '')
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" className="h-8" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value != null ? String(value) : '') && onSave(v ? Number(v) : null)} />
    </div>
  )
}
