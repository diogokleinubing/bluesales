import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Images, Loader2, FileUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { SlideEditor, type DeckApi } from '../../components/SlideEditor'
import { PdfImportDialog } from '../../components/PdfImportDialog'
import { renderPdfToSlides } from '../../import/importPdfSlides'
import { renderPptxToSlides } from '../../import/importPptxSlides'
import {
  useBlocks, useBlockSlides, saveBlock, deleteBlock,
  saveBlockSlide, deleteBlockSlide, reorderBlockSlides,
  type PresentationBlock,
} from '../../hooks/useApresentacoes'

export function ApresentacoesBiblioteca() {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data: blocks, isLoading } = useBlocks()
  const [form, setForm] = useState<{ open: boolean; edit: PresentationBlock | null; titulo: string; categoria: string; descricao: string }>(
    { open: false, edit: null, titulo: '', categoria: '', descricao: '' })
  const [bloco, setBloco] = useState<PresentationBlock | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  function novo() { setForm({ open: true, edit: null, titulo: '', categoria: '', descricao: '' }) }
  function editar(b: PresentationBlock) { setForm({ open: true, edit: b, titulo: b.titulo, categoria: b.categoria ?? '', descricao: b.descricao ?? '' }) }
  async function salvar() {
    if (!orgId || !form.titulo.trim()) return
    try {
      await saveBlock(orgId, { titulo: form.titulo.trim(), categoria: form.categoria.trim() || null, descricao: form.descricao.trim() || null }, form.edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'apr-blocks'] })
      setForm((f) => ({ ...f, open: false }))
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function remover(b: PresentationBlock) {
    try { await deleteBlock(b.id); qc.invalidateQueries({ queryKey: ['crm', 'apr-blocks'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de blocos</h1>
          <p className="text-sm text-muted-foreground">Cardápio de conteúdos para montar apresentações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp className="size-4" /> Importar PDF</Button>
          <Button onClick={novo}><Plus className="size-4" /> Novo bloco</Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (blocks ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum bloco. Crie o primeiro.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(blocks ?? []).map((b) => (
            <Card key={b.id} className="cursor-pointer transition-colors hover:border-primary" onClick={() => setBloco(b)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{b.titulo}</span>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => editar(b)} className="text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                    <button onClick={() => remover(b)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                </div>
                {b.categoria && <Badge variant="secondary">{b.categoria}</Badge>}
                {b.descricao && <p className="line-clamp-2 text-sm text-muted-foreground">{b.descricao}</p>}
                <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground"><Images className="size-3.5" /> ver slides</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.edit ? 'Editar bloco' : 'Novo bloco'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título</Label><Input value={form.titulo} autoFocus onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Categoria</Label><Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="Ex.: Antifraude, Marketing…" /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, open: false }))}>Cancelar</Button>
            <Button onClick={salvar} disabled={!form.titulo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bloco && <BlocoEditor bloco={bloco} onClose={() => setBloco(null)} />}

      <PdfImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        titulo="Importar como bloco"
        run={async (file, onProgress, { editable }) => {
          if (!orgId) throw new Error('Organização não definida')
          const titulo = file.name.replace(/\.(pdf|pptx)$/i, '').trim() || 'Importado'
          const blockId = await saveBlock(orgId, { titulo })
          const createSlide = (c: unknown, t: string) => saveBlockSlide(orgId, blockId, { conteudo: c, thumb: t })
          if (/\.pptx$/i.test(file.name)) await renderPptxToSlides(file, { orgId, onProgress, createSlide })
          else await renderPdfToSlides(file, { orgId, onProgress, editable, createSlide })
          qc.invalidateQueries({ queryKey: ['crm', 'apr-blocks'] })
        }}
      />
    </div>
  )
}

/** Abre o editor de deck (fullscreen) com todos os slides do bloco. */
function BlocoEditor({ bloco, onClose }: { bloco: PresentationBlock; onClose: () => void }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data: slides, isLoading } = useBlockSlides(bloco.id)

  function close() {
    qc.invalidateQueries({ queryKey: ['crm', 'apr-block-slides', bloco.id] })
    onClose()
  }

  if (isLoading || !slides || !orgId) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const api: DeckApi = {
    create: (c, t) => saveBlockSlide(orgId, bloco.id, { conteudo: c, thumb: t }),
    update: (id, c, t) => saveBlockSlide(orgId, bloco.id, { conteudo: c, thumb: t }, id).then(() => undefined),
    remove: (id) => deleteBlockSlide(id),
    reorder: (ids) => reorderBlockSlides(ids),
  }

  return (
    <SlideEditor
      open
      onClose={close}
      titulo={`Biblioteca · ${bloco.titulo}`}
      slides={slides.map((s) => ({ id: s.id, conteudo: s.conteudo, thumb: s.thumb }))}
      api={api}
    />
  )
}
