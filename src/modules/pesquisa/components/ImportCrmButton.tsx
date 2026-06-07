import { Import } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Botão "Copiar para o CRM". Quando já importado, fica esmaecido e bloqueado
 * (não dispara), com tooltip informando. Usa aria-disabled em vez de `disabled`
 * para o tooltip nativo continuar aparecendo no hover.
 */
export function ImportCrmButton({
  imported,
  disabled,
  onImport,
  className,
}: {
  imported: boolean
  disabled?: boolean
  onImport: () => void
  className?: string
}) {
  if (imported) {
    return (
      <button
        type="button"
        aria-disabled
        title="Já copiado para o CRM"
        onClick={(e) => e.stopPropagation()}
        className={cn('shrink-0 cursor-not-allowed text-emerald-600 opacity-60', className)}
      >
        <Import className="size-4" />
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      title="Copiar para o CRM"
      onClick={(e) => { e.stopPropagation(); onImport() }}
      className={cn(
        'shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50',
        className,
      )}
    >
      <Import className="size-4" />
    </button>
  )
}
