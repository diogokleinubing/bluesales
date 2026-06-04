import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  useGlobalSearch,
  SEARCH_GROUP_ORDER,
  searchGroupLabel,
  type SearchHit,
  type SearchKind,
} from '../hooks/useGlobalSearch'

/** Busca ampla do módulo Comercial (orgs, contatos, oportunidades, eventos, locais). */
export function GlobalSearch() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const { data, isFetching } = useGlobalSearch(term)
  const hits = data ?? []

  const grouped = SEARCH_GROUP_ORDER
    .map((k) => ({ kind: k, items: hits.filter((h) => h.kind === k) }))
    .filter((g) => g.items.length > 0)

  function go(h: SearchHit) {
    navigate(h.to)
    setTerm('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        className="h-9 bg-sidebar-accent/50 pl-8"
        placeholder="Buscar…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && term.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 max-h-96 w-72 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {isFetching && grouped.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>
          ) : grouped.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.kind} className="mb-1 last:mb-0">
                <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {searchGroupLabel(g.kind as SearchKind)}
                </div>
                {g.items.map((h) => (
                  <button
                    key={`${h.kind}-${h.id}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {h.nome}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
