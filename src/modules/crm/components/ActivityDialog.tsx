import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { createActivity, type ActivityTipo } from '../hooks/useActivities'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  useOrgOptions,
  usePersonOptions,
  useOppOptions,
} from '../hooks/useCrmLookups'

const TIPOS: ActivityTipo[] = ['Reunião', 'Ligação', 'Email', 'WhatsApp', 'Nota', 'Outro']
const NONE = '__none__'

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/** Dialog de nova atividade. Pode pré-vincular org/oportunidade. */
export function ActivityDialog({
  open,
  onOpenChange,
  organizationId,
  opportunityId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  organizationId?: string
  opportunityId?: string
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const orgOptions = useOrgOptions()
  const personOptions = usePersonOptions()

  const [tipo, setTipo] = useState<ActivityTipo>('Reunião')
  const [dataHora, setDataHora] = useState(nowLocal())
  const [titulo, setTitulo] = useState('')
  const [orgSel, setOrgSel] = useState<string | null>(organizationId ?? null)
  const [oppSel, setOppSel] = useState<string | null>(opportunityId ?? null)
  const [parts, setParts] = useState<Set<string>>(new Set())
  const [resumo, setResumo] = useState('')
  const [transcricao, setTranscricao] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const oppOptions = useOppOptions(orgSel)
  const persons = personOptions.data ?? []

  function reset() {
    setTipo('Reunião')
    setDataHora(nowLocal())
    setTitulo('')
    setOrgSel(organizationId ?? null)
    setOppSel(opportunityId ?? null)
    setParts(new Set())
    setResumo('')
    setTranscricao('')
    setFile(null)
  }

  async function handleSave() {
    if (!orgId || !user?.id || !titulo.trim()) {
      toast.error('Informe ao menos o título.')
      return
    }
    setSaving(true)
    try {
      let fileUrl: string | null = null
      if (file) {
        const ext = file.name.split('.').pop() ?? 'bin'
        const path = `${orgId}/${Date.now()}-${Math.round(
          performance.now(),
        )}.${ext}`
        const up = await supabase.storage
          .from('transcricoes')
          .upload(path, file, { upsert: false })
        if (up.error) throw new Error(up.error.message)
        fileUrl = supabase.storage.from('transcricoes').getPublicUrl(path)
          .data.publicUrl
      }
      await createActivity(orgId, user.id, {
        tipo,
        data_hora: new Date(dataHora).toISOString(),
        titulo: titulo.trim(),
        resumo: resumo.trim() || null,
        transcricao: transcricao.trim() || null,
        transcricao_file_url: fileUrl,
        organization_id: orgSel,
        opportunity_id: oppSel,
        participantIds: [...parts],
      })
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'painel-resumo'] })
      toast.success('Atividade registrada')
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar atividade</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
          <Field label="Tipo">
            <Select value={tipo} onValueChange={(v) => setTipo(v as ActivityTipo)}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data/hora">
            <Input
              type="datetime-local"
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              className="h-9"
            />
          </Field>

          <div className="col-span-2">
            <Field label="Título">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Field>
          </div>

          <Field label="Organização">
            <Select
              value={orgSel ?? NONE}
              onValueChange={(v) => {
                setOrgSel(v === NONE ? null : v)
                setOppSel(null)
              }}
              disabled={!!organizationId}
            >
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(orgOptions.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Oportunidade">
            <Select
              value={oppSel ?? NONE}
              onValueChange={(v) => setOppSel(v === NONE ? null : v)}
              disabled={!orgSel || !!opportunityId}
            >
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(oppOptions.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Participantes</Label>
            <Select
              value=""
              onValueChange={(v) =>
                setParts((p) => new Set(p).add(v))
              }
            >
              <SelectTrigger className="mt-1 h-9" size="sm">
                <SelectValue placeholder="Adicionar contato…" />
              </SelectTrigger>
              <SelectContent>
                {persons
                  .filter((p) => !parts.has(p.id))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {parts.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[...parts].map((pid) => {
                  const p = persons.find((x) => x.id === pid)
                  return (
                    <Badge key={pid} variant="secondary" className="gap-1">
                      {p?.nome ?? pid}
                      <button
                        onClick={() =>
                          setParts((prev) => {
                            const n = new Set(prev)
                            n.delete(pid)
                            return n
                          })
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <Field label="Resumo">
              <Textarea
                rows={2}
                value={resumo}
                onChange={(e) => setResumo(e.target.value)}
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Transcrição">
              <Textarea
                rows={4}
                value={transcricao}
                onChange={(e) => setTranscricao(e.target.value)}
                placeholder="Cole a transcrição (markdown simples)…"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">
              Arquivo de transcrição (PDF/DOCX)
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="h-9"
              />
              {file && (
                <Badge variant="secondary" className="gap-1">
                  <Upload className="size-3" />
                  {file.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
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
