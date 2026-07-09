import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useProfile } from '../hooks/useProfile'
import { PersonAutocomplete } from './PersonAutocomplete'
import {
  useEntityContacts, linkPersonToEntity, updateEntityLinkPapel, unlinkEntity,
  type ContatoEntity,
} from '../hooks/usePersonEntities'

const LABEL: Record<ContatoEntity, string> = {
  organization: 'organização',
  local: 'local',
  evento: 'evento',
}

/**
 * Lista e gerencia os contatos (pessoas) vinculados a uma entidade
 * (organização, local ou evento). Buscar ou criar um contato no campo abaixo
 * já cria o vínculo com a entidade atual — sem passo extra de "Vincular".
 */
export function EntityContatos({ entityType, entityId }: { entityType: ContatoEntity; entityId: string }) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { profile } = useProfile()
  const [papel, setPapel] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editPapel, setEditPapel] = useState('')
  const q = useEntityContacts(entityType, entityId)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'entity-contacts', entityType, entityId] })
    qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
  }

  async function vincular(p: { id: string; nome: string }) {
    if (!tenantOrgId) return
    // Evita duplicar um contato que já está vinculado a esta entidade.
    if ((q.data ?? []).some((c) => c.person_id === p.id)) {
      toast.info('Este contato já está vinculado.')
      setPapel('')
      return
    }
    try {
      await linkPersonToEntity(tenantOrgId, entityType, entityId, p.id, papel, profile?.id)
      setPapel('')
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function salvarPapel(id: string) {
    try {
      await updateEntityLinkPapel(id, editPapel)
      setEditId(null)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function remover(id: string) {
    try {
      await unlinkEntity(id)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (q.isLoading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-3">
      {(q.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum contato vinculado.</p>
      )}
      {(q.data ?? []).map((c) => {
        const editing = editId === c.id
        return (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <Link to={`/comercial/contatos/${c.person_id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                {c.nome}
                {c.stageNome && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: c.stageCor ?? 'var(--muted-foreground)' }} />
                    {c.stageNome}
                  </span>
                )}
              </Link>
              {editing ? (
                <Input
                  className="mt-1 h-8 max-w-56"
                  placeholder="Papel"
                  value={editPapel}
                  autoFocus
                  onChange={(e) => setEditPapel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarPapel(c.id)
                    if (e.key === 'Escape') setEditId(null)
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground">
                  {[c.papel, c.email, c.telefone].filter(Boolean).join(' · ') || '—'}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {editing ? (
                <>
                  <button onClick={() => salvarPapel(c.id)} className="text-muted-foreground hover:text-foreground" title="Salvar">
                    <Check className="size-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditId(c.id); setEditPapel(c.papel ?? '') }}
                    className="text-muted-foreground hover:text-foreground"
                    title="Editar papel"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => remover(c.id)} className="text-muted-foreground hover:text-destructive" title="Remover vínculo">
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Papel (opcional)" className="h-9 max-w-40" value={papel} onChange={(e) => setPapel(e.target.value)} />
          <PersonAutocomplete
            className="w-full sm:w-56"
            placeholder="Buscar ou criar contato…"
            onPick={vincular}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Buscar ou criar um contato já vincula a este {LABEL[entityType]}.
        </p>
      </div>
    </div>
  )
}
