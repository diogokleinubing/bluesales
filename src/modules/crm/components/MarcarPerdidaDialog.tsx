import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { setOpportunityOutcome } from '../hooks/useOpportunities'
import { createActivity } from '../hooks/useActivities'

/**
 * Ao marcar uma oportunidade como Perdida: captura motivos (objeções, múltiplos)
 * + comentário, registra os vínculos em entity_objections e gera uma atividade
 * (Nota) no histórico da oportunidade.
 */
export function MarcarPerdidaDialog({
  open,
  onOpenChange,
  opportunityId,
  organizationId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opportunityId: string
  organizationId: string | null
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setSel(new Set()); setComentario('') }
  }, [open])

  const baseQ = useQuery({
    enabled: !!orgId && open,
    queryKey: ['crm', 'objections-base', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('objections')
        .select('id, titulo, categoria')
        .eq('org_id', orgId!)
        .order('titulo')
      return data ?? []
    },
  })
  const objs = baseQ.data ?? []
  const motivos = useMemo(
    () => objs.filter((o) => sel.has(o.id)).map((o) => o.titulo),
    [objs, sel],
  )

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function confirmar() {
    if (!orgId || !user?.id) return
    setSaving(true)
    try {
      await setOpportunityOutcome(opportunityId, 'Perdida')

      // Registra os motivos (objeções) vinculados à oportunidade.
      if (sel.size > 0) {
        const rows = [...sel].map((objection_id) => ({
          org_id: orgId,
          objection_id,
          entity_type: 'opportunity',
          entity_id: opportunityId,
          comentario: comentario.trim() || null,
          created_by: user.id,
        }))
        const { error } = await supabase.from('entity_objections').insert(rows)
        if (error) throw new Error(error.message)
      }

      // Atividade no histórico.
      const resumo = [
        motivos.length ? `Motivo(s): ${motivos.join(', ')}.` : null,
        comentario.trim() ? `Comentário: ${comentario.trim()}` : null,
      ].filter(Boolean).join('\n') || null
      await createActivity(orgId, user.id, {
        tipo: 'Nota',
        data_hora: new Date().toISOString(),
        titulo: 'Oportunidade marcada como Perdida',
        resumo,
        organization_id: organizationId,
        opportunity_id: opportunityId,
        participantIds: [],
      })

      qc.invalidateQueries({ queryKey: ['crm', 'opportunity', opportunityId] })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'entity-objections', 'opportunity', opportunityId] })
      onOpenChange(false)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como Perdida</DialogTitle>
          <DialogDescription>Selecione o(s) motivo(s) da perda e, se quiser, deixe um comentário.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Motivos da perda</Label>
            {baseQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : objs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma objeção cadastrada na base.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-auto rounded-md border border-border p-2">
                {objs.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <Checkbox checked={sel.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                    <span>{o.titulo}</span>
                    {o.categoria && <span className="text-xs text-muted-foreground">· {o.categoria}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comentário (opcional)</Label>
            <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={confirmar}
            disabled={saving || (sel.size === 0 && !comentario.trim())}
          >
            {saving ? 'Salvando…' : 'Marcar como Perdida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
