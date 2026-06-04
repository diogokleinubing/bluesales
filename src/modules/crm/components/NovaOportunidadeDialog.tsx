import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import { CurrencyField } from './EditFields'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { useCrmOrgId, useFunnel } from '../hooks/useFunnelStages'
import { useOrgGmvOptions, useEventGmvOptions } from '../hooks/useCrmLookups'
import { useGmvCopy } from '../hooks/useGmvCopy'
import { createOpportunity } from '../hooks/useOpportunities'

const NONE = '__none__'

export function NovaOportunidadeDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  organizationId?: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const orgOptions = useOrgGmvOptions()
  const eventOptions = useEventGmvOptions()
  const { stages } = useFunnel('oportunidade')
  const ativos = stages.filter((s) => s.ativo)

  const [titulo, setTitulo] = useState('')
  const [org, setOrg] = useState<string | null>(organizationId ?? null)
  const [evento, setEvento] = useState<string>(NONE)
  const [gmv, setGmv] = useState('')
  const [saving, setSaving] = useState(false)
  const { consider, dialog: gmvDialog } = useGmvCopy(gmv, setGmv)

  function onOrgChange(id: string) {
    setOrg(id)
    const o = orgOptions.data?.find((x) => x.id === id)
    if (o) consider(o.gmv, `A organização "${o.nome}"`)
  }
  function onEventChange(id: string) {
    setEvento(id)
    if (id === NONE) return
    const e = eventOptions.data?.find((x) => x.id === id)
    if (e) consider(e.gmv, `O evento "${e.nome}"`)
  }

  async function save() {
    if (!orgId || !user?.id || !titulo.trim() || !org || ativos.length === 0) {
      toast.error('Informe título e organização.')
      return
    }
    setSaving(true)
    try {
      const id = await createOpportunity(orgId, user.id, {
        titulo: titulo.trim(),
        organization_id: org,
        stage_id: ativos[0].id,
        gmv_estimado: gmv ? Number(gmv) : null,
        crm_event_id: evento === NONE ? null : evento,
      })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
      onOpenChange(false)
      setTitulo(''); setGmv(''); setEvento(NONE)
      navigate(`/comercial/oportunidades/${id}`)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Organização</Label>
            <Select value={org ?? ''} onValueChange={onOrgChange} disabled={!!organizationId}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(orgOptions.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Evento (opcional)</Label>
            <Select value={evento} onValueChange={onEventChange}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(eventOptions.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CurrencyField label="GMV estimado" value={gmv} onChange={setGmv} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {gmvDialog}
    </>
  )
}
