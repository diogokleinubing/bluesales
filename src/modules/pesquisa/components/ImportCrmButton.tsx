import { Import, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Botão "Copiar para o CRM". Quando já importado, fica esmaecido e bloqueado
 * (não dispara), com tooltip informando. Usa aria-disabled em vez de `disabled`
 * para o tooltip nativo continuar aparecendo no hover.
 */
export function ImportCrmButton({
  imported,
  inCrm,
  disabled,
  onImport,
  className,
}: {
  imported: boolean
  /** Já existe um cadastro com este nome no CRM (ex.: importado por Excel),
   *  mesmo sem vínculo de importação. Fica verde, mas continua clicável. */
  inCrm?: boolean
  disabled?: boolean
  onImport: () => void
  className?: string
}) {
  if (imported) {
    return (
      <button
        type="button"
        aria-disabled
        title="Já vinculado ao CRM"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-md bg-emerald-600 p-1 text-white shadow-sm',
          className,
        )}
      >
        <Check className="size-3.5" />
      </button>
    )
  }
  if (inCrm) {
    return (
      <button
        type="button"
        disabled={disabled}
        title="Já existe um cadastro com este nome no CRM — clique para copiar mesmo assim"
        onClick={(e) => { e.stopPropagation(); onImport() }}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md bg-emerald-600 p-1 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50',
          className,
        )}
      >
        <Import className="size-3.5" />
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
