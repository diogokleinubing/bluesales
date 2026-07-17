import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useConteudos, useCampaignConteudos, addCampaignConteudo, removeCampaignConteudo,
  CONTEUDO_STATUS, type ConteudoSecao, type ConteudoStatus,
} from '../../hooks/useConteudos'

const SECOES: { key: ConteudoSecao; label: string; descricao: string; single?: boolean }[] = [
  { key: 'destaque', label: 'Destaque do mês', descricao: 'Uma matéria em destaque.', single: true },
  { key: 'novidade', label: 'Outras novidades', descricao: 'Novidades de produto.' },
  { key: 'como_usar', label: 'Como usar melhor', descricao: 'Dicas de uso.' },
]

const STATUS_CLS: Record<ConteudoStatus, string> = {
  rascunho: 'text-muted-foreground', pronto: 'text-[var(--success)]', utilizado: 'text-[var(--warning)]',
}

/**
 * Editor por seções da newsletter: as seções agora SELECIONAM artigos já criados
 * na biblioteca de Conteúdo (vínculo em email_campaign_conteudos). Mensagem
 * inicial/final continuam como texto no template_data.
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
  const q = useCampaignConteudos(campaignId)
  const links = q.data ?? []
  const [picker, setPicker] = useState<ConteudoSecao | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'campaign-conteudos', campaignId] })

  async function remover(joinId: string) {
    try { await removeCampaignConteudo(joinId); refresh() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }
  async function adicionar(conteudoId: string, secao: ConteudoSecao) {
    const ordem = links.filter((l) => l.secao === secao).length
    try { await addCampaignConteudo(orgId, campaignId, conteudoId, secao, ordem); refresh(); setPicker(null) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-5">
      <Bloco label="Edição (cabeçalho)">
        <Input value={edicao} onChange={(e) => onEdicao(e.target.value)} placeholder="Ex.: Junho de 2026" />
      </Bloco>
      <Bloco label="Mensagem inicial">
        <Textarea value={mensagemInicial} onChange={(e) => onMensagemInicial(e.target.value)} className="min-h-[80px]" placeholder="Abertura da newsletter…" />
      </Bloco>

      {q.isLoading ? <Skeleton className="h-40 w-full" /> : SECOES.map((sec) => {
        const itens = links.filter((l) => l.secao === sec.key).sort((a, b) => a.ordem - b.ordem)
        const podeAdd = !sec.single || itens.length === 0
        return (
          <div key={sec.key} className="space-y-2 rounded-lg border border-border p-3">
            <div><div className="text-sm font-semibold">{sec.label}</div><div className="text-xs text-muted-foreground">{sec.descricao}</div></div>
            <div className="space-y-1.5">
              {itens.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{it.titulo || '(sem título)'}</span>
                    <Badge variant="secondary" className={STATUS_CLS[it.status]}>{CONTEUDO_STATUS.find((s) => s.value === it.status)?.label}</Badge>
                  </span>
                  <button onClick={() => remover(it.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="size-4" /></button>
                </div>
              ))}
              {podeAdd && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPicker(sec.key)}>
                  <Plus className="size-4" /> Selecionar conteúdo
                </Button>
              )}
            </div>
          </div>
        )
      })}

      <Bloco label="Mensagem final">
        <Textarea value={mensagemFinal} onChange={(e) => onMensagemFinal(e.target.value)} className="min-h-[80px]" placeholder="Encerramento…" />
      </Bloco>

      {picker && (
        <ArtigoPicker
          secao={picker}
          jaLinkados={links.map((l) => l.conteudo_id)}
          onPick={(id) => adicionar(id, picker)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

function Bloco({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><div className="text-xs font-medium text-muted-foreground">{label}</div>{children}</div>
}

function ArtigoPicker({ secao, jaLinkados, onPick, onClose }: {
  secao: ConteudoSecao; jaLinkados: string[]; onPick: (id: string) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const q = useConteudos({ search })
  const disponiveis = (q.data ?? []).filter((a) => !jaLinkados.includes(a.id))
  const label = SECOES.find((s) => s.key === secao)?.label ?? ''

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Selecionar conteúdo · {label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Buscar artigo…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {q.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : disponiveis.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum artigo disponível. Crie em Conteúdo.</p>
            ) : disponiveis.map((a) => (
              <button key={a.id} onClick={() => onPick(a.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left hover:border-primary">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.titulo || '(sem título)'}</span>
                  {a.resumo && <span className="block truncate text-xs text-muted-foreground">{a.resumo}</span>}
                </span>
                <Badge variant="secondary" className={`shrink-0 ${STATUS_CLS[a.status]}`}>{CONTEUDO_STATUS.find((s) => s.value === a.status)?.label}</Badge>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
