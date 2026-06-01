import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

/** Select de segmento/gênero com opção "—" (não classificar esta dimensão). */
export function ClassSelect({
  value,
  options,
  onChange,
  placeholder = '—',
  className = 'h-8 w-full',
}: {
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Select
      value={value && value.trim() ? value : NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className={className} size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
