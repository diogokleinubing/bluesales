import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, X, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { DateTime15 } from './DateTime15'
import { EntityAutocomplete, type Lookup } from './EntityAutocomplete'
import { DeleteEntityButton } from './DeleteEntityButton'
import {
  createActivity, updateActivity, deleteActivity, type ActivityTipo, type ActivityRow, type NewActivity,
} from '../hooks/useActivities'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  usePersonOptions, useEntities, findOpenOpportunity,
  type EntityOption, type EntityTipo, type OpenOpp,
} from '../hooks/useCrmLookups'

const TIPOS: ActivityTipo[] = ['Reunião', 'Ligação', 'Email', 'WhatsApp', 'Nota', 'Tarefa', 'Outro']
const TIPO_LABEL: Record<EntityTipo, string> = { org: 'Organização', local: 'Local', evento: 'Evento', artista: 'Atração' }

function defaultDataHora() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`
}
function toLocalInput(iso: string): string {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function snap15(v: string): string {
  if (!v) return v
  const d = new Date(v); if (Number.isNaN(d.getTime())) return v
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function entityFromActivity(a: ActivityRow): EntityOption | null {
  if (a.artist_id) return { tipo: 'artista', id: a.artist_id, nome: a.artist?.nome ?? '—', organization_id: a.organization_id }
  if (a.crm_event_id) return { tipo: 'evento', id: a.crm_event_id, nome: a.event?.nome ?? '—', organization_id: a.organization_id }
  if (a.local_id) return { tipo: 'local', id: a.local_id, nome: a.local?.nome ?? '—', organization_id: a.organization_id }
  if (a.organization_id) return { tipo: 'org', id: a.organization_id, nome: a.organization?.nome ?? '—', organization_id: a.organization_id }
  return null
}

/** Dialog de nova/edição de atividade. */
export function ActivityDialog({
  open, onOpenChange, organizationId, opportunityId, activity, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  organizationId?: string
  opportunityId?: string
  activity?: ActivityRow
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const entitiesQ = useEntities()
  const personOptions = usePersonOptions()
  const persons = personOptions.data ?? []
  const editing = !!activity

  const [tipo, setTipo] = useState<ActivityTipo>('Reunião')
  const [dataHora, setDataHora] = useState(defaultDataHora())
  const [semData, setSemData] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [entity, setEntity] = useState<EntityOption | null>(null)
  const [openOpp, setOpenOpp] = useState<OpenOpp | null>(null)
  const [oppLoading, setOppLoading] = useState(false)
  const [linkOpp, setLinkOpp] = useState(true)
  const [parts, setParts] = useState<Set<string>>(new Set())
  const [resumo, setResumo] = useState('')
  const [transcricao, setTranscricao] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const decode = useMemo(
    () => new Map((entitiesQ.data ?? []).map((e) => [`${e.tipo}:${e.id}`, e])),
    [entitiesQ.data],
  )
  const entOptions: Lookup[] = (entitiesQ.data ?? []).map((e) => ({ id: `${e.tipo}:${e.id}`, nome: `${TIPO_LABEL[e.tipo]} · ${e.nome}` }))
  const entityPick: Lookup | null = entity ? { id: `${entity.tipo}:${entity.id}`, nome: `${TIPO_LABEL[entity.tipo]} · ${entity.nome}` } : null

  async function loadOpp(e: EntityOption, currentOppId: string | null) {
    setOppLoading(true)
    try {
      const opp = await findOpenOpportunity(e.tipo, e.id, e.organization_id)
      setOpenOpp(opp)
      setLinkOpp(currentOppId ? true : !!opp)
    } catch { setOpenOpp(null) }
    finally { setOppLoading(false) }
  }

  // Inicializa ao abrir (edição prefilha; criação reseta).
  useEffect(() => {
    if (!open) return
    if (activity) {
      setTipo(activity.tipo ?? 'Reunião')
      if (activity.data_hora) { setSemData(false); setDataHora(toLocalInput(activity.data_hora)) }
      else { setSemData(true); setDataHora(defaultDataHora()) }
      setTitulo(activity.titulo)
      setResumo(activity.resumo ?? ''); setTranscricao(activity.transcricao ?? ''); setFile(null)
      setParts(new Set((activity.participants ?? []).map((p) => p.person_id)))
      const ent = entityFromActivity(activity)
      setEntity(ent); setOpenOpp(null); setLinkOpp(!!activity.opportunity_id)
      if (ent) void loadOpp(ent, activity.opportunity_id ?? null)
    } else {
      setTipo('Reunião'); setDataHora(defaultDataHora()); setSemData(false)
      setTitulo(''); setResumo(''); setTranscricao(''); setFile(null); setParts(new Set())
      setEntity(null); setOpenOpp(null); setLinkOpp(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id])

  // Pré-seleciona a organização vinda por prop (ex.: aberto do detalhe da org).
  useEffect(() => {
    if (!open || activity || entity || !organizationId) return
    const e = (entitiesQ.data ?? []).find((x) => x.tipo === 'org' && x.id === organizationId)
    if (e) { setEntity(e); void loadOpp(e, opportunityId ?? null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, entitiesQ.data])

  function pickEntity(l: Lookup | null) {
    const e = l ? decode.get(l.id) ?? null : null
    setEntity(e); setOpenOpp(null)
    if (e) void loadOpp(e, null)
  }

  async function handleSave() {
    if (!orgId || !user?.id || !titulo.trim()) { toast.error('Informe ao menos o título.'); return }
    setSaving(true)
    try {
      let fileUrl: string | null = activity?.transcricao_file_url ?? null
      if (file) {
        const ext = file.name.split('.').pop() ?? 'bin'
        const path = `${orgId}/${Date.now()}-${Math.round(performance.now())}.${ext}`
        const up = await supabase.storage.from('transcricoes').upload(path, file, { upsert: false })
        if (up.error) throw new Error(up.error.message)
        fileUrl = supabase.storage.from('transcricoes').getPublicUrl(path).data.publicUrl
      }
      const orgResolved = entity?.tipo === 'org' ? entity.id : (entity?.organization_id ?? openOpp?.organization_id ?? null)
      const payload: NewActivity = {
        tipo,
        data_hora: semData ? null : new Date(snap15(dataHora)).toISOString(),
        titulo: titulo.trim(),
        resumo: resumo.trim() || null,
        transcricao: transcricao.trim() || null,
        transcricao_file_url: fileUrl,
        organization_id: orgResolved,
        opportunity_id: (linkOpp && openOpp) ? openOpp.id : null,
        local_id: entity?.tipo === 'local' ? entity.id : null,
        crm_event_id: entity?.tipo === 'evento' ? entity.id : null,
        artist_id: entity?.tipo === 'artista' ? entity.id : null,
        participantIds: [...parts],
        ...(editing ? { realizada: activity!.realizada } : {}),
      }
      if (editing) await updateActivity(activity!.id, payload)
      else await createActivity(orgId, user.id, payload)
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'painel-resumo'] })
      toast.success(editing ? 'Atividade atualizada' : 'Atividade registrada')
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar atividade' : 'Registrar atividade'}</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
          <Field label="Tipo">
            <Select value={tipo} onValueChange={(v) => setTipo(v as ActivityTipo)}>
              <SelectTrigger className="h-9" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Data/hora (opcional)">
            <label className="mb-1.5 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={semData} onCheckedChange={(v) => setSemData(v === true)} /> Sem data (a fazer)
            </label>
            {!semData && <DateTime15 value={dataHora} onChange={setDataHora} />}
          </Field>

          <div className="col-span-2">
            <Field label="Título">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="Buscar entidade (Organização, Evento, Local, Atração)">
              <EntityAutocomplete value={entityPick} onPick={pickEntity} options={entOptions} placeholder="Digite para buscar…" />
            </Field>
          </div>

          {entity && (oppLoading ? (
            <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Verificando oportunidades…</div>
          ) : openOpp ? (
            <div className="col-span-2 rounded-md border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox checked={linkOpp} onCheckedChange={(v) => setLinkOpp(v === true)} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Vincular à oportunidade em aberto</span>
                  <span className="block text-xs text-muted-foreground">{openOpp.titulo}{openOpp.stage ? ` · ${openOpp.stage}` : ''}</span>
                </span>
              </label>
            </div>
          ) : null)}

          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Participantes</Label>
            <Select value="" onValueChange={(v) => setParts((p) => new Set(p).add(v))}>
              <SelectTrigger className="mt-1 h-9" size="sm"><SelectValue placeholder="Adicionar contato…" /></SelectTrigger>
              <SelectContent>
                {persons.filter((p) => !parts.has(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {parts.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[...parts].map((pid) => {
                  const p = persons.find((x) => x.id === pid)
                  return (
                    <Badge key={pid} variant="secondary" className="gap-1">
                      {p?.nome ?? pid}
                      <button onClick={() => setParts((prev) => { const n = new Set(prev); n.delete(pid); return n })}><X className="size-3" /></button>
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <Field label="Resumo"><Textarea rows={2} value={resumo} onChange={(e) => setResumo(e.target.value)} /></Field>
          </div>
          <div className="col-span-2">
            <Field label="Transcrição"><Textarea rows={4} value={transcricao} onChange={(e) => setTranscricao(e.target.value)} placeholder="Cole a transcrição (markdown simples)…" /></Field>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Arquivo de transcrição (PDF/DOCX)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9" />
              {file && <Badge variant="secondary" className="gap-1"><Upload className="size-3" />{file.name}</Badge>}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {editing ? (
            <DeleteEntityButton
              title="Remover atividade?"
              description={`"${activity!.titulo}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
              onDelete={() => deleteActivity(activity!.id)}
              onDeleted={() => {
                qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
                onSaved?.(); onOpenChange(false)
              }}
              label="Remover"
            />
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
