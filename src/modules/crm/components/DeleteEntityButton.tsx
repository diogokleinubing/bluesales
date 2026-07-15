import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/**
 * Botão "Excluir" com diálogo de confirmação. Após confirmar e concluir,
 * chama `onDeleted` (tipicamente para navegar de volta à lista).
 */
export function DeleteEntityButton({
  title,
  description,
  onDelete,
  onDeleted,
  variant = 'button',
  label = 'Excluir',
}: {
  title: string
  description: string
  onDelete: () => Promise<void>
  onDeleted: () => void
  /** 'button' = botão outline; 'menu' = item de lista; 'icon' = só lixeira. */
  variant?: 'button' | 'menu' | 'icon'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirmar() {
    setBusy(true)
    try {
      await onDelete()
      setOpen(false)
      onDeleted()
    } catch (e) {
      toast.error('Erro ao excluir', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          className="text-muted-foreground transition-colors hover:text-destructive"
          title={label}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : variant === 'menu' ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> {label}
        </button>
      ) : (
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" /> {label}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmar} disabled={busy}>
              {busy ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
