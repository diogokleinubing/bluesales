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
import { useOrgOptions } from '../hooks/useCrmLookups'
import { createOpportunity } from '../hooks/useOpportunities'

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
  const orgOptions = useOrgOptions()
  const { stages } = useFunnel('oportunidade')
  const ativos = stages.filter((s) => s.ativo)

  const [titulo, setTitulo] = useState('')
  const [org, setOrg] = useState<string | null>(organizationId ?? null)
  const [gmv, setGmv] = useState('')
  const [saving, setSaving] = useState(false)

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
      })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      onOpenChange(false)
      setTitulo('')
      setGmv('')
      navigate(`/comercial/oportunidades/${id}`)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
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
            <Select
              value={org ?? ''}
              onValueChange={setOrg}
              disabled={!!organizationId}
            >
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(orgOptions.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
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
          <Button onClick={save} disabled={saving}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
