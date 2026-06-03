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
}: {
  title: string
  description: string
  onDelete: () => Promise<void>
  onDeleted: () => void
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
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Excluir
      </Button>
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
