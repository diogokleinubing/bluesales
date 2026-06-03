import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useContactSearch, createContact } from '../hooks/useContacts'

export interface PersonPick {
  id: string
  nome: string
}

/**
 * Campo de busca com autocomplete para contatos. Consulta o banco sob demanda
 * (não pré-carrega a lista) e, opcionalmente, permite criar um novo contato
 * com o termo digitado.
 */
export function PersonAutocomplete({
  onPick,
  placeholder = 'Buscar contato…',
  allowCreate = true,
  className,
}: {
  onPick: (p: PersonPick) => void
  placeholder?: string
  allowCreate?: boolean
  className?: string
}) {
  const orgId = useCrmOrgId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const term = query.trim()
  const { data, isLoading } = useContactSearch(query)
  const results = data ?? []
  const exact = results.some((r) => r.nome.toLowerCase() === term.toLowerCase())

  function pick(p: PersonPick) {
    onPick(p)
    setQuery('')
    setOpen(false)
  }

  async function criar() {
    if (!orgId || !term) return
    setCreating(true)
    try {
      const id = await createContact(orgId, term)
      pick({ id, nome: term })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        className="h-9 pl-8"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && term.length >= 1 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>
          ) : (
            <>
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick({ id: r.id, nome: r.nome })}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">{r.nome}</span>
                  {r.cargo && <span className="shrink-0 text-xs text-muted-foreground">{r.cargo}</span>}
                </button>
              ))}
              {results.length === 0 && !allowCreate && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum contato encontrado.</div>
              )}
              {allowCreate && !exact && (
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={criar}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="size-4" /> Criar “{term}”
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
