import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, Phone, Mail, MessageCircle, StickyNote, CircleDot,
  ShieldQuestion, CheckSquare, FileText, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { DateTime15 } from './DateTime15'
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
  { tipo: 'Tarefa', icon: CheckSquare },
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

// Default da data/hora: hoje às 09:00 (local). Minutos só em passos de 15.
function defaultDataHora() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}T09:00`
}

// Arredonda os minutos de um "YYYY-MM-DDTHH:mm" para o múltiplo de 15 mais
// próximo (o step do input não impede a digitação de minutos quebrados).
function snap15(v: string): string {
  if (!v) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Nota e Objeção são registros do momento; os demais tipos têm data (e quando
// futura viram um agendamento).
const SEM_DATA: Tipo[] = ['Nota', 'Objeção']

export interface AtividadesPanelProps {
  entityType: 'organization' | 'person' | 'opportunity' | 'local' | 'evento'
  entityId: string
  organizationId?: string
  opportunityId?: string
  /** Exibir "Objeção" como tipo de atividade (org/oportunidade sim, contato não). */
  allowObjection?: boolean
}

/** Composer (atividade por tipo, incluindo Objeção) + timeline única. */
export function AtividadesPanel({
  entityType, entityId, organizationId, opportunityId, allowObjection = true,
}: AtividadesPanelProps) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { profile } = useProfile()
  const base = useObjectionsBase()
  const types = allowObjection ? TYPES : TYPES.filter((t) => t.tipo !== 'Objeção')

  const [tipo, setTipo] = useState<Tipo>('Nota')
  const [resumo, setResumo] = useState('')
  const [objSel, setObjSel] = useState('')
  const [dataHora, setDataHora] = useState(defaultDataHora())
  const [semData, setSemData] = useState(false)
  const [saving, setSaving] = useState(false)

  const temData = !SEM_DATA.includes(tipo)
  // Data futura = agendamento (margem de 1 min para o "agora" do default).
  const agendamento = temData && !semData && new Date(dataHora).getTime() > Date.now() + 60_000

  const acts = useActivities(
    entityType === 'opportunity'
      ? { opportunityId: entityId }
      : entityType === 'person'
        ? { personId: entityId }
        : entityType === 'local'
          ? { localId: entityId }
          : entityType === 'evento'
            ? { crmEventId: entityId }
            : { organizationId: entityId },
  )

  const objs = useQuery({
    enabled: allowObjection,
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
      key: string; at: string | null; tipo: string; icon: LucideIcon
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
    // Sem data (To-Do) primeiro; depois por data desc.
    return items.sort((a, b) => ((a.at ?? '9999') < (b.at ?? '9999') ? 1 : -1))
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
          data_hora: temData ? (semData ? null : new Date(snap15(dataHora)).toISOString()) : new Date().toISOString(),
          titulo: agendamento ? `${tipo} (agendada)` : tipo,
          resumo: resumo.trim() || null,
          organization_id: organizationId ?? (entityType === 'organization' ? entityId : null),
          opportunity_id: opportunityId ?? (entityType === 'opportunity' ? entityId : null),
          local_id: entityType === 'local' ? entityId : null,
          crm_event_id: entityType === 'evento' ? entityId : null,
          participantIds: [],
        })
      }
      setResumo(''); setObjSel(''); setDataHora(defaultDataHora()); setSemData(false)
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
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap gap-1">
            {types.map((t) => {
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

          {temData && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={semData} onCheckedChange={(v) => setSemData(v === true)} /> Sem data (a fazer)
              </label>
              {!semData && (
                <>
                  <Label className="text-xs text-muted-foreground">Data/hora</Label>
                  <DateTime15 value={dataHora} onChange={setDataHora} />
                  {agendamento && (
                    <Badge variant="outline" className="border-[var(--warning)] text-[var(--warning)]">Agendamento</Badge>
                  )}
                </>
              )}
            </div>
          )}

          <Textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            placeholder={tipo === 'Objeção' ? 'Comentário sobre a objeção…' : `Escreva ${tipo === 'Nota' ? 'a nota' : 'o resumo'}…`}
            className="min-h-[72px]"
          />
        <div className="flex justify-end">
          <Button size="sm" onClick={registrar} disabled={!canSubmit || saving}>
            {saving ? 'Registrando…' : agendamento ? `Agendar ${tipo.toLowerCase()}` : `Registrar ${tipo.toLowerCase()}`}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {acts.isLoading || objs.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : timeline.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map((it) => {
            const Icon = it.icon
            const futura = !!it.at && new Date(it.at).getTime() > Date.now()
            return (
              <li key={it.key} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{it.titulo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{it.at ? dt(it.at) : 'Sem data'}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary">{it.tipo}</Badge>
                    {futura && <Badge variant="outline" className="border-[var(--warning)] text-[var(--warning)]">Agendado</Badge>}
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
