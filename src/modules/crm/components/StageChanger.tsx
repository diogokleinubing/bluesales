import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { StageSelector } from './StageSelector'
import { changeStage, type RelTipo } from '../hooks/useRelacionamento'

/**
 * Seletor de estágio de relacionamento que, ao mudar, pede uma observação e
 * grava a mudança na hora (RPC crm_change_stage → stage_history com comentário).
 * Invalida o feed de histórico e as listagens para refletir imediatamente.
 */
export function StageChanger({
  tipo, entityId, currentStageId, className,
}: {
  tipo: RelTipo
  entityId: string
  currentStageId: string | null
  className?: string
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)

  function cancel() {
    setPending(null)
    setComentario('')
  }

  async function confirm() {
    if (!pending) return
    setSaving(true)
    try {
      await changeStage(tipo, entityId, pending, comentario.trim() || null)
      // Refresca o feed de histórico e as fontes que exibem o estágio.
      for (const key of [
        ['crm', 'history'], ['crm', 'events'], ['crm', 'locais'],
        ['crm', 'organizations'], ['crm', 'organization'],
        ['crm', 'relacionamento'], ['crm', 'kanban'],
      ]) {
        qc.invalidateQueries({ queryKey: key })
      }
      cancel()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StageSelector
        slug="relacionamento"
        value={pending ?? currentStageId}
        onChange={(v) => { if (v && v !== currentStageId) { setPending(v); setComentario('') } }}
        className={className}
      />
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) cancel() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mudar estágio</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Observações (opcional)</Label>
            <Textarea
              value={comentario}
              autoFocus
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Detalhe o motivo da mudança de estágio…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">Fica registrada como nota nesta mudança de histórico.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cancel} disabled={saving}>Cancelar</Button>
            <Button onClick={confirm} disabled={saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
