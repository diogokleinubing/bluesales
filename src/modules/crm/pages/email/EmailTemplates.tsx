import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useProfile } from '../../hooks/useProfile'
import { createCampaign } from '../../hooks/useEmailCampaigns'
import { TEMPLATES, type TemplateDef } from '../../email/templates'
import { renderNewsletterProduto, type NewsletterProdutoData } from '../../email/newsletterProduto'

const SAMPLE: NewsletterProdutoData = {
  edicao: 'Junho de 2026',
  mensagemInicial: 'Olá! Reunimos aqui as novidades do produto e algumas dicas para você aproveitar melhor a plataforma.',
  destaque: { codigo: 'exemplo', titulo: 'Novo funil de relacionamento', resumo: 'Acompanhe organizações, locais e eventos num único quadro, com sinal de acompanhamento.', cover_url: null },
  novidades: [
    { codigo: 'ex1', titulo: 'Filtro por segmento em Eventos', resumo: 'Agora dá para filtrar a lista de eventos por segmento.', cover_url: null },
    { codigo: 'ex2', titulo: 'GMV manual no local', resumo: 'Defina o GMV do local direto no cadastro.', cover_url: null },
  ],
  comoUsar: [
    { codigo: 'ex3', titulo: 'Registre observações na troca de estágio', resumo: 'Ao mudar o estágio, adicione uma nota que fica no histórico.', cover_url: null },
  ],
  mensagemFinal: 'Continuamos evoluindo com você. Até a próxima!',
}

export function EmailTemplates() {
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
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setCreating(null) }
  }

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-sm">
        <button onClick={() => navigate('/comercial/email/mensagens')} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Mensagens
        </button>
      </div>
      <div className="border-b border-border px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">Modelos prontos para criar mensagens.</p>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="flex flex-col rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">{t.nome}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.descricao}</p>
            <ul className="my-3 space-y-0.5 text-xs text-muted-foreground">
              {t.secoes.map((s) => <li key={s.key}>• {s.label}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreview(t)}><Eye className="size-4" /> Pré-visualizar</Button>
              <Button size="sm" onClick={() => usar(t)} disabled={creating === t.id}><Plus className="size-4" /> Usar</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Pré-visualização — {preview?.nome}</DialogTitle></DialogHeader>
          <iframe
            title="preview-template"
            className="h-[70vh] w-full rounded-md border border-border bg-white"
            sandbox=""
            srcDoc={preview ? renderNewsletterProduto(SAMPLE, { baseUrl: window.location.origin }) : ''}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
