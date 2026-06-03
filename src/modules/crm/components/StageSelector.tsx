import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFunnel, type FunnelSlug } from '../hooks/useFunnelStages'

const NONE = '__none__'

/** Dropdown dos estágios ativos de um funil. value/onChange em id (ou null). */
export function StageSelector({
  slug,
  value,
  onChange,
  allowNone = true,
  className = 'h-8 w-56',
}: {
  slug: FunnelSlug
  value: string | null
  onChange: (stageId: string | null) => void
  allowNone?: boolean
  className?: string
}) {
  const { stages } = useFunnel(slug)
  const ativos = stages.filter((s) => s.ativo || s.id === value)

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className={className} size="sm">
        <SelectValue placeholder="Sem estágio" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>— Sem estágio</SelectItem>}
        {ativos.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: s.cor ?? 'var(--muted-foreground)' }}
              />
              {s.nome}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
