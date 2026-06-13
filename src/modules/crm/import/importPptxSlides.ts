import * as fabric from 'fabric'
import { unzipSync, strFromU8 } from 'fflate'
import { uploadMedia } from '../hooks/useApresentacoes'

const W = 900
const H = 506 // 16:9 — mesmo tamanho do SlideEditor
const EMU_PER_PT = 12700

export interface ImportPptxOpts {
  orgId: string
  createSlide: (conteudo: unknown, thumb: string) => Promise<string>
  onProgress?: (done: number, total: number) => void
}

// --- helpers de XML ---------------------------------------------------------
function parseXml(s: string): Document {
  return new DOMParser().parseFromString(s, 'application/xml')
}
function kids(node: Element | null): Element[] {
  return node ? Array.from(node.children) : []
}
function kidsTag(node: Element | null, name: string): Element[] {
  return kids(node).filter((c) => c.nodeName === name)
}
function child(node: Element | null, name: string): Element | null {
  return kidsTag(node, name)[0] ?? null
}
function numAttr(el: Element | null, name: string, def = 0): number {
  const v = el?.getAttribute(name); return v == null ? def : Number(v)
}

interface Xfrm { ox: number; oy: number; cx: number; cy: number; chox: number; choy: number; chcx: number; chcy: number; rot: number; flipH: boolean; flipV: boolean }
function getXfrm(pr: Element | null): Xfrm | null {
  const xf = child(pr, 'a:xfrm'); if (!xf) return null
  const off = child(xf, 'a:off'); const ext = child(xf, 'a:ext')
  const cho = child(xf, 'a:chOff'); const che = child(xf, 'a:chExt')
  return {
    ox: numAttr(off, 'x'), oy: numAttr(off, 'y'), cx: numAttr(ext, 'cx'), cy: numAttr(ext, 'cy'),
    chox: numAttr(cho, 'x'), choy: numAttr(cho, 'y'), chcx: numAttr(che, 'cx', 0), chcy: numAttr(che, 'cy', 0),
    rot: numAttr(xf, 'rot') / 60000, flipH: xf.getAttribute('flipH') === '1', flipV: xf.getAttribute('flipV') === '1',
  }
}

// Transform acumulado em EMU: absX = ox + localX*sx
interface T { ox: number; sx: number; oy: number; sy: number }
const IDENT: T = { ox: 0, sx: 1, oy: 0, sy: 1 }
function composeGroup(t: T, xf: Xfrm): T {
  const gx = t.ox + xf.ox * t.sx, gy = t.oy + xf.oy * t.sy
  const gw = xf.cx * t.sx, gh = xf.cy * t.sy
  const sx = xf.chcx ? gw / xf.chcx : t.sx
  const sy = xf.chcy ? gh / xf.chcy : t.sy
  return { ox: gx - xf.chox * sx, sx, oy: gy - xf.choy * sy, sy }
}

// --- helpers de path .rels --------------------------------------------------
function dirname(p: string) { return p.slice(0, p.lastIndexOf('/')) }
function resolvePath(base: string, rel: string): string {
  const parts = (base ? base.split('/') : []).concat(rel.split('/'))
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '..') out.pop()
    else if (seg !== '.' && seg !== '') out.push(seg)
  }
  return out.join('/')
}
function parseRels(xml: string | null, baseDir: string): Record<string, string> {
  const map: Record<string, string> = {}
  if (!xml) return map
  const doc = parseXml(xml)
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = r.getAttribute('Id'); const target = r.getAttribute('Target')
    if (!id || !target) continue
    map[id] = r.getAttribute('TargetMode') === 'External' ? target : resolvePath(baseDir, target)
  }
  return map
}

function mimeOf(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'svg') return 'image/svg+xml'
  if (e === 'gif') return 'image/gif'
  if (e === 'webp') return 'image/webp'
  return 'image/png'
}

// ---------------------------------------------------------------------------
export async function renderPptxToSlides(file: File, opts: ImportPptxOpts): Promise<number> {
  const { orgId, createSlide, onProgress } = opts
  const buf = new Uint8Array(await file.arrayBuffer())
  const zip = unzipSync(buf)
  const getStr = (p: string): string | null => (zip[p] ? strFromU8(zip[p]) : null)

  // Tema (cores de esquema)
  const theme: Record<string, string> = {}
  const themeXml = getStr('ppt/theme/theme1.xml')
  if (themeXml) {
    const clrScheme = parseXml(themeXml).getElementsByTagName('a:clrScheme')[0]
    for (const c of kids(clrScheme)) {
      const key = c.nodeName.replace('a:', '') // dk1, lt1, accent1...
      const srgb = child(c, 'a:srgbClr'); const sys = child(c, 'a:sysClr')
      const v = srgb?.getAttribute('val') ?? sys?.getAttribute('lastClr') ?? sys?.getAttribute('val')
      if (v) theme[key] = '#' + v.replace('#', '')
    }
  }
  function schemeColor(name: string): string | null {
    let key = name
    if (key === 'tx1') key = 'dk1'; else if (key === 'bg1') key = 'lt1'
    else if (key === 'tx2') key = 'dk2'; else if (key === 'bg2') key = 'lt2'
    return theme[key] ?? null
  }
  function solidColor(fillEl: Element | null): string | null {
    if (!fillEl) return null
    const srgb = child(fillEl, 'a:srgbClr'); if (srgb) return '#' + (srgb.getAttribute('val') ?? '000000')
    const sch = child(fillEl, 'a:schemeClr'); if (sch) return schemeColor(sch.getAttribute('val') ?? '')
    return null
  }
  function fillColorOf(pr: Element | null): string | null {
    const solid = child(pr, 'a:solidFill'); if (solid) return solidColor(solid)
    const grad = child(pr, 'a:gradFill')
    if (grad) return solidColor(child(child(grad, 'a:gsLst'), 'a:gs')) // aproxima pelo 1o stop
    return null
  }
  // Freeform (a:custGeom) → string de path SVG em coordenadas do canvas.
  function custGeomToPath(cust: Element, b: { x: number; y: number; w: number; h: number }): string {
    const pathLst = child(cust, 'a:pathLst'); if (!pathLst) return ''
    let d = ''
    for (const p of kidsTag(pathLst, 'a:path')) {
      const pwv = numAttr(p, 'w'), phv = numAttr(p, 'h')
      if (!pwv || !phv) continue
      const mp = (pt: Element | undefined) => {
        if (!pt) return '0 0'
        const x = b.x + (numAttr(pt, 'x') / pwv) * b.w
        const y = b.y + (numAttr(pt, 'y') / phv) * b.h
        return `${x.toFixed(1)} ${y.toFixed(1)}`
      }
      for (const cmd of kids(p)) {
        const pts = kidsTag(cmd, 'a:pt')
        if (cmd.nodeName === 'a:moveTo') d += `M ${mp(pts[0])} `
        else if (cmd.nodeName === 'a:lnTo') d += `L ${mp(pts[0])} `
        else if (cmd.nodeName === 'a:cubicBezTo') d += `C ${mp(pts[0])} ${mp(pts[1])} ${mp(pts[2])} `
        else if (cmd.nodeName === 'a:quadBezTo') d += `Q ${mp(pts[0])} ${mp(pts[1])} `
        else if (cmd.nodeName === 'a:close') d += 'Z '
      }
    }
    return d.trim()
  }

  // Tamanho do slide
  const pres = parseXml(getStr('ppt/presentation.xml') ?? '<x/>')
  const sldSz = pres.getElementsByTagName('p:sldSz')[0]
  const cx = numAttr(sldSz, 'cx', 12192000), cy = numAttr(sldSz, 'cy', 6858000)
  const S = Math.min(W / cx, H / cy)
  const offX = (W - cx * S) / 2, offY = (H - cy * S) / 2

  // Ordem dos slides
  const presRels = parseRels(getStr('ppt/_rels/presentation.xml.rels'), 'ppt')
  const order: string[] = []
  for (const sld of Array.from(pres.getElementsByTagName('p:sldId'))) {
    const rid = sld.getAttribute('r:id')
    if (rid && presRels[rid]) order.push(presRels[rid])
  }
  const total = order.length
  onProgress?.(0, total)

  const mediaCache = new Map<string, string>()
  async function mediaUrl(target: string): Promise<string> {
    const hit = mediaCache.get(target); if (hit) return hit
    const bytes = zip[target]; if (!bytes) throw new Error('mídia ausente: ' + target)
    const ext = target.split('.').pop() ?? 'png'
    const file2 = new File([new Uint8Array(bytes)], target.split('/').pop() ?? 'img', { type: mimeOf(ext) })
    const url = await uploadMedia(orgId, file2, Date.now() + mediaCache.size)
    mediaCache.set(target, url); return url
  }

  // --- conversão de coordenadas ---
  const px = (emuX: number, emuY: number) => ({ x: emuX * S + offX, y: emuY * S + offY })
  const pw = (emu: number) => emu * S
  function boxOf(t: T, xf: Xfrm) {
    const a = px(t.ox + xf.ox * t.sx, t.oy + xf.oy * t.sy)
    return { x: a.x, y: a.y, w: pw(xf.cx * t.sx), h: pw(xf.cy * t.sy) }
  }
  function place(obj: fabric.FabricObject, b: { x: number; y: number; w: number; h: number }, xf: Xfrm) {
    obj.set({ originX: 'center', originY: 'center', left: b.x + b.w / 2, top: b.y + b.h / 2, angle: xf.rot || 0, flipX: xf.flipH, flipY: xf.flipV })
  }

  // --- texto ---
  function emitText(sp: Element, b: { x: number; y: number; w: number; h: number }, xf: Xfrm, fc: fabric.StaticCanvas) {
    const txBody = child(sp, 'p:txBody'); if (!txBody) return
    const paras = kidsTag(txBody, 'a:p')
    let cursorY = b.y
    for (const p of paras) {
      const pPr = child(p, 'a:pPr')
      const algnRaw = pPr?.getAttribute('algn')
      const textAlign = algnRaw === 'ctr' ? 'center' : algnRaw === 'r' ? 'right' : algnRaw === 'just' ? 'justify' : 'left'
      // junta runs preservando quebras
      let text = ''
      let firstRPr: Element | null = null
      for (const node of kids(p)) {
        if (node.nodeName === 'a:r') {
          const rPr = child(node, 'a:rPr'); if (!firstRPr && rPr) firstRPr = rPr
          text += child(node, 'a:t')?.textContent ?? ''
        } else if (node.nodeName === 'a:br') text += '\n'
        else if (node.nodeName === 'a:fld') text += child(node, 'a:t')?.textContent ?? ''
      }
      if (!text.trim()) { continue }
      const rPr = firstRPr ?? child(pPr, 'a:defRPr')
      const sz = numAttr(rPr, 'sz', 1800) / 100 // pt
      const fontSize = Math.max(6, sz * EMU_PER_PT * S)
      const fill = solidColor(child(rPr, 'a:solidFill')) ?? '#111827'
      const latin = child(rPr, 'a:latin')?.getAttribute('typeface')
      const bold = rPr?.getAttribute('b') === '1'
      const italic = rPr?.getAttribute('i') === '1'
      const uVal = rPr?.getAttribute('u'); const underline = !!uVal && uVal !== 'none'
      const tb = new fabric.Textbox(text, {
        width: Math.max(20, b.w), fontSize, fill, textAlign,
        fontFamily: latin || 'Arial', fontWeight: bold ? 'bold' : 'normal',
        fontStyle: italic ? 'italic' : 'normal', underline,
      })
      // posiciona empilhando parágrafos; rotação só quando o shape inteiro gira.
      if (xf.rot) {
        place(tb, b, xf)
      } else {
        tb.set({ left: b.x, top: cursorY })
        cursorY += tb.height ?? fontSize * 1.2
      }
      fc.add(tb)
    }
  }

  // --- um shape (forma + preenchimento + texto) ---
  async function handleSp(sp: Element, t: T, fc: fabric.StaticCanvas) {
    const spPr = child(sp, 'p:spPr')
    const xf = getXfrm(spPr); if (!xf) { /* sem geometria: tenta só texto sem posição precisa */ return }
    const b = boxOf(t, xf)
    const blip = child(spPr, 'a:blipFill') ? child(child(spPr, 'a:blipFill'), 'a:blip') : null

    if (blip) {
      // shape preenchido com imagem → trata como imagem
      const rid = blip.getAttribute('r:embed') ?? blip.getAttribute('r:link')
      const target = rid ? currentRels[rid] : null
      if (target) {
        try {
          const url = await mediaUrl(target)
          const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
          img.set({ scaleX: b.w / (img.width || b.w), scaleY: b.h / (img.height || b.h) })
          place(img, b, xf); fc.add(img)
        } catch { /* ignora imagem com problema */ }
      }
    } else {
      const fillColor = fillColorOf(spPr)
      const hasNoFill = !!child(spPr, 'a:noFill')
      const prstEl = child(spPr, 'a:prstGeom')
      const custEl = child(spPr, 'a:custGeom')
      if (fillColor && !hasNoFill) {
        if (prstEl) {
          const prst = prstEl.getAttribute('prst') ?? 'rect'
          let shape: fabric.FabricObject
          if (prst === 'ellipse') shape = new fabric.Ellipse({ rx: b.w / 2, ry: b.h / 2, fill: fillColor })
          else if (prst === 'line' || prst.startsWith('straightConnector')) shape = new fabric.Line([b.x, b.y, b.x + b.w, b.y + b.h], { stroke: fillColor, strokeWidth: 2 })
          else shape = new fabric.Rect({ width: b.w, height: b.h, fill: fillColor, rx: prst === 'roundRect' ? Math.min(b.w, b.h) * 0.08 : 0, ry: prst === 'roundRect' ? Math.min(b.w, b.h) * 0.08 : 0 })
          if (shape.type !== 'line') place(shape, b, xf)
          fc.add(shape)
        } else if (custEl) {
          const d = custGeomToPath(custEl, b)
          if (d) fc.add(new fabric.Path(d, { fill: fillColor }))
        }
      }
    }
    emitText(sp, b, xf, fc)
  }

  // --- uma imagem (<p:pic>) ---
  async function handlePic(pic: Element, t: T, fc: fabric.StaticCanvas) {
    const spPr = child(pic, 'p:spPr')
    const xf = getXfrm(spPr); if (!xf) return
    const b = boxOf(t, xf)
    const blip = child(child(pic, 'p:blipFill'), 'a:blip')
    const rid = blip?.getAttribute('r:embed') ?? blip?.getAttribute('r:link')
    const target = rid ? currentRels[rid] : null
    if (!target) return
    try {
      const url = await mediaUrl(target)
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
      img.set({ scaleX: b.w / (img.width || b.w), scaleY: b.h / (img.height || b.h) })
      place(img, b, xf); fc.add(img)
    } catch { /* ignora */ }
  }

  // --- percorre a árvore de shapes em ordem (z-order) ---
  async function walk(node: Element, t: T, fc: fabric.StaticCanvas) {
    for (const el of kids(node)) {
      try {
        if (el.nodeName === 'p:sp') await handleSp(el, t, fc)
        else if (el.nodeName === 'p:pic') await handlePic(el, t, fc)
        else if (el.nodeName === 'p:grpSp') {
          const xf = getXfrm(child(el, 'p:grpSpPr'))
          await walk(el, xf ? composeGroup(t, xf) : t, fc)
        }
      } catch (e) { console.warn('[pptx] elemento ignorado:', e) }
    }
  }

  let currentRels: Record<string, string> = {}
  for (let i = 0; i < total; i++) {
    const slidePath = order[i]
    const baseDir = dirname(slidePath)
    currentRels = parseRels(getStr(`${baseDir}/_rels/${slidePath.split('/').pop()}.rels`), baseDir)
    const doc = parseXml(getStr(slidePath) ?? '<x/>')

    const fc = new fabric.StaticCanvas(document.createElement('canvas'), { width: W, height: H, backgroundColor: '#ffffff' })

    // fundo do slide
    const bg = doc.getElementsByTagName('p:bg')[0]
    if (bg) {
      const bgPr = child(bg, 'p:bgPr')
      const solid = solidColor(child(bgPr, 'a:solidFill'))
      if (solid) fc.backgroundColor = solid
      const bgBlip = child(child(bgPr, 'a:blipFill'), 'a:blip')
      const rid = bgBlip?.getAttribute('r:embed')
      if (rid && currentRels[rid]) {
        try {
          const url = await mediaUrl(currentRels[rid])
          const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
          img.set({ left: 0, top: 0, scaleX: W / (img.width || W), scaleY: H / (img.height || H), selectable: true })
          fc.add(img)
        } catch { /* ignora */ }
      }
    }

    const spTree = doc.getElementsByTagName('p:spTree')[0]
    if (spTree) await walk(spTree, IDENT, fc)

    fc.requestRenderAll()
    const conteudo = fc.toObject(['mediaType', 'mediaUrl'])
    const thumb = fc.toDataURL({ format: 'png', multiplier: 0.3 })
    fc.dispose()
    await createSlide(conteudo, thumb)
    onProgress?.(i + 1, total)
  }

  return total
}
