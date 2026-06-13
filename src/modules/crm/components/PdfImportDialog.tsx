import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

export interface PdfImportOpts { editable: boolean }

/**
 * Diálogo de importação de slides (PDF rasterizado ou PPTX dinâmico/editável).
 * A criação dos slides fica a cargo de `run` (o pai decide o destino e o motor).
 */
export function PdfImportDialog({
  open, onOpenChange, titulo = 'Importar slides', run,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo?: string
  /** Recebe o arquivo, o progresso e as opções; cria os slides. */
  run: (file: File, onProgress: (done: number, total: number) => void, opts: PdfImportOpts) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [editable, setEditable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)

  const ext = file?.name.split('.').pop()?.toLowerCase()
  const isPptx = ext === 'pptx'

  function reset() { setFile(null); setBusy(false); setProg(null) }
  function close() { if (busy) return; reset(); onOpenChange(false) }

  async function importar() {
    if (!file) return
    setBusy(true); setProg({ done: 0, total: 0 })
    try {
      await run(file, (done, total) => setProg({ done, total }), { editable })
      toast.success('Importado', { description: `${file.name}` })
      reset(); onOpenChange(false)
    } catch (e) {
      toast.error('Erro ao importar', { description: (e as Error).message })
      setBusy(false)
    }
  }

  const pct = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>

        {!busy ? (
          <div className="space-y-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <FileUp className="size-6" />
              {file ? <span className="font-medium text-foreground">{file.name}</span> : 'Clique para escolher um arquivo PDF ou PPTX'}
            </button>
            {isPptx ? (
              <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">PPTX dinâmico:</span> cada slide é reconstruído com
                texto, formas e imagens <span className="font-medium">editáveis</span>. Fontes próprias podem cair
                num fallback e efeitos complexos são aproximados.
              </p>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
                  <Checkbox checked={editable} onCheckedChange={(v) => setEditable(!!v)} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="font-medium">Importar como editável (beta)</span>
                    <span className="block text-xs text-muted-foreground">
                      Extrai texto e imagens como objetos editáveis em vez de uma imagem fixa.
                      Slides muito gráficos perdem fundos/formas. Para edição fiel, prefira exportar do Canva como PPTX.
                    </span>
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  {editable
                    ? 'Modo editável: a página é reconstruída em caixas de texto e imagens.'
                    : 'Cada página vira um slide (imagem de fundo); você anota textos e formas por cima.'}
                </p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f) }} />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {prog && prog.total ? `Importando ${prog.done} de ${prog.total}…` : 'Lendo o arquivo…'}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
          <Button onClick={importar} disabled={!file || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
