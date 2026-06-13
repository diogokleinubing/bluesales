import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Trash2, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Building2, Pencil, FilePlus2, FileUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { SlideEditor, type DeckApi } from '../../components/SlideEditor'
import { PdfImportDialog } from '../../components/PdfImportDialog'
import { renderPdfToSlides } from '../../import/importPdfSlides'
import { renderPptxToSlides } from '../../import/importPptxSlides'
import {
  usePresentation, usePresentationSlides, useBlocks,
  savePresentation, savePresentationSlide, deletePresentationSlide, setSlideIncluido,
  reorderPresentationSlides, assembleAddBlock, pullSlideFromSource,
  type PresentationSlide,
} from '../../hooks/useApresentacoes'

const EMPRESA_CAMPOS: { key: string; label: string }[] = [
  { key: 'setor', label: 'Setor' }, { key: 'porte', label: 'Porte' },
  { key: 'site', label: 'Site' }, { key: 'contato', label: 'Contato' },
  { key: 'sistema_atual', label: 'Sistema/concorrente atual' }, { key: 'dores', label: 'Dores conhecidas' },
]

export function ApresentacaoEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data: pres, isLoading } = usePresentation(id)
  const { data: slides } = usePresentationSlides(id)
  const blocks = useBlocks()

  const [editor, setEditor] = useState<{ open: boolean; startId: string | null }>({ open: false, startId: null })
  const [addOpen, setAddOpen] = useState(false)
  const [empresaOpen, setEmpresaOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  function refresh() {
    qc.invalidateQueries({ queryKey: ['crm', 'apr-slides', id] })
    qc.invalidateQueries({ queryKey: ['crm', 'apresentacoes'] })
  }

  const editorApi: DeckApi = {
    create: (c, t) => savePresentationSlide(orgId!, id!, { conteudo: c, thumb: t }),
    update: (sid, c, t) => savePresentationSlide(orgId!, id!, { conteudo: c, thumb: t }, sid).then(() => undefined),
    remove: (sid) => deletePresentationSlide(sid),
    reorder: (ids) => reorderPresentationSlides(ids),
  }
  function closeEditor() { setEditor({ open: false, startId: null }); refresh() }

  async function addBlock(blockId: string) {
    if (!orgId || !id) return
    try { await assembleAddBlock(orgId, id, blockId); refresh() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function remover(sid: string) { await deletePresentationSlide(sid); refresh() }
  async function toggleInc(s: PresentationSlide) { await setSlideIncluido(s.id, !s.incluido); refresh() }
  async function mover(idx: number, dir: -1 | 1) {
    const arr = [...(slides ?? [])]; const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    await reorderPresentationSlides(arr.map((s) => s.id)); refresh()
  }
  async function atualizar(s: PresentationSlide) {
    if (!s.source_slide_id) return
    try { await pullSlideFromSource(s.id, s.source_slide_id); refresh(); toast.success('Slide atualizado da biblioteca') }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!pres) return <p className="text-muted-foreground">Apresentação não encontrada.</p>

  const desatualizados = (slides ?? []).filter((s) => s.source_versao != null && s.source_versao_atual != null && s.source_versao_atual > s.source_versao).length

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/comercial/apresentacoes')} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Apresentações
      </button>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{pres.titulo}</h1>
          <p className="text-sm text-muted-foreground">{pres.cliente_nome ?? '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEmpresaOpen(true)}><Building2 className="size-4" /> Dados da empresa</Button>
          <Button variant="outline" onClick={() => setEditor({ open: true, startId: null })}><FilePlus2 className="size-4" /> Novo slide</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp className="size-4" /> Importar PDF</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="size-4" /> Adicionar blocos</Button>
        </div>
      </div>

      {desatualizados > 0 && (
        <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-3 py-2 text-sm text-[var(--warning)]">
          {desatualizados} slide(s) foram atualizados na biblioteca — revise abaixo se deseja puxar a nova versão.
        </div>
      )}

      {(slides ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Adicione blocos da biblioteca para montar a apresentação.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(slides ?? []).map((s, i) => {
            const desatualizado = s.source_versao != null && s.source_versao_atual != null && s.source_versao_atual > s.source_versao
            return (
              <Card key={s.id} className={cn(!s.incluido && 'opacity-50')}>
                <CardContent className="space-y-2 p-2">
                  <button onClick={() => setEditor({ open: true, startId: s.id })} className="block w-full overflow-hidden rounded-md border border-border">
                    {s.thumb ? <img src={s.thumb} alt="" className="aspect-video w-full bg-muted object-cover" /> : <div className="flex aspect-video w-full items-center justify-center bg-muted text-xs text-muted-foreground">vazio</div>}
                  </button>
                  {desatualizado && (
                    <button onClick={() => atualizar(s)} className="flex w-full items-center justify-center gap-1 rounded-md bg-[var(--warning)]/15 px-2 py-1 text-xs text-[var(--warning)] hover:bg-[var(--warning)]/25">
                      <RefreshCw className="size-3" /> atualizar da biblioteca
                    </button>
                  )}
                  <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                    <span>#{i + 1}</span>
                    <div className="flex gap-1">
                      <button onClick={() => toggleInc(s)} title={s.incluido ? 'Incluído' : 'Oculto'} className="hover:text-foreground">{s.incluido ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</button>
                      <button onClick={() => setEditor({ open: true, startId: s.id })} className="hover:text-foreground"><Pencil className="size-4" /></button>
                      <button onClick={() => mover(i, -1)} className="hover:text-foreground"><ChevronLeft className="size-4" /></button>
                      <button onClick={() => mover(i, 1)} className="hover:text-foreground"><ChevronRight className="size-4" /></button>
                      <button onClick={() => remover(s.id)} className="hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AddBlocosDialog open={addOpen} onOpenChange={setAddOpen} blocks={blocks.data ?? []} onAdd={addBlock} />

      <PdfImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        titulo="Importar na apresentação"
        run={async (file, onProgress, { editable }) => {
          if (!orgId || !id) throw new Error('Apresentação não definida')
          const createSlide = (c: unknown, t: string) => savePresentationSlide(orgId, id, { conteudo: c, thumb: t })
          if (/\.pptx$/i.test(file.name)) await renderPptxToSlides(file, { orgId, onProgress, createSlide })
          else await renderPdfToSlides(file, { orgId, onProgress, editable, createSlide })
          refresh()
        }}
      />
      <EmpresaDialog open={empresaOpen} onOpenChange={setEmpresaOpen} pres={pres} onSaved={() => qc.invalidateQueries({ queryKey: ['crm', 'apresentacao', id] })} />

      {editor.open && (
        <SlideEditor
          open
          onClose={closeEditor}
          titulo={`${pres.titulo}`}
          slides={(slides ?? []).map((s) => ({ id: s.id, conteudo: s.conteudo, thumb: s.thumb }))}
          startId={editor.startId}
          api={editorApi}
        />
      )}
    </div>
  )
}

function AddBlocosDialog({ open, onOpenChange, blocks, onAdd }: {
  open: boolean; onOpenChange: (o: boolean) => void
  blocks: { id: string; titulo: string; categoria: string | null }[]
  onAdd: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar blocos</DialogTitle></DialogHeader>
        <div className="max-h-[55vh] space-y-1 overflow-auto">
          {blocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum bloco na biblioteca.</p>
          ) : blocks.map((b) => (
            <button key={b.id} onClick={() => onAdd(b.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary">
              <span className="font-medium">{b.titulo}</span>
              <span className="flex items-center gap-2">
                {b.categoria && <Badge variant="secondary">{b.categoria}</Badge>}
                <Plus className="size-4 text-muted-foreground" />
              </span>
            </button>
          ))}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmpresaDialog({ open, onOpenChange, pres, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void
  pres: { id: string; titulo: string; cliente_nome: string | null; empresa_info: Record<string, unknown> }
  onSaved: () => void
}) {
  const [titulo, setTitulo] = useState(pres.titulo)
  const [cliente, setCliente] = useState(pres.cliente_nome ?? '')
  const [info, setInfo] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const c of EMPRESA_CAMPOS) o[c.key] = String((pres.empresa_info ?? {})[c.key] ?? '')
    return o
  })
  const [saving, setSaving] = useState(false)

  async function salvar() {
    setSaving(true)
    try {
      await savePresentation(pres.id, { titulo: titulo.trim() || pres.titulo, cliente_nome: cliente.trim() || null, empresa_info: info })
      onSaved(); onOpenChange(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dados da empresa</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Cliente</Label><Input value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
          {EMPRESA_CAMPOS.map((c) => (
            <div key={c.key} className={cn('space-y-1', c.key === 'dores' && 'col-span-2')}>
              <Label>{c.label}</Label>
              {c.key === 'dores'
                ? <Textarea value={info[c.key]} onChange={(e) => setInfo((s) => ({ ...s, [c.key]: e.target.value }))} />
                : <Input value={info[c.key]} onChange={(e) => setInfo((s) => ({ ...s, [c.key]: e.target.value }))} />}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
