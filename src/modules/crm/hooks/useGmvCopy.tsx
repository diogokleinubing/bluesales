import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fmtBRL0 } from '@/lib/format'

/**
 * Copia um GMV (de organização/evento) para um input de GMV.
 * Se o input estiver vazio, copia direto. Se já tiver valor diferente,
 * abre um diálogo perguntando se deseja substituir.
 *
 * `gmv` é a string de dígitos do input; `setGmv` o setter.
 */
export function useGmvCopy(gmv: string, setGmv: (v: string) => void) {
  const [pending, setPending] = useState<{ val: number; source: string } | null>(null)

  function consider(val: number | null | undefined, source: string) {
    if (val == null) return
    const r = Math.round(val)
    const cur = gmv ? Number(gmv.replace(/\D/g, '')) : 0
    if (!cur) {
      setGmv(String(r))
      return
    }
    if (cur === r) return
    setPending({ val: r, source })
  }

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar GMV estimado?</DialogTitle>
          <DialogDescription>
            {pending &&
              `${pending.source} tem GMV de ${fmtBRL0(pending.val)}, diferente do valor atual (${fmtBRL0(
                gmv ? Number(gmv.replace(/\D/g, '')) : 0,
              )}). Deseja substituir?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>Manter atual</Button>
          <Button
            onClick={() => {
              if (pending) setGmv(String(pending.val))
              setPending(null)
            }}
          >
            Atualizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { consider, dialog }
}
