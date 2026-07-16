import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ImagePlus, ExternalLink, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { renderMarkdown } from '@/lib/markdown'
import {
  useConteudos, createConteudo, updateConteudo, deleteConteudo, uploadConteudoImage,
  type ConteudoRow, type ConteudoSecao,
} from '../../hooks/useConteudos'

/**
 * Editor por seções da Newsletter de Produto. Mensagem inicial/final são texto
 * (guardadas no template_data da campanha). Destaque/Novidades/Como usar são
 * matérias (linhas em crm_conteudos) com resumo (newsletter) + conteúdo (landing).
 */
export function NewsletterSectionEditor({
  orgId, campaignId, edicao, mensagemInicial, mensagemFinal,
  onEdicao, onMensagemInicial, onMensagemFinal,
}: {
  orgId: string
  campaignId: string
  edicao: string
  mensagemInicial: string
  mensagemFinal: string
  onEdicao: (v: string) => void
  onMensagemInicial: (v: string) => void
  onMensagemFinal: (v: string) => void
}) {
  const qc = useQueryClient()
  const q = useConteudos(campaignId)
  const conteudos = q.data ?? []
  const bySecao = (s: ConteudoSecao) => conteudos.filter((c) => c.secao === s).sort((a, b) => a.ordem - b.ordem)
  const destaque = bySecao('destaque')[0] ?? null
  const novidades = bySecao('novidade')
  const comoUsar = bySecao('como_usar')

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'conteudos', campaignId] })

  async function adicionar(secao: ConteudoSecao, ordem: number) {
    try {
      await createConteudo(orgId, campaignId, secao, ordem)
      refresh()
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-5">
      <Bloco label="Edição (cabeçalho)">
        <Input value={edicao} onChange={(e) => onEdicao(e.target.value)} placeholder="Ex.: Junho de 2026" />
      </Bloco>

      <Bloco label="Mensagem inicial">
        <Textarea value={mensagemInicial} onChange={(e) => onMensagemInicial(e.target.value)} className="min-h-[80px]" placeholder="Abertura da newsletter…" />
      </Bloco>

      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Secao titulo="Destaque do mês" descricao="Uma matéria em destaque.">
            {destaque ? (
              <MateriaEditor orgId={orgId} materia={destaque} onChanged={refresh} />
            ) : (
              <BotaoAdicionar label="Adicionar destaque" onClick={() => adicionar('destaque', 0)} />
            )}
          </Secao>

          <Secao titulo="Outras novidades" descricao="Lista de novidades de produto.">
            {novidades.map((m) => <MateriaEditor key={m.id} orgId={orgId} materia={m} onChanged={refresh} />)}
            <BotaoAdicionar label="Adicionar novidade" onClick={() => adicionar('novidade', novidades.length)} />
          </Secao>

          <Secao titulo="Como usar melhor" descricao="Dicas de uso.">
            {comoUsar.map((m) => <MateriaEditor key={m.id} orgId={orgId} materia={m} onChanged={refresh} />)}
            <BotaoAdicionar label="Adicionar dica" onClick={() => adicionar('como_usar', comoUsar.length)} />
          </Secao>
        </>
      )}

      <Bloco label="Mensagem final">
        <Textarea value={mensagemFinal} onChange={(e) => onMensagemFinal(e.target.value)} className="min-h-[80px]" placeholder="Encerramento…" />
      </Bloco>
    </div>
  )
}

function Bloco({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><div className="text-xs font-medium text-muted-foreground">{label}</div>{children}</div>
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-semibold">{titulo}</div>
        <div className="text-xs text-muted-foreground">{descricao}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function BotaoAdicionar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="w-full" onClick={onClick}>
      <Plus className="size-4" /> {label}
    </Button>
  )
}

// ---------------------------------------------------------------------------
function MateriaEditor({ orgId, materia, onChanged }: { orgId: string; materia: ConteudoRow; onChanged: () => void }) {
  const [titulo, setTitulo] = useState(materia.titulo)
  const [resumo, setResumo] = useState(materia.resumo ?? '')
  const [corpo, setCorpo] = useState(materia.corpo ?? '')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const conteudoUrl = `${window.location.origin}/conteudo/${materia.codigo}`

  async function salvar(patch: Partial<ConteudoRow>) {
    try {
      await updateConteudo(materia.id, patch)
      onChanged()
    } catch (e) { toast.error('Erro ao salvar', { description: (e as Error).message }) }
  }

  async function enviarCapa(file: File) {
    setUploading(true)
    try {
      const url = await uploadConteudoImage(orgId, file)
      await salvar({ cover_url: url })
    } catch (e) { toast.error('Falha no upload', { description: (e as Error).message }) }
    finally { setUploading(false) }
  }

  async function remover() {
    try { await deleteConteudo(materia.id); onChanged() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={() => titulo !== materia.titulo && salvar({ titulo })}
          placeholder="Título da matéria" className="h-8 font-medium" />
        <button type="button" onClick={remover} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover matéria">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Resumo (aparece na newsletter)</div>
        <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} onBlur={() => resumo !== (materia.resumo ?? '') && salvar({ resumo: resumo.trim() || null })}
          className="min-h-[56px]" placeholder="Resumo curto…" />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Conteúdo completo (markdown — vai para a página)</div>
          <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} onBlur={() => corpo !== (materia.corpo ?? '') && salvar({ corpo: corpo.trim() || null })}
            className="min-h-[160px] font-mono text-xs" placeholder="# Título&#10;&#10;Texto em **markdown**…" />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Pré-visualização</div>
          <div className="min-h-[160px] rounded-md border border-border bg-card p-3 text-sm">
            {corpo.trim()
              ? <div className="prose-conteudo" dangerouslySetInnerHTML={{ __html: renderMarkdown(corpo) }} />
              : <span className="text-muted-foreground">Sem conteúdo.</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {materia.cover_url && <img src={materia.cover_url} alt="" className="h-10 w-16 rounded object-cover" />}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarCapa(f); e.target.value = '' }} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {materia.cover_url ? 'Trocar capa' : 'Capa'}
        </Button>
        {materia.cover_url && (
          <button type="button" onClick={() => salvar({ cover_url: null })} className="text-xs text-muted-foreground hover:text-destructive">Remover capa</button>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={materia.publicado} onCheckedChange={(v) => salvar({ publicado: v === true })} />
          Publicado
        </label>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <a href={conteudoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ExternalLink className="size-3" /> {conteudoUrl}
        </a>
        {!materia.publicado && <span className="text-[var(--warning)]">— publique para o link funcionar</span>}
      </div>
    </div>
  )
}
