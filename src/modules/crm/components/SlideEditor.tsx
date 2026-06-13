import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { toast } from 'sonner'
import {
  Type, ImageIcon, Video, Square, Circle as CircleIcon, Trash2,
  ArrowUp, ArrowDown, Loader2, Plus, Copy, FileX2, ChevronLeft, ChevronRight, X,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { uploadMedia } from '../hooks/useApresentacoes'

const W = 900
const H = 506 // 16:9
const SERIALIZE_KEYS = ['mediaType', 'mediaUrl']
const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS']

export interface EditorSlide { id: string; conteudo: unknown; thumb: string | null }
export interface DeckApi {
  /** Cria um novo slide (no fim) e devolve seu id. */
  create: (conteudo: unknown, thumb: string) => Promise<string>
  /** Atualiza o conteúdo/thumb de um slide existente. */
  update: (id: string, conteudo: unknown, thumb: string) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
}

interface SelProps {
  isText: boolean
  fontFamily: string
  fontSize: number
  fill: string
  textAlign: string
  bold: boolean
  italic: boolean
  underline: boolean
  textBg: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/**
 * Editor de deck em canvas livre (fabric). Edita vários slides com navegador
 * embaixo, auto-salvando o slide ao trocar/fechar (só grava quando há mudança).
 */
export function SlideEditor({
  open, onClose, titulo, slides: initialSlides, startId, api,
}: {
  open: boolean
  onClose: () => void
  titulo: string
  slides: EditorSlide[]
  startId?: string | null
  api: DeckApi
}) {
  const orgId = useCrmOrgId()
  const orgIdRef = useRef(orgId); orgIdRef.current = orgId
  const elRef = useRef<HTMLCanvasElement | null>(null)
  const fcRef = useRef<fabric.Canvas | null>(null)
  const dirtyRef = useRef(false)
  const histRef = useRef<string[]>([])
  const restoringRef = useRef(false)
  const imgInput = useRef<HTMLInputElement | null>(null)
  const vidInput = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [bg, setBg] = useState('#ffffff')
  const [deck, setDeck] = useState<EditorSlide[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [sel, setSel] = useState<SelProps | null>(null)

  function serialize(): { conteudo: unknown; thumb: string } {
    const fc = fcRef.current!
    return {
      conteudo: fc.toObject(SERIALIZE_KEYS),
      thumb: fc.toDataURL({ format: 'png', multiplier: 0.3, quality: 0.8 }),
    }
  }
  async function loadInto(conteudo: unknown) {
    const fc = fcRef.current; if (!fc) return
    const has = conteudo && typeof conteudo === 'object' && Array.isArray((conteudo as { objects?: unknown[] }).objects)
    if (has) await fc.loadFromJSON(conteudo as object)
    else { fc.clear(); fc.backgroundColor = '#ffffff' }
    setBg((fc.backgroundColor as string) || '#ffffff')
    fc.requestRenderAll()
  }

  // ---- Histórico (undo) ---------------------------------------------------
  function record() {
    if (restoringRef.current) return
    const fc = fcRef.current; if (!fc) return
    const json = JSON.stringify(fc.toObject(SERIALIZE_KEYS))
    const h = histRef.current
    if (h[h.length - 1] === json) return
    h.push(json); if (h.length > 50) h.shift()
  }
  function resetHistory() {
    const fc = fcRef.current; if (!fc) return
    histRef.current = [JSON.stringify(fc.toObject(SERIALIZE_KEYS))]
  }
  async function undo() {
    const fc = fcRef.current; if (!fc) return
    const h = histRef.current
    if (h.length < 2) return
    h.pop()
    const prev = h[h.length - 1]
    restoringRef.current = true
    await fc.loadFromJSON(JSON.parse(prev))
    fc.requestRenderAll()
    restoringRef.current = false
    dirtyRef.current = true
    setSel(null)
  }

  // ---- Seleção / propriedades --------------------------------------------
  function readSel() {
    const fc = fcRef.current; const o = fc?.getActiveObject() as AnyObj
    if (!fc || !o) { setSel(null); return }
    const isText = o.type === 'textbox' || o.type === 'i-text' || o.type === 'text'
    setSel({
      isText,
      fontFamily: o.fontFamily ?? 'Arial',
      fontSize: Math.round(o.fontSize ?? 32),
      fill: typeof o.fill === 'string' ? o.fill : '#111827',
      textAlign: o.textAlign ?? 'left',
      bold: o.fontWeight === 'bold' || Number(o.fontWeight) >= 700,
      italic: o.fontStyle === 'italic',
      underline: !!o.underline,
      textBg: typeof o.textBackgroundColor === 'string' ? o.textBackgroundColor : '',
    })
  }
  function applyToActive(patch: Record<string, unknown>) {
    const fc = fcRef.current; const o = fc?.getActiveObject() as AnyObj; if (!fc || !o) return
    const targets: AnyObj[] = typeof o.getObjects === 'function' ? o.getObjects() : [o]
    targets.forEach((obj) => obj.set(patch))
    fc.requestRenderAll(); dirtyRef.current = true; record(); readSel()
  }

  // Inicializa o canvas ao abrir; cria um primeiro slide se o deck estiver vazio.
  useEffect(() => {
    if (!open || !elRef.current) return
    let disposed = false
    const fc = new fabric.Canvas(elRef.current, { width: W, height: H, backgroundColor: '#ffffff' })
    fcRef.current = fc
    const mark = () => { dirtyRef.current = true; record() }
    fc.on('object:added', mark)
    fc.on('object:removed', mark)
    fc.on('object:modified', () => { mark(); readSel() })
    fc.on('text:changed', mark)
    fc.on('selection:created', readSel)
    fc.on('selection:updated', readSel)
    fc.on('selection:cleared', () => setSel(null))

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return // campos do painel / edição de texto
        if ((fc.getActiveObject() as AnyObj)?.isEditing) return
        e.preventDefault(); undo()
      }
    }
    const onPaste = (e: ClipboardEvent) => { void handlePaste(e) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('paste', onPaste)

    ;(async () => {
      restoringRef.current = true
      let list = [...initialSlides]
      if (list.length === 0) {
        fc.backgroundColor = '#ffffff'; fc.requestRenderAll()
        const { conteudo, thumb } = serialize()
        const id = await api.create(conteudo, thumb)
        if (disposed) return
        list = [{ id, conteudo, thumb }]
        setCurrentId(id)
      } else {
        const start = list.find((s) => s.id === startId) ?? list[0]
        await loadInto(start.conteudo)
        if (disposed) return
        setCurrentId(start.id)
      }
      setDeck(list)
      restoringRef.current = false
      resetHistory()
      dirtyRef.current = false
    })()

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('paste', onPaste)
      fc.dispose(); fcRef.current = null; setDeck([]); setCurrentId(null); setSel(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ---- Slide atual (persistência) ----------------------------------------
  async function persistCurrent() {
    const fc = fcRef.current; const cur = currentId
    if (!fc || !cur || !dirtyRef.current) return
    const { conteudo, thumb } = serialize()
    setDeck((prev) => prev.map((s) => (s.id === cur ? { ...s, conteudo, thumb } : s)))
    dirtyRef.current = false
    try { await api.update(cur, conteudo, thumb) }
    catch (e) { toast.error('Erro ao salvar slide', { description: (e as Error).message }) }
  }
  async function settleNewCanvas() { restoringRef.current = false; resetHistory(); dirtyRef.current = false; setSel(null) }

  async function switchTo(id: string) {
    if (id === currentId || busy) return
    setBusy(true)
    try {
      await persistCurrent()
      const t = deck.find((s) => s.id === id)
      restoringRef.current = true
      await loadInto(t?.conteudo ?? null)
      setCurrentId(id)
      await settleNewCanvas()
    } finally { setBusy(false) }
  }
  async function novoSlide() {
    setBusy(true)
    try {
      await persistCurrent()
      const fc = fcRef.current; if (!fc) return
      restoringRef.current = true
      fc.clear(); fc.backgroundColor = '#ffffff'; fc.requestRenderAll(); setBg('#ffffff')
      const { conteudo, thumb } = serialize()
      const id = await api.create(conteudo, thumb)
      setDeck((prev) => [...prev, { id, conteudo, thumb }])
      setCurrentId(id)
      await settleNewCanvas()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function duplicar() {
    const cur = currentId; if (!cur) return
    setBusy(true)
    try {
      await persistCurrent()
      const { conteudo, thumb } = serialize()
      const id = await api.create(conteudo, thumb)
      const i = deck.findIndex((s) => s.id === cur)
      const arr = [...deck]; arr.splice(i + 1, 0, { id, conteudo, thumb })
      setDeck(arr)
      await api.reorder(arr.map((s) => s.id))
      setCurrentId(id)
      resetHistory(); dirtyRef.current = false
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function excluirSlide() {
    const cur = currentId; if (!cur) return
    setBusy(true)
    try {
      const i = deck.findIndex((s) => s.id === cur)
      await api.remove(cur)
      const arr = deck.filter((s) => s.id !== cur)
      if (arr.length === 0) {
        const fc = fcRef.current
        restoringRef.current = true
        if (fc) { fc.clear(); fc.backgroundColor = '#ffffff'; fc.requestRenderAll() }
        setBg('#ffffff')
        const { conteudo, thumb } = serialize()
        const id = await api.create(conteudo, thumb)
        setDeck([{ id, conteudo, thumb }]); setCurrentId(id)
        await settleNewCanvas()
        return
      }
      setDeck(arr)
      const next = arr[Math.min(i, arr.length - 1)]
      restoringRef.current = true
      await loadInto(next.conteudo)
      setCurrentId(next.id)
      await settleNewCanvas()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function moveSlide(dir: -1 | 1) {
    const i = deck.findIndex((s) => s.id === currentId); const j = i + dir
    if (i < 0 || j < 0 || j >= deck.length) return
    const arr = [...deck]; [arr[i], arr[j]] = [arr[j], arr[i]]
    setDeck(arr); await api.reorder(arr.map((s) => s.id))
  }
  async function fechar() {
    setBusy(true)
    try { await persistCurrent() } finally { setBusy(false); onClose() }
  }

  // ---- Objetos no canvas --------------------------------------------------
  function add(obj: fabric.FabricObject) {
    const fc = fcRef.current; if (!fc) return
    fc.add(obj); fc.bringObjectToFront(obj); fc.setActiveObject(obj); fc.requestRenderAll()
    readSel()
  }
  function addText() { add(new fabric.Textbox('Texto', { left: 80, top: 80, width: 360, fontSize: 32, fill: '#111827' })) }
  function addRect() { add(new fabric.Rect({ left: 120, top: 120, width: 240, height: 140, fill: '#2f6df6', rx: 8, ry: 8 })) }
  function addCircle() { add(new fabric.Circle({ left: 140, top: 140, radius: 80, fill: '#22c55e' })) }
  async function addImageFromFile(file: File) {
    const oid = orgIdRef.current; if (!oid) return
    const url = await uploadMedia(oid, file, Date.now() + Math.floor(Math.random() * 1000))
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const scale = Math.min(1, 420 / (img.width ?? 420))
    img.set({ left: 100, top: 100, scaleX: scale, scaleY: scale })
    add(img)
  }
  async function onImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { await addImageFromFile(file) }
    catch (err) { toast.error('Erro ao enviar imagem', { description: (err as Error).message }) }
  }
  async function onVid(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file || !orgId) return
    try {
      const url = await uploadMedia(orgId, file, Date.now() + Math.floor(Math.random() * 1000))
      const rect = new fabric.Rect({ width: 360, height: 202, fill: '#1f2937', rx: 8, ry: 8 })
      const label = new fabric.Textbox('▶ vídeo', { fontSize: 26, fill: '#ffffff', textAlign: 'center', width: 360, top: 86 })
      const group = new fabric.Group([rect, label], { left: 120, top: 120 })
      group.set({ mediaType: 'video', mediaUrl: url } as Partial<fabric.Group>)
      add(group)
    } catch (err) { toast.error('Erro ao enviar vídeo', { description: (err as Error).message }) }
  }
  // Colar imagem/texto de outras plataformas.
  async function handlePaste(e: ClipboardEvent) {
    const fc = fcRef.current; const dt = e.clipboardData; if (!fc || !dt) return
    const imgItem = Array.from(dt.items).find((it) => it.type.startsWith('image/'))
    if (imgItem) {
      e.preventDefault()
      const file = imgItem.getAsFile()
      if (file) { try { await addImageFromFile(file) } catch (err) { toast.error('Erro ao colar imagem', { description: (err as Error).message }) } }
      return
    }
    const text = dt.getData('text/plain')
    if (text && !(fc.getActiveObject() as AnyObj)?.isEditing) {
      e.preventDefault()
      add(new fabric.Textbox(text, { left: 100, top: 100, width: 420, fontSize: 28, fill: '#111827' }))
    }
  }
  function removeSel() {
    const fc = fcRef.current; if (!fc) return
    fc.getActiveObjects().forEach((o) => fc.remove(o))
    fc.discardActiveObject(); fc.requestRenderAll(); setSel(null)
  }
  function forward() { const fc = fcRef.current; const o = fc?.getActiveObject(); if (fc && o) { fc.bringObjectForward(o); fc.requestRenderAll(); dirtyRef.current = true; record() } }
  function backward() { const fc = fcRef.current; const o = fc?.getActiveObject(); if (fc && o) { fc.sendObjectBackwards(o); fc.requestRenderAll(); dirtyRef.current = true; record() } }
  function setBackground(color: string) {
    setBg(color)
    const fc = fcRef.current; if (!fc) return
    fc.backgroundColor = color; fc.requestRenderAll(); dirtyRef.current = true; record()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="truncate text-sm font-medium">{titulo}</span>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button onClick={fechar} disabled={busy}><X className="size-4" /> Fechar</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
        <ToolBtn onClick={addText} icon={Type} label="Texto" />
        <ToolBtn onClick={() => imgInput.current?.click()} icon={ImageIcon} label="Imagem" />
        <ToolBtn onClick={() => vidInput.current?.click()} icon={Video} label="Vídeo" />
        <ToolBtn onClick={addRect} icon={Square} label="Retângulo" />
        <ToolBtn onClick={addCircle} icon={CircleIcon} label="Círculo" />
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolBtn onClick={undo} icon={Undo2} label="Desfazer" />
        <ToolBtn onClick={forward} icon={ArrowUp} label="Trazer à frente" />
        <ToolBtn onClick={backward} icon={ArrowDown} label="Enviar p/ trás" />
        <ToolBtn onClick={removeSel} icon={Trash2} label="Remover objeto" />
        <span className="mx-1 h-5 w-px bg-border" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Fundo <input type="color" value={bg} onChange={(e) => setBackground(e.target.value)} className="size-7 cursor-pointer rounded border border-border" />
        </label>
      </div>

      {/* Barra de propriedades (objeto selecionado) */}
      {sel && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-1.5">
          {sel.isText && (
            <>
              <select value={sel.fontFamily} onChange={(e) => applyToActive({ fontFamily: e.target.value })}
                className="h-7 rounded-md border border-border bg-background px-2 text-sm" style={{ fontFamily: sel.fontFamily }}>
                {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
              <input type="number" min={6} max={200} value={sel.fontSize}
                onChange={(e) => applyToActive({ fontSize: Math.max(6, Number(e.target.value) || 0) })}
                className="h-7 w-16 rounded-md border border-border bg-background px-2 text-sm" />
              <span className="mx-1 h-5 w-px bg-border" />
              <Toggle active={sel.bold} icon={Bold} label="Negrito" onClick={() => applyToActive({ fontWeight: sel.bold ? 'normal' : 'bold' })} />
              <Toggle active={sel.italic} icon={Italic} label="Itálico" onClick={() => applyToActive({ fontStyle: sel.italic ? 'normal' : 'italic' })} />
              <Toggle active={sel.underline} icon={Underline} label="Sublinhado" onClick={() => applyToActive({ underline: !sel.underline })} />
              <span className="mx-1 h-5 w-px bg-border" />
              <Toggle active={sel.textAlign === 'left'} icon={AlignLeft} label="Esquerda" onClick={() => applyToActive({ textAlign: 'left' })} />
              <Toggle active={sel.textAlign === 'center'} icon={AlignCenter} label="Centro" onClick={() => applyToActive({ textAlign: 'center' })} />
              <Toggle active={sel.textAlign === 'right'} icon={AlignRight} label="Direita" onClick={() => applyToActive({ textAlign: 'right' })} />
              <span className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {sel.isText ? 'Cor' : 'Preenchimento'}
            <input type="color" value={/^#/.test(sel.fill) ? sel.fill : '#111827'} onChange={(e) => applyToActive({ fill: e.target.value })}
              className="size-7 cursor-pointer rounded border border-border" />
          </label>
          {sel.isText && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Fundo
              <input type="color" value={/^#/.test(sel.textBg) ? sel.textBg : '#ffffff'} onChange={(e) => applyToActive({ textBackgroundColor: e.target.value })}
                className="size-7 cursor-pointer rounded border border-border" />
              <button onClick={() => applyToActive({ textBackgroundColor: '' })} title="Sem fundo"
                className="rounded p-1 hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
        <div className="shadow-lg ring-1 ring-border" style={{ width: W, height: H }}>
          <canvas ref={elRef} width={W} height={H} />
        </div>
      </div>

      {/* Navegador de slides (índice) */}
      <div className="flex items-center gap-3 border-t border-border bg-background px-3 py-2">
        <div className="flex shrink-0 items-center gap-1">
          <ToolBtn onClick={novoSlide} icon={Plus} label="Novo" />
          <ToolBtn onClick={duplicar} icon={Copy} label="Duplicar" />
          <ToolBtn onClick={excluirSlide} icon={FileX2} label="Excluir slide" />
          <span className="mx-1 h-5 w-px bg-border" />
          <button onClick={() => moveSlide(-1)} title="Mover ←" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-4" /></button>
          <button onClick={() => moveSlide(1)} title="Mover →" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
        <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-1">
          {deck.map((s, i) => (
            <button key={s.id} onClick={() => switchTo(s.id)}
              className={cn('relative w-28 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                s.id === currentId ? 'border-primary' : 'border-border hover:border-muted-foreground')}>
              {s.thumb ? <img src={s.thumb} alt="" className="aspect-video w-full bg-muted object-cover" />
                : <div className="flex aspect-video w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">vazio</div>}
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={onImg} />
      <input ref={vidInput} type="file" accept="video/*" className="hidden" onChange={onVid} />
    </div>
  )
}

function ToolBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Type; label: string }) {
  return (
    <button onClick={onClick} title={label}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function Toggle({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label}
      className={cn('rounded-md p-1.5 transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
      <Icon className="size-4" />
    </button>
  )
}
