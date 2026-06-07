import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Play, Loader2, RefreshCw, Import, Check, Trash2, ExternalLink, Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/lib/format'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { usePesquisaOrgId } from '../hooks/usePesquisa'
import {
  useAgendaArtists, useArtistasBusca, useAgendaEvents,
  setAgendaUrl, runAgenda, promoverAgendaEvento,
  type AgendaEventRow,
} from '../hooks/useAgenda'

function LinkCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline" title={url}>
      <ExternalLink className="size-3.5 shrink-0" /> abrir
    </a>
  )
}

export function AgendaOficial() {
  const qc = useQueryClient()
  const orgId = usePesquisaOrgId()
  const { profile } = useProfile()
  const editable = profile?.role === 'gestor'
  const artists = useAgendaArtists()

  const [termo, setTermo] = useState('')
  const resultados = useArtistasBusca(termo)
  const [sel, setSel] = useState<{ id: string; nome: string } | null>(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState<string | null>(null)

  const [filtro, setFiltro] = useState('todos')
  const eventos = useAgendaEvents(filtro === 'todos' ? null : filtro)
  const [busy, setBusy] = useState<string | null>(null)

  function escolher(a: { id: string; nome: string; agenda_url: string | null }) {
    setSel({ id: a.id, nome: a.nome }); setUrl(a.agenda_url ?? ''); setTermo('')
  }

  async function salvar() {
    if (!sel) return
    setSaving(true)
    try {
      await setAgendaUrl(sel.id, url.trim() || null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'agenda-artists'] })
      toast.success(url.trim() ? 'URL salva' : 'URL removida', { description: sel.nome })
      setSel(null); setUrl('')
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  async function capturar(artistId?: string) {
    setRunning(artistId ?? '__all__')
    try {
      await runAgenda(artistId)
      toast.success('Captura iniciada', { description: 'Roda em segundo plano.' })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['pesquisa'] }), 4000)
    } catch (e) { toast.error('Falha', { description: (e as Error).message }) }
    finally { setRunning(null) }
  }

  async function promover(ev: AgendaEventRow) {
    if (!orgId) return
    setBusy(ev.id)
    try {
      await promoverAgendaEvento(orgId, ev, profile?.id ?? null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'agenda-events'] })
      toast.success('Copiado para o CRM', { description: ev.nome })
    } catch (e) { toast.error('Erro ao copiar', { description: (e as Error).message }) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda oficial</h1>
          <p className="text-sm text-muted-foreground">Shows capturados dos sites oficiais dos artistas.</p>
        </div>
        {editable && (
          <Button onClick={() => capturar()} disabled={running !== null || (artists.data ?? []).length === 0}>
            {running === '__all__' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Capturar todos
          </Button>
        )}
      </div>

      {editable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Configurar artista</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!sel ? (
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input className="pl-8" value={termo} onChange={(e) => setTermo(e.target.value)}
                  placeholder="Buscar artista cadastrado…" />
                {termo.trim().length >= 2 && (resultados.data ?? []).length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {(resultados.data ?? []).map((a) => (
                      <button key={a.id} onClick={() => escolher(a)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                        <span>{a.nome}</span>
                        {a.agenda_url && <Badge variant="outline" className="text-xs">com URL</Badge>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Artista</span>
                  <div className="flex h-9 items-center rounded-md border px-3 text-sm font-medium">{sel.nome}</div>
                </div>
                <div className="flex-1 space-y-1 min-w-[280px]">
                  <span className="text-xs text-muted-foreground">URL do site oficial do artista</span>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.luansantana.com.br" />
                </div>
                <Button onClick={salvar} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null} Salvar
                </Button>
                <Button variant="ghost" onClick={() => { setSel(null); setUrl('') }}>Cancelar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Artista</TableHead>
            <TableHead>URL da agenda</TableHead>
            <TableHead className="text-right">Shows</TableHead>
            <TableHead className="text-right">Futuros</TableHead>
            <TableHead>Última captura</TableHead>
            {editable && <TableHead className="w-24" />}
          </TableRow></TableHeader>
          <TableBody>
            {artists.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (artists.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                Nenhum artista com agenda configurada. {editable ? 'Configure um artista acima.' : ''}
              </TableCell></TableRow>
            ) : (artists.data ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell className="max-w-[360px] truncate text-muted-foreground" title={a.agenda_url ?? undefined}>{a.agenda_url ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.total}</TableCell>
                <TableCell className="text-right tabular-nums">{a.futuros}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{a.ultima_captura ? fmtDate(a.ultima_captura) : 'nunca'}</TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Capturar agora"
                        disabled={running !== null} onClick={() => capturar(a.id)}>
                        {running === a.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        title="Remover URL" onClick={() => { setSel({ id: a.id, nome: a.nome }); setUrl(''); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <div className="flex items-center justify-between gap-2 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Shows capturados</h2>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[200px]" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os artistas</SelectItem>
            {(artists.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Show</TableHead>
            <TableHead>Artista</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>Cidade/UF</TableHead>
            <TableHead>Site oficial</TableHead>
            <TableHead>Vendas</TableHead>
            <TableHead className="w-12" />
          </TableRow></TableHeader>
          <TableBody>
            {eventos.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (eventos.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                Nenhum show capturado.
              </TableCell></TableRow>
            ) : (eventos.data ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell className="max-w-[260px] truncate font-medium" title={e.nome}>{e.nome}</TableCell>
                <TableCell className="text-muted-foreground">{e.artist_nome ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {e.data ? fmtDate(e.data) : '—'}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground" title={e.local_raw ?? undefined}>{e.local_raw ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : '—'}</TableCell>
                <TableCell><LinkCell url={e.site_url} /></TableCell>
                <TableCell><LinkCell url={e.link_sale} /></TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {e.promovido_crm_event_id ? (
                      <span className="inline-flex size-7 items-center justify-center text-emerald-600" title="No CRM"><Check className="size-4" /></span>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy === e.id || !orgId}
                        title="Copiar para o CRM" onClick={() => promover(e)}>
                        <Import className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}
