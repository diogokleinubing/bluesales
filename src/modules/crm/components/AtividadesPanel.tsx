import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, Phone, Mail, MessageCircle, StickyNote, CircleDot,
  ShieldQuestion, FileText, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { useProfile } from '../hooks/useProfile'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useActivities, createActivity, type ActivityTipo } from '../hooks/useActivities'
import { useObjectionsBase } from '../hooks/useConfigCadastros'

type Tipo = ActivityTipo | 'Objeção'

const TYPES: { tipo: Tipo; icon: LucideIcon }[] = [
  { tipo: 'Nota', icon: StickyNote },
  { tipo: 'Reunião', icon: Users },
  { tipo: 'Ligação', icon: Phone },
  { tipo: 'Email', icon: Mail },
  { tipo: 'WhatsApp', icon: MessageCircle },
  { tipo: 'Objeção', icon: ShieldQuestion },
  { tipo: 'Outro', icon: CircleDot },
]
const ICON: Record<string, LucideIcon> = Object.fromEntries(TYPES.map((t) => [t.tipo, t.icon]))

function dt(s: string) {
  const d = new Date(s)
  return `${fmtDate(d)} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export interface AtividadesPanelProps {
  entityType: 'organization' | 'person' | 'opportunity'
  entityId: string
  organizationId?: string
  opportunityId?: string
}

/** Composer (atividade por tipo, incluindo Objeção) + timeline única. */
export function AtividadesPanel({ entityType, entityId, organizationId, opportunityId }: AtividadesPanelProps) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { profile } = useProfile()
  const base = useObjectionsBase()

  const [tipo, setTipo] = useState<Tipo>('Nota')
  const [resumo, setResumo] = useState('')
  const [objSel, setObjSel] = useState('')
  const [saving, setSaving] = useState(false)

  const acts = useActivities(
    entityType === 'opportunity'
      ? { opportunityId: entityId }
      : entityType === 'person'
        ? { personId: entityId }
        : { organizationId: entityId },
  )

  const objs = useQuery({
    queryKey: ['crm', 'timeline-objections', entityType, entityId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entity_objections')
        .select('id, comentario, created_at, created_by, objections(titulo, categoria)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const timeline = useMemo(() => {
    const items: {
      key: string; at: string; tipo: string; icon: LucideIcon
      titulo: string; resumo?: string | null; author?: string | null
      fileUrl?: string | null; categoria?: string | null
    }[] = []
    for (const a of acts.data ?? []) {
      items.push({
        key: `a-${a.id}`, at: a.data_hora, tipo: a.tipo ?? 'Outro',
        icon: ICON[a.tipo ?? 'Outro'] ?? CircleDot,
        titulo: a.titulo, resumo: a.resumo, author: a.author,
        fileUrl: a.transcricao_file_url,
      })
    }
    for (const o of objs.data ?? []) {
      const obj = o.objections as unknown as { titulo: string; categoria: string | null } | null
      items.push({
        key: `o-${o.id}`, at: o.created_at, tipo: 'Objeção', icon: ShieldQuestion,
        titulo: obj?.titulo ?? 'Objeção', resumo: o.comentario, categoria: obj?.categoria ?? null,
      })
    }
    return items.sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [acts.data, objs.data])

  function refresh() {
    qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
    qc.invalidateQueries({ queryKey: ['crm', 'timeline-objections', entityType, entityId] })
  }

  async function registrar() {
    if (!tenantOrgId || !profile?.id) return
    setSaving(true)
    try {
      if (tipo === 'Objeção') {
        if (!objSel) { setSaving(false); return }
        const { error } = await supabase.from('entity_objections').insert({
          org_id: tenantOrgId, objection_id: objSel, entity_type: entityType,
          entity_id: entityId, comentario: resumo.trim() || null, created_by: profile.id,
        })
        if (error) throw new Error(error.message)
      } else {
        await createActivity(tenantOrgId, profile.id, {
          tipo,
          data_hora: new Date().toISOString(),
          titulo: tipo,
          resumo: resumo.trim() || null,
          organization_id: organizationId ?? (entityType === 'organization' ? entityId : null),
          opportunity_id: opportunityId ?? (entityType === 'opportunity' ? entityId : null),
          participantIds: [],
        })
      }
      setResumo(''); setObjSel('')
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = tipo === 'Objeção' ? !!objSel : resumo.trim().length > 0

  return (
    <div className="space-y-4">
      {/* Composer */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap gap-1">
            {TYPES.map((t) => {
              const on = tipo === t.tipo
              return (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => setTipo(t.tipo)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
                  )}
                >
                  <t.icon className="size-3.5" /> {t.tipo}
                </button>
              )
            })}
          </div>

          {tipo === 'Objeção' && (
            <Select value={objSel} onValueChange={setObjSel}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a objeção…" /></SelectTrigger>
              <SelectContent>
                {(base.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.titulo}{o.categoria ? ` · ${o.categoria}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            placeholder={tipo === 'Objeção' ? 'Comentário sobre a objeção…' : `Escreva ${tipo === 'Nota' ? 'a nota' : 'o resumo'}…`}
            className="min-h-[72px]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={registrar} disabled={!canSubmit || saving}>
              {saving ? 'Registrando…' : `Registrar ${tipo.toLowerCase()}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {acts.isLoading || objs.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : timeline.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map((it) => {
            const Icon = it.icon
            return (
              <li key={it.key} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{it.titulo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{dt(it.at)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary">{it.tipo}</Badge>
                    {it.categoria && <Badge variant="outline" className="text-xs">{it.categoria}</Badge>}
                    {it.author && <span>· {it.author}</span>}
                    {it.fileUrl && (
                      <a href={it.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText className="size-3" /> transcrição
                      </a>
                    )}
                  </div>
                  {it.resumo && <p className="mt-2 whitespace-pre-wrap text-sm">{it.resumo}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
