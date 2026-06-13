import * as fabric from 'fabric'
import { toast } from 'sonner'
import { uploadMedia } from '../hooks/useApresentacoes'

interface ImgDiag { found: number; ok: number; errors: string[] }

const W = 900
const H = 506 // 16:9 — mesmo tamanho do SlideEditor

/** Resolução-alvo da imagem renderizada (largura em px) para nitidez no fullscreen. */
const TARGET_PX = 1600

export interface ImportPdfOpts {
  orgId: string
  /** Cria um slide (no fim) e devolve o id. */
  createSlide: (conteudo: unknown, thumb: string) => Promise<string>
  /** Progresso (página atual, total). */
  onProgress?: (done: number, total: number) => void
  /**
   * Modo editável (beta): em vez da página rasterizada, extrai texto (caixas
   * editáveis) e recorta as imagens. Perde design vetorial (fundos/formas).
   */
  editable?: boolean
}

/** Carrega o pdf.js sob demanda e configura o worker (Vite). */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem da página'))), 'image/png'))
}

/** Compõe um slide do fabric com a imagem da página como fundo (travada). */
async function composeImageSlide(url: string): Promise<{ conteudo: unknown; thumb: string }> {
  const el = document.createElement('canvas')
  const fc = new fabric.StaticCanvas(el, { width: W, height: H, backgroundColor: '#ffffff' })
  const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  const iw = img.width ?? W, ih = img.height ?? H
  const scale = Math.min(W / iw, H / ih)
  img.set({
    left: (W - iw * scale) / 2, top: (H - ih * scale) / 2,
    scaleX: scale, scaleY: scale,
    selectable: false, evented: false, // funciona como fundo; usuário anota por cima
  })
  fc.add(img); fc.requestRenderAll()
  const conteudo = fc.toObject(['mediaType', 'mediaUrl'])
  const thumb = fc.toDataURL({ format: 'png', multiplier: 0.3 })
  fc.dispose()
  return { conteudo, thumb }
}

// ---------------------------------------------------------------------------
// Modo editável (beta) — extrai texto + imagens e reconstrói o slide
// ---------------------------------------------------------------------------
type PdfMod = Awaited<ReturnType<typeof loadPdfjs>>
type PdfPage = Awaited<ReturnType<Awaited<ReturnType<PdfMod['getDocument']>['promise']>['getPage']>>
type Matrix = number[]

function bboxOf(points: number[][]) {
  const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1])
  const x = Math.min(...xs); const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Recorta uma região do canvas e devolve um PNG. */
function cropToBlob(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): Promise<Blob> {
  const sx = Math.max(0, Math.floor(x)), sy = Math.max(0, Math.floor(y))
  const sw = Math.min(src.width - sx, Math.ceil(w)), sh = Math.min(src.height - sy, Math.ceil(h))
  const out = document.createElement('canvas')
  out.width = Math.max(1, sw); out.height = Math.max(1, sh)
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvasToBlob(out)
}

/** Mapeia a fonte do PDF para uma família web segura. */
function webFont(family?: string): string {
  const f = (family ?? '').toLowerCase()
  if (f.includes('serif') && !f.includes('sans')) return 'Georgia, serif'
  if (f.includes('mono') || f.includes('courier')) return 'monospace'
  return 'Arial, sans-serif'
}

async function buildEditableSlide(
  page: PdfPage, pdfjs: PdfMod, orgId: string, pageIdx: number, diag: ImgDiag,
): Promise<{ conteudo: unknown; thumb: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Util = (pdfjs as any).Util
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OPS = (pdfjs as any).OPS
  // pdf.js v6: applyTransform muta o ponto no lugar e retorna undefined.
  const tp = (point: number[], mat: Matrix): number[] => { const q = [point[0], point[1]]; Util.applyTransform(q, mat); return q }

  const base = page.getViewport({ scale: 1 })
  const fitScale = Math.min(W / base.width, H / base.height)
  const vpFit = page.getViewport({ scale: fitScale })
  const offsetX = (W - vpFit.width) / 2
  const offsetY = (H - vpFit.height) / 2

  // Render de alta-resolução só para recortar as imagens.
  const rasterScale = TARGET_PX / base.width
  const vpRaster = page.getViewport({ scale: rasterScale })
  const rc = document.createElement('canvas')
  rc.width = Math.ceil(vpRaster.width); rc.height = Math.ceil(vpRaster.height)
  await page.render({ canvas: rc, canvasContext: rc.getContext('2d')!, viewport: vpRaster }).promise

  const fc = new fabric.StaticCanvas(document.createElement('canvas'), { width: W, height: H, backgroundColor: '#ffffff' })

  // ---- Imagens: percorre a operator list rastreando o CTM ----------------
  try {
    const ops = await page.getOperatorList()
    const ID: Matrix = [1, 0, 0, 1, 0, 0]
    let m: Matrix = ID.slice()
    const stack: Matrix[] = []
    const unit = [[0, 0], [1, 0], [1, 1], [0, 1]]
    let n = 0
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k]
      // save / beginGroup empilham o CTM; restore / endGroup desempilham.
      if (fn === OPS.save || fn === OPS.beginGroup) stack.push(m.slice())
      else if (fn === OPS.restore || fn === OPS.endGroup) m = stack.pop() ?? ID.slice()
      else if (fn === OPS.transform) m = Util.transform(m, ops.argsArray[k])
      // Form XObject: save + aplica a matriz própria (essencial p/ imagens em Canva/PPT).
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(m.slice())
        const mat = ops.argsArray[k]?.[0]
        if (mat) m = Util.transform(m, mat)
      } else if (fn === OPS.paintFormXObjectEnd) m = stack.pop() ?? ID.slice()
      else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        const userPts = unit.map((p) => tp(p, m))
        const rPts = userPts.map((p) => tp(p, vpRaster.transform))
        const fPts = userPts.map((p) => tp(p, vpFit.transform))
        const rb = bboxOf(rPts); const fb = bboxOf(fPts)
        if (rb.w < 4 || rb.h < 4) continue
        diag.found++
        try {
          const blob = await cropToBlob(rc, rb.x, rb.y, rb.w, rb.h)
          const url = await uploadMedia(orgId, new File([blob], `pdf-p${pageIdx}-img${n++}.png`, { type: 'image/png' }), Date.now() + k)
          const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
          img.set({
            left: fb.x + offsetX, top: fb.y + offsetY,
            scaleX: fb.w / (img.width || fb.w), scaleY: fb.h / (img.height || fb.h),
          })
          fc.add(img)
          diag.ok++
        } catch (e) { diag.errors.push((e as Error).message); console.warn('[pdf-import] imagem falhou:', e) }
      }
    }
  } catch (e) { diag.errors.push('operator-list: ' + (e as Error).message); console.warn('[pdf-import] operator list falhou:', e) }

  // ---- Texto: agrupa itens em linhas editáveis ---------------------------
  try {
    const tc = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const styles = (tc as any).styles ?? {}
    type Ln = { left: number; right: number; top: number; baseline: number; fh: number; text: string; ff: string }
    const entries: Ln[] = []
    for (const it of tc.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = it as any
      if (typeof item.str !== 'string' || item.str.trim() === '') continue
      const t = Util.transform(vpFit.transform, item.transform)
      const fh = Math.hypot(t[2], t[3]) || Math.abs(t[3])
      if (fh < 4) continue
      const left = t[4] + offsetX
      const baseline = t[5] + offsetY
      const ff = webFont(styles[item.fontName]?.fontFamily)
      entries.push({ left, right: left + (item.width || 0) * fitScale, top: baseline - fh, baseline, fh, text: item.str, ff })
    }
    entries.sort((a, b) => a.baseline - b.baseline || a.left - b.left)
    const lines: Ln[] = []
    for (const e of entries) {
      const ln = lines[lines.length - 1]
      if (ln && Math.abs(e.baseline - ln.baseline) <= ln.fh * 0.6 && e.left >= ln.left - 2) {
        if (e.left - ln.right > e.fh * 0.25 && !ln.text.endsWith(' ') && !e.text.startsWith(' ')) ln.text += ' '
        ln.text += e.text
        ln.right = Math.max(ln.right, e.right)
        ln.top = Math.min(ln.top, e.top)
        ln.fh = Math.max(ln.fh, e.fh)
      } else {
        lines.push({ ...e })
      }
    }
    for (const ln of lines) {
      const tb = new fabric.Textbox(ln.text, {
        left: ln.left, top: ln.top, width: Math.max(40, ln.right - ln.left + 6),
        fontSize: ln.fh, fontFamily: ln.ff, fill: '#111827',
      })
      fc.add(tb)
    }
  } catch { /* sem camada de texto */ }

  fc.requestRenderAll()
  const conteudo = fc.toObject(['mediaType', 'mediaUrl'])
  const thumb = fc.toDataURL({ format: 'png', multiplier: 0.3 })
  fc.dispose()
  return { conteudo, thumb }
}

/**
 * Importa um PDF como slides. Padrão: cada página vira uma imagem de fundo.
 * Com `editable`, reconstrói texto + imagens como objetos editáveis.
 * Roda 100% no navegador (pdf.js + fabric) e sobe as imagens pro Storage.
 */
export async function renderPdfToSlides(file: File, opts: ImportPdfOpts): Promise<number> {
  const { orgId, createSlide, onProgress, editable } = opts
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  const total = doc.numPages
  onProgress?.(0, total)
  const diag: ImgDiag = { found: 0, ok: 0, errors: [] }

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)

    let slide: { conteudo: unknown; thumb: string }
    if (editable) {
      slide = await buildEditableSlide(page, pdfjs, orgId, i, diag)
    } else {
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: TARGET_PX / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      const blob = await canvasToBlob(canvas)
      const rand = Date.now() + i * 131 + Math.floor(Math.random() * 1000)
      const url = await uploadMedia(orgId, new File([blob], `pdf-p${i}.png`, { type: 'image/png' }), rand)
      slide = await composeImageSlide(url)
    }

    await createSlide(slide.conteudo, slide.thumb)
    page.cleanup()
    onProgress?.(i, total)
  }
  await loadingTask.destroy()
  if (editable) {
    console.log(`[pdf-import] imagens: encontradas=${diag.found} ok=${diag.ok} erros=${diag.errors.length}`, diag.errors)
    if (diag.found > 0 && diag.ok === 0) {
      toast.error(`Nenhuma das ${diag.found} imagens entrou`, { description: diag.errors[0] ?? 'erro desconhecido' })
    } else if (diag.errors.length) {
      toast.warning(`${diag.ok}/${diag.found} imagens importadas`, { description: diag.errors[0] })
    }
  }
  return total
}
