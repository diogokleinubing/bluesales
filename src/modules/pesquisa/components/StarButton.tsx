import { Star, Ban, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Estrela de marcação (favorito) à esquerda do nome. */
export function StarButton({
  active,
  onToggle,
  disabled,
  className,
}: {
  active: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={active ? 'Remover marcação' : 'Marcar'}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={cn(
        'shrink-0 text-muted-foreground transition-colors hover:text-amber-500 disabled:opacity-50',
        active && 'text-amber-500',
        className,
      )}
    >
      <Star className={cn('size-4', active && 'fill-amber-400 text-amber-400')} />
    </button>
  )
}

/** Botão de ignorar/reativar (descartar) à esquerda do nome. */
export function IgnoreButton({
  ignored,
  onToggle,
  disabled,
  className,
}: {
  ignored: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={ignored ? 'Reativar' : 'Ignorar'}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={cn(
        'shrink-0 text-muted-foreground transition-colors disabled:opacity-50',
        ignored ? 'hover:text-foreground' : 'hover:text-destructive',
        className,
      )}
    >
      {ignored ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
    </button>
  )
}
