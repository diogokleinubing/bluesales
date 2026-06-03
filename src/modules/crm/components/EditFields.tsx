import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

export type SelectOption = string | { value: string; label: string }

/**
 * Estado de rascunho para formulários de edição com botão Salvar.
 * Os valores são todos strings ('' = vazio/nulo). O rascunho é reinicializado
 * quando `version` muda (ex.: após salvar, o updated_at do registro muda).
 */
export function useDraft<T extends Record<string, string>>(initial: T, version: string) {
  const [draft, setDraft] = useState<T>(initial)
  const lastVersion = useRef(version)
  useEffect(() => {
    if (lastVersion.current !== version) {
      lastVersion.current = version
      setDraft(initial)
    }
  }, [version, initial])
  const set = useCallback((k: keyof T, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
  }, [])
  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof T)[]).some((k) => draft[k] !== initial[k]),
    [draft, initial],
  )
  const reset = useCallback(() => setDraft(initial), [initial])
  return { draft, set, dirty, reset }
}

export function TextField({
  label, value, onChange, type = 'text', placeholder, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        className={className ?? 'h-8'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function TextareaField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function SelectField({
  label, value, options, onChange, includeNone = true,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  includeNone?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value === '' ? NONE : value} onValueChange={(x) => onChange(x === NONE ? '' : x)}>
        <SelectTrigger className="h-8" size="sm">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {includeNone && <SelectItem value={NONE}>—</SelectItem>}
          {options.map((o) =>
            typeof o === 'string'
              ? <SelectItem key={o} value={o}>{o}</SelectItem>
              : <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>,
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Botões Salvar/Cancelar para o rodapé de um formulário de edição. */
export function FormActions({
  dirty, saving, onSave, onCancel,
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={!dirty || saving}>
        Cancelar
      </Button>
    </div>
  )
}

/** Converte string de rascunho em valor para o banco: '' vira null. */
export const toText = (v: string): string | null => (v.trim() ? v.trim() : null)
export const toNumber = (v: string): number | null => (v.trim() ? Number(v) : null)
