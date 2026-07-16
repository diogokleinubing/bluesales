import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useProfile } from '../hooks/useProfile'
import { PersonAutocomplete } from './PersonAutocomplete'
import {
  useEntityContacts, linkPersonToEntity, updateEntityLinkPapel, unlinkEntity,
  type ContatoEntity,
} from '../hooks/usePersonEntities'

/**
 * Contatos (pessoas) vinculados a uma entidade. Linhas compactas (nome + papel);
 * adicionar via botão "+" que revela o campo de busca (buscar/criar já vincula).
 */
export function EntityContatos({ entityType, entityId, title = 'Contatos' }: { entityType: ContatoEntity; entityId: string; title?: string }) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { profile } = useProfile()
  const [papel, setPapel] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editPapel, setEditPapel] = useState('')
  const q = useEntityContacts(entityType, entityId)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'entity-contacts', entityType, entityId] })
    qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
  }

  async function vincular(p: { id: string; nome: string }) {
    if (!tenantOrgId) return
    if ((q.data ?? []).some((c) => c.person_id === p.id)) {
      toast.info('Este contato já está vinculado.')
      setPapel('')
      return
    }
    try {
      await linkPersonToEntity(tenantOrgId, entityType, entityId, p.id, papel, profile?.id)
      setPapel('')
      setAdding(false)
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

  if (q.isLoading) return <Skeleton className="h-12 w-full" />
  const contatos = q.data ?? []

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          title="Adicionar contato"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {contatos.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Nenhum contato vinculado</p>
      )}
      {contatos.map((c) => {
        const editing = editId === c.id
        return (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Link to={`/comercial/contatos/${c.person_id}`} className="truncate text-sm font-medium hover:underline">{c.nome}</Link>
              {editing ? (
                <Input
                  className="h-7 max-w-40"
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
                c.papel && <span className="shrink-0 truncate text-xs text-muted-foreground">· {c.papel}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {editing ? (
                <>
                  <button onClick={() => salvarPapel(c.id)} className="text-muted-foreground hover:text-foreground" title="Salvar"><Check className="size-4" /></button>
                  <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground" title="Cancelar"><X className="size-4" /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditId(c.id); setEditPapel(c.papel ?? '') }} className="text-muted-foreground hover:text-foreground" title="Editar papel"><Pencil className="size-3.5" /></button>
                  <button onClick={() => remover(c.id)} className="text-muted-foreground hover:text-destructive" title="Remover vínculo"><Trash2 className="size-3.5" /></button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
          <Input placeholder="Papel (opcional)" className="h-8 max-w-32" value={papel} onChange={(e) => setPapel(e.target.value)} />
          <PersonAutocomplete className="w-full sm:w-52" placeholder="Buscar ou criar contato…" onPick={vincular} />
          <button onClick={() => { setAdding(false); setPapel('') }} className="text-muted-foreground hover:text-foreground" title="Fechar"><X className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
