import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ImagePlus, ExternalLink, Loader2, Eye, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ListView } from '../../components/ListView'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { renderMarkdown } from '@/lib/markdown'
import { conteudoUrl, CONTEUDO_BASE_URL } from '@/lib/conteudo'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useProfile } from '../../hooks/useProfile'
import {
  useConteudos, createConteudo, updateConteudo, deleteConteudo, uploadConteudoImage,
  useConteudoCategorias, createCategoria, updateCategoria, deleteCategoria,
  CONTEUDO_STATUS, type ConteudoRow, type ConteudoStatus, type CategoriaRow,
} from '../../hooks/useConteudos'
import { createCampaign } from '../../hooks/useEmailCampaigns'
import { TEMPLATES, type TemplateDef } from '../../email/templates'
import { renderNewsletterProduto, type NewsletterProdutoData } from '../../email/newsletterProduto'

const STATUS_CLS: Record<ConteudoStatus, string> = {
  rascunho: 'text-muted-foreground',
  pronto: 'text-[var(--success)]',
  utilizado: 'text-[var(--warning)]',
}

export function ConteudoBiblioteca() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'templates' ? 'templates' : 'artigos'
  const setTab = (t: string) => setParams((p) => { p.set('tab', t); return p }, { replace: true })

  return (
    <ListView title="Conteúdo">
      <div className="mb-4 flex gap-1 border-b border-border px-1">
        {(['artigos', 'templates'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'templates' ? <TemplatesTab /> : <ArtigosTab />}
    </ListView>
  )
}

// ---------------------------------------------------------------------------
function ArtigosTab() {
  const orgId = useCrmOrgId()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('')
  const [statusSel, setStatusSel] = useState<ConteudoStatus[]>(['rascunho', 'pronto'])
  const cats = useConteudoCategorias()
  const q = useConteudos({ search, categoriaId: catFilter || null, status: statusSel })
  const [edit, setEdit] = useState<ConteudoRow | null | undefined>(undefined) // undefined = fechado, null = novo
  const [catsOpen, setCatsOpen] = useState(false)

  function toggleStatus(s: ConteudoStatus) {
    setStatusSel((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])
  }

  return (
    <div className="space-y-3 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar título…" className="h-8 w-56" />
        <Select value={catFilter || '__all__'} onValueChange={(v) => setCatFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 w-48" size="sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {(cats.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          {CONTEUDO_STATUS.map((s) => (
            <button key={s.value} onClick={() => toggleStatus(s.value)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                statusSel.includes(s.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary')}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatsOpen(true)}><Tag className="size-4" /> Categorias</Button>
          <Button size="sm" onClick={() => setEdit(null)}><Plus className="size-4" /> Novo artigo</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead><TableHead>Categoria</TableHead>
            <TableHead>Status</TableHead><TableHead>Criado</TableHead><TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)
          ) : (q.data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum artigo</TableCell></TableRow>
          ) : (q.data ?? []).map((a) => (
            <TableRow key={a.id} className="cursor-pointer" onClick={() => setEdit(a)}>
              <TableCell className="font-medium"><div className="max-w-[320px] truncate">{a.titulo || '(sem título)'}</div></TableCell>
              <TableCell className="text-muted-foreground">{a.categoria_nome ?? '—'}</TableCell>
              <TableCell><Badge variant="secondary" className={STATUS_CLS[a.status]}>{CONTEUDO_STATUS.find((s) => s.value === a.status)?.label}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <a href={conteudoUrl(a.codigo)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary" title="Abrir página"><ExternalLink className="size-4" /></a>
                  <button onClick={(e) => { e.stopPropagation(); setEdit(a) }} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="size-4" /></button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {edit !== undefined && (
        <ArtigoDialog orgId={orgId ?? ''} artigo={edit} categorias={cats.data ?? []} onClose={() => setEdit(undefined)} onSaved={() => q.refetch()} />
      )}
      {catsOpen && <CategoriasDialog orgId={orgId ?? ''} onClose={() => { setCatsOpen(false); cats.refetch() }} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ArtigoDialog({ orgId, artigo, categorias, onClose, onSaved }: {
  orgId: string; artigo: ConteudoRow | null; categorias: CategoriaRow[]; onClose: () => void; onSaved: () => void
}) {
  const { profile } = useProfile()
  const [titulo, setTitulo] = useState(artigo?.titulo ?? '')
  const [resumo, setResumo] = useState(artigo?.resumo ?? '')
  const [corpo, setCorpo] = useState(artigo?.corpo ?? '')
  const [coverUrl, setCoverUrl] = useState(artigo?.cover_url ?? '')
  const [categoriaId, setCategoriaId] = useState(artigo?.categoria_id ?? '')
  const [status, setStatus] = useState<ConteudoStatus>(artigo?.status ?? 'rascunho')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function enviarCapa(file: File) {
    setUploading(true)
    try { setCoverUrl(await uploadConteudoImage(orgId, file)) }
    catch (e) { toast.error('Falha no upload', { description: (e as Error).message }) }
    finally { setUploading(false) }
  }

  async function salvar() {
    if (!orgId) return
    setSaving(true)
    try {
      const patch = {
        titulo: titulo.trim(), resumo: resumo.trim() || null, corpo: corpo.trim() || null,
        cover_url: coverUrl || null, categoria_id: categoriaId || null, status,
      }
      if (artigo) await updateConteudo(artigo.id, patch)
      else { const c = await createConteudo(orgId, profile?.id); await updateConteudo(c.id, patch) }
      onSaved(); onClose()
    } catch (e) { toast.error('Erro ao salvar', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  async function remover() {
    if (!artigo) return
    try { await deleteConteudo(artigo.id); onSaved(); onClose() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>{artigo ? 'Editar artigo' : 'Novo artigo'}</DialogTitle></DialogHeader>
        <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" className="font-medium" autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Select value={categoriaId || '__none__'} onValueChange={(v) => setCategoriaId(v === '__none__' ? '' : v)}>
              <SelectTrigger size="sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— sem categoria</SelectItem>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as ConteudoStatus)}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTEUDO_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Descrição (resumo que aparece na newsletter)</div>
            <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} className="min-h-[60px]" placeholder="Resumo curto…" />
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Conteúdo completo (markdown — vai para a página)</div>
              <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} className="min-h-[220px] font-mono text-xs" placeholder="# Título&#10;&#10;Texto em **markdown**…" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Pré-visualização</div>
              <div className="min-h-[220px] rounded-md border border-border bg-card p-3 text-sm">
                {corpo.trim() ? <div className="prose-conteudo" dangerouslySetInnerHTML={{ __html: renderMarkdown(corpo) }} /> : <span className="text-muted-foreground">Sem conteúdo.</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {coverUrl && <img src={coverUrl} alt="" className="h-10 w-16 rounded object-cover" />}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarCapa(f); e.target.value = '' }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {coverUrl ? 'Trocar capa' : 'Capa'}
            </Button>
            {coverUrl && <button type="button" onClick={() => setCoverUrl('')} className="text-xs text-muted-foreground hover:text-destructive">Remover capa</button>}
          </div>
          {artigo && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <a href={conteudoUrl(artigo.codigo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="size-3" /> {conteudoUrl(artigo.codigo)}
              </a>
              {status === 'rascunho' && <span className="text-[var(--warning)]">— rascunho não abre publicamente</span>}
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {artigo ? (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={remover}><Trash2 className="size-4" /> Excluir</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving || !titulo.trim()}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
function CategoriasDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { profile } = useProfile()
  const q = useConteudoCategorias()
  const [nova, setNova] = useState('')

  async function add() {
    if (!nova.trim() || !orgId) return
    try { await createCategoria(orgId, nova, profile?.id); setNova(''); q.refetch() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function renomear(c: CategoriaRow, nome: string) {
    if (!nome.trim() || nome === c.nome) return
    try { await updateCategoria(c.id, nome); q.refetch() } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function remover(id: string) {
    try { await deleteCategoria(id); q.refetch() } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Categorias de conteúdo</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova categoria" onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Button onClick={add} disabled={!nova.trim()}><Plus className="size-4" /></Button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {(q.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma categoria</p>
            ) : (q.data ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                <Input defaultValue={c.nome} className="h-7 flex-1" onBlur={(e) => renomear(c, e.target.value)} />
                <button onClick={() => remover(c.id)} className="text-muted-foreground hover:text-destructive" title="Excluir"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
const SAMPLE: NewsletterProdutoData = {
  edicao: 'Junho de 2026',
  mensagemInicial: 'Olá! Reunimos aqui as novidades do produto e algumas dicas para você aproveitar melhor a plataforma.',
  destaque: { codigo: 'exemplo', titulo: 'Novo funil de relacionamento', resumo: 'Acompanhe organizações, locais e eventos num único quadro.', cover_url: null },
  novidades: [{ codigo: 'ex1', titulo: 'Filtro por segmento em Eventos', resumo: 'Agora dá para filtrar a lista por segmento.', cover_url: null }],
  comoUsar: [{ codigo: 'ex2', titulo: 'Observações na troca de estágio', resumo: 'Ao mudar o estágio, adicione uma nota ao histórico.', cover_url: null }],
  mensagemFinal: 'Continuamos evoluindo com você. Até a próxima!',
}

function TemplatesTab() {
  const navigate = useNavigate()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const [creating, setCreating] = useState<string | null>(null)
  const [preview, setPreview] = useState<TemplateDef | null>(null)

  async function usar(t: TemplateDef) {
    if (!orgId) return
    setCreating(t.id)
    try {
      const id = await createCampaign(orgId, `Newsletter — ${t.nome}`, profile?.id, t.id)
      navigate(`/comercial/email/mensagens/${id}`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setCreating(null) }
  }

  return (
    <div className="grid gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((t) => (
        <div key={t.id} className="flex flex-col rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">{t.nome}</h3>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.descricao}</p>
          <ul className="my-3 space-y-0.5 text-xs text-muted-foreground">{t.secoes.map((s) => <li key={s.key}>• {s.label}</li>)}</ul>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(t)}><Eye className="size-4" /> Pré-visualizar</Button>
            <Button size="sm" onClick={() => usar(t)} disabled={creating === t.id}><Plus className="size-4" /> Usar</Button>
          </div>
        </div>
      ))}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Pré-visualização — {preview?.nome}</DialogTitle></DialogHeader>
          <iframe title="preview-template" className="h-[70vh] w-full rounded-md border border-border bg-white" sandbox=""
            srcDoc={preview ? renderNewsletterProduto(SAMPLE, { baseUrl: CONTEUDO_BASE_URL }) : ''} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
