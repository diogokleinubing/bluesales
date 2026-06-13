import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCrmOrgId, useFunnel } from '@/modules/crm/hooks/useFunnelStages'
import { createOrganization } from '@/modules/crm/hooks/useOrganizations'
import { linkLocalToOrg } from '@/modules/crm/hooks/useCadastros'

/** Após adicionar um local ao Comercial, pergunta se deseja criar uma
 *  organização vinculada e em qual estágio do funil de relacionamento. */
export function CriarOrgVinculadaDialog({
  open,
  onOpenChange,
  localId,
  localNome,
  cidade,
  uf,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  localId: string | null
  localNome: string
  cidade: string | null
  uf: string | null
}) {
  const orgId = useCrmOrgId()
  const qc = useQueryClient()
  const { stages } = useFunnel('relacionamento')
  const ativos = stages.filter((s) => s.ativo)
  const [stageSel, setStageSel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setStageSel('') }, [open])

  async function criar() {
    if (!orgId || !localId || !stageSel) return
    setSaving(true)
    try {
      const id = await createOrganization(orgId, {
        nome: localNome,
        cidade: cidade || null,
        uf: uf || null,
        funil_stage_id: stageSel,
      })
      await linkLocalToOrg(orgId, id, localId)
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      toast.success('Organização criada e vinculada ao local', { description: localNome })
      onOpenChange(false)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar organização vinculada?</DialogTitle>
          <DialogDescription>
            Deseja criar uma organização vinculada ao local “{localNome}”? Escolha o estágio do funil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estágio do funil</Label>
          <Select value={stageSel} onValueChange={setStageSel}>
            <SelectTrigger><SelectValue placeholder="Selecione o estágio…" /></SelectTrigger>
            <SelectContent>
              {ativos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Não, obrigado</Button>
          <Button onClick={criar} disabled={saving || !stageSel}>{saving ? 'Criando…' : 'Criar organização'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
