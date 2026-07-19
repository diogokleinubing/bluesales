import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  useCampaign, useRecipients, useCampaignClicks, updateCampaign, setCampaignLists, prepareSend,
  type CampaignRow,
} from '../../hooks/useEmailCampaigns'
import { useCampaignConteudos, type CampaignConteudo } from '../../hooks/useConteudos'
import { getTemplate } from '../../email/templates'
import { renderNewsletterProduto } from '../../email/newsletterProduto'
import { NewsletterSectionEditor } from './NewsletterSectionEditor'
import { supabase } from '@/lib/supabase'
import { CONTEUDO_BASE_URL, codigoFromUrl } from '@/lib/conteudo'

const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Chama uma edge function autenticada (JWT do usuário) e devolve o JSON, com erro legível. */
async function callFn(name: string, body: unknown): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j?.error) throw new Error(j?.error || `Erro ${res.status}`)
  return j
}

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

  // Template (newsletter por seções): dados de texto ficam no template_data;
  // as matérias vêm de crm_conteudos e o HTML final é gerado pelo renderer.
  const tpl = getTemplate(campaign.template_id)
  const td = campaign.template_data ?? {}
  const [edicao, setEdicao] = useState(td.edicao ?? '')
  const [msgIni, setMsgIni] = useState(td.mensagemInicial ?? '')
  const [msgFim, setMsgFim] = useState(td.mensagemFinal ?? '')
  const conteudosData = useCampaignConteudos(tpl ? campaign.id : undefined).data
  const finalHtml = useMemo(() => {
    if (!tpl) return html
    const conteudos = conteudosData ?? []
    const ref = (c: CampaignConteudo) => ({ codigo: c.codigo, titulo: c.titulo, resumo: c.resumo, cover_url: c.cover_url })
    const bs = (s: string) => conteudos.filter((c) => c.secao === s).sort((a, b) => a.ordem - b.ordem)
    return renderNewsletterProduto({
      edicao, mensagemInicial: msgIni, mensagemFinal: msgFim,
      destaque: bs('destaque')[0] ? ref(bs('destaque')[0]) : null,
      novidades: bs('novidade').map(ref), comoUsar: bs('como_usar').map(ref),
    }, { baseUrl: CONTEUDO_BASE_URL })
  }, [tpl, html, conteudosData, edicao, msgIni, msgFim])

  const [testEmail, setTestEmail] = useState('')

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
        reply_to: replyTo.trim() || null, html: finalHtml,
        ...(tpl ? { template_data: { edicao, mensagemInicial: msgIni, mensagemFinal: msgFim } } : {}),
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
    if (!assunto.trim() || !finalHtml.trim()) { toast.error('Preencha o assunto e o conteúdo.'); return }
    if (!orgId) return
    const ok = await salvar()
    if (!ok) return
    try {
      const n = await prepareSend(orgId, campaign.id)
      toast.success(`${n} destinatário(s) na fila. Abra a mensagem e use "Disparar agora".`)
      refresh()
    } catch (e) { toast.error('Não foi possível preparar', { description: (e as Error).message }) }
  }

  async function enviarTeste() {
    if (!testEmail.trim()) { toast.error('Informe um email para o teste.'); return }
    const ok = await salvar()
    if (!ok) return
    try {
      await callFn('email-send-sparkpost', { campaignId: campaign.id, testEmail: testEmail.trim() })
      toast.success(`Teste enviado para ${testEmail.trim()}.`)
    } catch (e) { toast.error('Falha no envio de teste', { description: (e as Error).message }) }
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

        {tpl ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Conteúdo · {tpl.nome}</div>
            <NewsletterSectionEditor
              orgId={orgId!} campaignId={campaign.id}
              edicao={edicao} mensagemInicial={msgIni} mensagemFinal={msgFim}
              onEdicao={setEdicao} onMensagemInicial={setMsgIni} onMensagemFinal={setMsgFim}
            />
          </div>
        ) : (
          <Field label="Conteúdo (HTML)">
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-[240px] font-mono text-xs" placeholder="<html>…cole ou edite o HTML…</html>" />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">O link de descadastro (LGPD) será injetado no envio. Variáveis como <code>{'{{nome}}'}</code> serão suportadas no disparo.</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={salvar} disabled={saving}><Save className="size-4" /> Salvar rascunho</Button>
          <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="email p/ teste" className="h-8 w-44" />
          <Button variant="ghost" size="sm" onClick={enviarTeste} disabled={saving || !testEmail.trim()}><TestTube2 className="size-4" /> Enviar teste</Button>
          <Button size="sm" onClick={prepararEnvio} disabled={saving}><Send className="size-4" /> Preparar envio</Button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex min-h-[300px] flex-col bg-muted/20 p-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Pré-visualização</div>
        <iframe title="preview" className="min-h-[400px] flex-1 rounded-md border border-border bg-white" sandbox="" srcDoc={finalHtml || '<p style="color:#888;font-family:sans-serif;padding:16px">Sem conteúdo ainda.</p>'} />
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
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'abriu' | 'clicou'>('todos')
  const [disparando, setDisparando] = useState(false)
  const recs = useMemo(() => recipientsQ.data ?? [], [recipientsQ.data])
  const clicksQ = useCampaignClicks(campaign.id)
  const conteudosQ = useCampaignConteudos(campaign.id)
  const clicksByRec = useMemo(() => {
    const titulo = new Map((conteudosQ.data ?? []).map((c) => [c.codigo, c.titulo]))
    const m = new Map<string, string[]>()
    for (const c of clicksQ.data ?? []) {
      const cod = codigoFromUrl(c.url)
      const label = (cod && titulo.get(cod)) || c.url || 'link'
      const arr = m.get(c.recipient_id) ?? []
      if (!arr.includes(label)) arr.push(label)
      m.set(c.recipient_id, arr)
    }
    return m
  }, [clicksQ.data, conteudosQ.data])

  async function disparar() {
    setDisparando(true)
    try {
      const r = await callFn('email-send-sparkpost', { campaignId: campaign.id })
      toast.success(`Disparado: ${r.sent ?? 0} email(s).`)
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'recipients', campaign.id] })
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'campaign', campaign.id] })
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'campaigns'] })
    } catch (e) { toast.error('Falha no disparo', { description: (e as Error).message }) }
    finally { setDisparando(false) }
  }

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
    return recs.filter((r) => {
      if (filtro === 'abriu' && !r.opened_at) return false
      if (filtro === 'clicou' && !r.clicked_at) return false
      if (t && !(r.nome.toLowerCase().includes(t) || r.email.toLowerCase().includes(t))) return false
      return true
    })
  }, [recs, busca, filtro])

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{campaign.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {campaign.assunto || 'sem assunto'} · {campaign.status === 'fila' ? 'na fila (aguardando disparo)' : campaign.status}
            {campaign.enviada_em ? ` · ${fmtDate(campaign.enviada_em)}` : ''}
          </p>
        </div>
        {campaign.status === 'fila' && (
          <Button size="sm" className="shrink-0" onClick={disparar} disabled={disparando}>
            <Send className="size-4" /> {disparando ? 'Disparando…' : 'Disparar agora'}
          </Button>
        )}
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
      <div className="flex flex-wrap items-center gap-2 px-5 py-2">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar destinatário…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {([['todos', 'Todos'], ['abriu', 'Abriram'], ['clicou', 'Clicaram']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 text-sm transition-colors ${filtro === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
            >
              {label}
            </button>
          ))}
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
                <TableCell className="font-medium">
                  {r.person_id ? (
                    <Link to={`/comercial/contatos/${r.person_id}`} className="text-primary hover:underline">{r.nome}</Link>
                  ) : r.nome}
                </TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell><span title={r.error ?? undefined}>{r.status}</span></TableCell>
                <TableCell className="text-muted-foreground">{r.opened_at ? fmtDate(r.opened_at) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.clicked_at ? (
                    <>
                      {fmtDate(r.clicked_at)}
                      {(clicksByRec.get(r.id) ?? []).length > 0 && (
                        <div className="text-xs">{(clicksByRec.get(r.id) ?? []).join(', ')}</div>
                      )}
                    </>
                  ) : '—'}
                </TableCell>
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
