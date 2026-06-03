import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useCrmOrgId } from '../hooks/useFunnelStages'

type EntityType = 'organization' | 'person' | 'opportunity'

export function ObjecoesTags({
  entityType,
  entityId,
}: {
  entityType: EntityType
  entityId: string
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const [sel, setSel] = useState<string>('')
  const [coment, setComent] = useState('')

  const baseQ = useQuery({
    enabled: !!orgId,
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

  const linkedQ = useQuery({
    enabled: !!entityId,
    queryKey: ['crm', 'entity-objections', entityType, entityId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entity_objections')
        .select('id, comentario, objections(titulo, categoria)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
      return data ?? []
    },
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['crm', 'entity-objections', entityType, entityId] })
  }

  async function add() {
    if (!orgId || !sel) return
    const { error } = await supabase.from('entity_objections').insert({
      org_id: orgId,
      objection_id: sel,
      entity_type: entityType,
      entity_id: entityId,
      comentario: coment.trim() || null,
      created_by: user?.id ?? null,
    })
    if (error) return toast.error('Erro', { description: error.message })
    setSel('')
    setComent('')
    refresh()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('entity_objections').delete().eq('id', id)
    if (error) return toast.error('Erro', { description: error.message })
    refresh()
  }

  if (linkedQ.isLoading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {(linkedQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma objeção registrada.</p>
        )}
        {(linkedQ.data ?? []).map((o) => {
          const obj = o.objections as unknown as { titulo: string; categoria: string | null } | null
          return (
            <div key={o.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{obj?.titulo ?? '—'}</Badge>
                  {obj?.categoria && (
                    <Badge variant="outline" className="text-xs">
                      {obj.categoria}
                    </Badge>
                  )}
                </div>
                <button onClick={() => remove(o.id)}>
                  <X className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
              {o.comentario && <p className="mt-1 text-sm">{o.comentario}</p>}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sel} onValueChange={setSel}>
          <SelectTrigger className="h-9 w-56" size="sm">
            <SelectValue placeholder="Objeção da base…" />
          </SelectTrigger>
          <SelectContent>
            {(baseQ.data ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Comentário (opcional)"
          className="h-9 max-w-xs"
          value={coment}
          onChange={(e) => setComent(e.target.value)}
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={!sel}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
    </div>
  )
}
