import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send, Save, TestTube2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useEmailLists } from '../../hooks/useEmailLists'
import {
  useCampaign, useRecipients, updateCampaign, setCampaignLists, prepareSend,
  type CampaignRow,
} from '../../hooks/useEmailCampaigns'

export function EmailMensagemDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const q = useCampaign(id)

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-sm">
        <button onClick={() => navigate('/comercial/email/mensagens')} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Mensagens
        </button>
      </div>
      {q.isLoading ? (
        <div className="p-6"><Skeleton className="h-96 w-full" /></div>
      ) : !q.data?.campaign ? (
        <div className="p-6 text-muted-foreground">Mensagem não encontrada.</div>
      ) : q.data.campaign.status === 'rascunho' ? (
        <Editor campaign={q.data.campaign} listIds={q.data.listIds} />
      ) : (
        <Envio campaign={q.data.campaign} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Editor({ campaign, listIds }: { campaign: CampaignRow; listIds: string[] }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const listsQ = useEmailLists()
  const [nome, setNome] = useState(campaign.nome)
  const [assunto, setAssunto] = useState(campaign.assunto ?? '')
  const [remNome, setRemNome] = useState(campaign.remetente_nome ?? '')
  const [remEmail, setRemEmail] = useState(campaign.remetente_email ?? '')
  const [replyTo, setReplyTo] = useState(campaign.reply_to ?? '')
  const [html, setHtml] = useState(campaign.html ?? '')
  const [sel, setSel] = useState<Set<string>>(new Set(listIds))
  const [saving, setSaving] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'email', 'campaign', campaign.id] })
    qc.invalidateQueries({ queryKey: ['crm', 'email', 'campaigns'] })
    qc.invalidateQueries({ queryKey: ['crm', 'email', 'recipients', campaign.id] })
  }

  function toggle(listId: string) {
    setSel((s) => { const n = new Set(s); if (n.has(listId)) n.delete(listId); else n.add(listId); return n })
  }

  async function salvar(): Promise<boolean> {
    setSaving(true)
    try {
      await updateCampaign(campaign.id, {
        nome: nome.trim() || 'Nova mensagem', assunto: assunto.trim() || null,
        remetente_nome: remNome.trim() || null, remetente_email: remEmail.trim() || null,
        reply_to: replyTo.trim() || null, html,
      })
      await setCampaignLists(campaign.id, [...sel])
      refresh()
      return true
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message }); return false
    } finally { setSaving(false) }
  }

  async function prepararEnvio() {
    if (sel.size === 0) { toast.error('Selecione ao menos uma lista.'); return }
    if (!assunto.trim() || !html.trim()) { toast.error('Preencha o assunto e o conteúdo.'); return }
    if (!orgId) return
    const ok = await salvar()
    if (!ok) return
    try {
      const n = await prepareSend(orgId, campaign.id)
      toast.success(`${n} destinatário(s) na fila. O disparo será feito na integração com o Resend.`)
      refresh()
    } catch (e) { toast.error('Não foi possível preparar', { description: (e as Error).message }) }
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
      {/* Configuração */}
      <div className="space-y-3 border-b border-border p-5 lg:border-b-0 lg:border-r">
        <Field label="Nome interno"><Input value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="Assunto"><Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto do email" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Remetente (nome)"><Input value={remNome} onChange={(e) => setRemNome(e.target.value)} placeholder="Blueticket" /></Field>
          <Field label="Remetente (email)"><Input value={remEmail} onChange={(e) => setRemEmail(e.target.value)} placeholder="news@…" /></Field>
        </div>
        <Field label="Responder para (opcional)"><Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} /></Field>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Listas de envio</div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {(listsQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma lista. Crie em Listas de email.</p>
            ) : (listsQ.data ?? []).map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={sel.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                {l.nome} <span className="text-xs text-muted-foreground">· {l.inscritos}</span>
              </label>
            ))}
          </div>
        </div>

        <Field label="Conteúdo (HTML)">
          <Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-[240px] font-mono text-xs" placeholder="<html>…cole ou edite o HTML…</html>" />
        </Field>
        <p className="text-xs text-muted-foreground">O link de descadastro (LGPD) será injetado no envio. Variáveis como <code>{'{{nome}}'}</code> serão suportadas no disparo.</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={salvar} disabled={saving}><Save className="size-4" /> Salvar rascunho</Button>
          <Button variant="ghost" size="sm" onClick={() => toast.info('Envio de teste ficará disponível após a integração com o Resend.')}><TestTube2 className="size-4" /> Enviar teste</Button>
          <Button size="sm" onClick={prepararEnvio} disabled={saving}><Send className="size-4" /> Preparar envio</Button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex min-h-[300px] flex-col bg-muted/20 p-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Pré-visualização</div>
        <iframe title="preview" className="min-h-[400px] flex-1 rounded-md border border-border bg-white" sandbox="" srcDoc={html || '<p style="color:#888;font-family:sans-serif;padding:16px">Sem conteúdo ainda.</p>'} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><div className="text-xs font-medium text-muted-foreground">{label}</div>{children}</div>
}

// ---------------------------------------------------------------------------
function Envio({ campaign }: { campaign: CampaignRow }) {
  const recipientsQ = useRecipients(campaign.id)
  const [busca, setBusca] = useState('')
  const recs = useMemo(() => recipientsQ.data ?? [], [recipientsQ.data])

  const stats = useMemo(() => {
    const s = { total: recs.length, enviados: 0, entregues: 0, aberturas: 0, cliques: 0, descadastros: 0, bounces: 0 }
    for (const r of recs) {
      if (r.status !== 'fila') s.enviados++
      if (r.status === 'entregue') s.entregues++
      if (r.status === 'bounce') s.bounces++
      if (r.opened_at) s.aberturas++
      if (r.clicked_at) s.cliques++
      if (r.unsubscribed_at) s.descadastros++
    }
    return s
  }, [recs])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return recs
    return recs.filter((r) => r.nome.toLowerCase().includes(t) || r.email.toLowerCase().includes(t))
  }, [recs, busca])

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{campaign.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {campaign.assunto || 'sem assunto'} · {campaign.status === 'fila' ? 'na fila (aguardando disparo)' : campaign.status}
          {campaign.enviada_em ? ` · ${fmtDate(campaign.enviada_em)}` : ''}
        </p>
      </div>

      {/* Cards de estatística */}
      <div className="grid grid-cols-3 gap-3 border-b border-border p-5 sm:grid-cols-6">
        <Stat label="Total" value={stats.total} />
        <Stat label="Enviados" value={stats.enviados} />
        <Stat label="Entregues" value={stats.entregues} />
        <Stat label="Aberturas" value={stats.aberturas} />
        <Stat label="Cliques" value={stats.cliques} />
        <Stat label="Descadastros" value={stats.descadastros} />
      </div>

      {/* Destinatários */}
      <div className="flex items-center gap-2 px-5 py-2">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar destinatário…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtrados.length} de {recs.length}</span>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto [&_tbody_td]:px-4 [&_tbody_td]:py-1 [&_thead_th]:h-11 [&_thead_th]:border-b [&_thead_th]:border-border [&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:text-xs [&_thead_th]:font-semibold">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Abriu</TableHead>
              <TableHead>Clicou</TableHead>
              <TableHead>Descad.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipientsQ.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum destinatário.</TableCell></TableRow>
            ) : filtrados.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell><span title={r.error ?? undefined}>{r.status}</span></TableCell>
                <TableCell className="text-muted-foreground">{r.opened_at ? fmtDate(r.opened_at) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{r.clicked_at ? fmtDate(r.clicked_at) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{r.unsubscribed_at ? fmtDate(r.unsubscribed_at) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
