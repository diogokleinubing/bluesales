import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, LayoutTemplate, FileCode2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOpenItem } from '@/lib/useOpenItem'
import { fmtDate } from '@/lib/format'
import { ListView } from '../../components/ListView'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useProfile } from '../../hooks/useProfile'
import { useEmailCampaigns, createCampaign, type CampaignStatus } from '../../hooks/useEmailCampaigns'
import { TEMPLATES } from '../../email/templates'

const STATUS_LABEL: Record<CampaignStatus, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'text-muted-foreground' },
  fila: { label: 'Na fila', cls: 'text-[var(--warning)]' },
  enviada: { label: 'Enviada', cls: 'text-[var(--success)]' },
  cancelada: { label: 'Cancelada', cls: 'text-destructive' },
}

function pct(part: number, whole: number) {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export function EmailMensagens() {
  const navigate = useNavigate()
  const openItem = useOpenItem()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const { data, isLoading } = useEmailCampaigns()
  const [creating, setCreating] = useState(false)
  const [novoOpen, setNovoOpen] = useState(false)

  async function nova(templateId: string | null, nome: string) {
    if (!orgId) return
    setCreating(true)
    try {
      const id = await createCampaign(orgId, nome, profile?.id, templateId)
      navigate(`/comercial/email/mensagens/${id}`)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setCreating(false); setNovoOpen(false) }
  }

  return (
    <>
    <ListView
      title="Mensagens"
      count={data ? `${data.length} mensagens` : undefined}
      actions={<Button size="sm" onClick={() => setNovoOpen(true)}><Plus className="size-4" /> Nova mensagem</Button>}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mensagem</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Envio</TableHead>
            <TableHead className="text-right">Enviados</TableHead>
            <TableHead className="text-right">Entregues</TableHead>
            <TableHead className="text-right">Aberturas</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">Descad.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : (data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma mensagem ainda.</TableCell></TableRow>
          ) : (data ?? []).map((c) => {
            const s = c.stats
            const st = STATUS_LABEL[c.status]
            const href = `/comercial/email/mensagens/${c.id}`
            return (
              <TableRow key={c.id} className="cursor-pointer" onClick={(e) => openItem(e, href)}>
                <TableCell className="font-medium">
                  <div className="max-w-[280px] truncate" title={c.nome}>{c.nome}</div>
                  {c.assunto && <div className="max-w-[280px] truncate text-xs text-muted-foreground">{c.assunto}</div>}
                </TableCell>
                <TableCell><Badge variant="secondary" className={st.cls}>{st.label}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.enviada_em ? fmtDate(c.enviada_em) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.enviados || (c.status === 'fila' ? s.total : 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.entregues}</TableCell>
                <TableCell className="text-right tabular-nums">{s.aberturas} <span className="text-xs text-muted-foreground">{pct(s.aberturas, s.enviados)}</span></TableCell>
                <TableCell className="text-right tabular-nums">{s.cliques} <span className="text-xs text-muted-foreground">{pct(s.cliques, s.enviados)}</span></TableCell>
                <TableCell className="text-right tabular-nums">{s.descadastros}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ListView>

    <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova mensagem</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <button onClick={() => nova(null, 'Nova mensagem')} disabled={creating}
            className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary disabled:opacity-60">
            <FileCode2 className="size-5 shrink-0 text-muted-foreground" />
            <span><span className="block text-sm font-medium">Em branco</span><span className="block text-xs text-muted-foreground">Cole ou edite o HTML direto.</span></span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => nova(t.id, `Newsletter — ${t.nome}`)} disabled={creating}
              className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary disabled:opacity-60">
              <LayoutTemplate className="size-5 shrink-0 text-primary" />
              <span><span className="block text-sm font-medium">{t.nome}</span><span className="block text-xs text-muted-foreground">{t.descricao}</span></span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
