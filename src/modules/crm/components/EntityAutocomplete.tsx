import { useState } from 'react'
import { Input } from '@/components/ui/input'

export interface Lookup {
  id: string
  nome: string
}

/**
 * Campo de digitação com autocomplete para selecionar uma entidade de uma
 * lista (filtragem no cliente). Mostra o nome selecionado e permite trocar.
 */
export function EntityAutocomplete({
  value,
  onPick,
  options,
  placeholder,
  className,
}: {
  value: Lookup | null
  onPick: (v: Lookup | null) => void
  options: Lookup[]
  placeholder?: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const term = query.trim().toLowerCase()
  const filtered = (term ? options.filter((o) => o.nome.toLowerCase().includes(term)) : options).slice(0, 8)
  const text = editing ? query : value?.nome ?? ''

  return (
    <div className={`relative ${className ?? ''}`}>
      <Input
        className="h-9"
        placeholder={placeholder}
        value={text}
        onFocus={() => {
          setEditing(true)
          setQuery(value?.nome ?? '')
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (value) onPick(null)
        }}
        onBlur={() => setTimeout(() => { setOpen(false); setEditing(false) }, 150)}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado.</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o)
                  setQuery(o.nome)
                  setEditing(false)
                  setOpen(false)
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {o.nome}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
