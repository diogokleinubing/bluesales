import { Pin } from 'lucide-react'
import { TableCell } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const AUTO = '__auto__'

/**
 * Célula de dimensão (segmento/gênero) editável inline. A alteração não é salva
 * na hora: fica "staged" (pendente). Quem usa decide quando persistir.
 */
export function DimensionCell({
  value,
  options,
  isManual,
  onChange,
  emptyLabel = 'Sem segmento',
  staged,
  hasStaged,
}: {
  value: string | null
  options: string[]
  isManual: boolean
  onChange: (v: string | null) => void
  emptyLabel?: string
  staged?: string | null
  hasStaged?: boolean
}) {
  const effValue = hasStaged ? staged ?? null : value
  const effManual = hasStaged ? staged != null : isManual
  const selectValue = effManual && effValue ? effValue : AUTO

  return (
    <TableCell className={hasStaged ? 'bg-primary/5' : undefined}>
      <div className="flex items-center gap-1">
        {effManual && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={hasStaged ? 'text-amber-500' : 'text-primary'}>
                <Pin className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasStaged
                ? 'Alteração não salva — use "Atualizar Segmento / Gênero"'
                : 'Definido manualmente — não será alterado por regras'}
            </TooltipContent>
          </Tooltip>
        )}
        <Select
          value={selectValue}
          onValueChange={(v) => onChange(v === AUTO ? null : v)}
        >
          <SelectTrigger className="h-8 flex-1" size="sm">
            <SelectValue>
              <span className={effValue ? '' : 'text-muted-foreground'}>
                {effValue ?? (hasStaged ? '— Automático' : emptyLabel)}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>— Automático</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </TableCell>
  )
}
