import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { iniciais, corDoNome } from './avatarUtils'

/**
 * Avatar circular com as iniciais do responsável e tooltip (JS) com o nome.
 * A cor vem de `color` (definida pelo usuário) ou é derivada do nome.
 */
export function UserAvatar({
  nome, color, size = 22, className,
}: {
  nome: string | null
  color?: string | null
  size?: number
  className?: string
}) {
  const label = nome?.trim() || 'Sem responsável'
  const bg = nome ? (color || corDoNome(nome)) : 'var(--muted-foreground)'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
          style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: bg }}
          aria-label={label}
        >
          {nome ? iniciais(nome) : '?'}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
