import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { Ban, RotateCcw, ArrowUpRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fmtBRL, fmtDate } from '@/lib/format'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { CopyUrlButton } from '../components/CopyUrlButton'
import {
  useCrawledEvents, useCrawlerSources, usePesquisaOrgId,
  setEventoIgnorado, promoverEvento, type CrawledEventRow,
} from '../hooks/usePesquisa'

type StatusFiltro = 'ativos' | 'promovidos' | 'ignorados' | 'todos'

function preco(ev: CrawledEventRow): string {
  if (ev.gratuito) return 'Grátis'
  if (ev.preco_min == null && ev.preco_max == null) return '—'
  if (ev.preco_max != null && ev.preco_max !== ev.preco_min) {
    return `${fmtBRL(ev.preco_min ?? 0)} – ${fmtBRL(ev.preco_max)}`
  }
  return fmtBRL(ev.preco_min ?? ev.preco_max)
}

export function EventosCapturados() {
  const qc = useQueryClient()
  const orgId = usePesquisaOrgId()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { data, isLoading } = useCrawledEvents()
  const sources = useCrawlerSources()

  const [search, setSearch] = useState('')
  const [fonte, setFonte] = useState('todas')
  const [status, setStatus] = useState<StatusFiltro>('ativos')
  const [cidade, setCidade] = useState('todas')
  const [categoria, setCategoria] = useState('todas')
  const [busy, setBusy] = useState<string | null>(null)

  const cidades = useMemo(() => {
    const s = new Set<string>()
    for (const e of data ?? []) if (e.cidade) s.add(`${e.cidade}${e.uf ? `/${e.uf}` : ''}`)
    return [...s].sort()
  }, [data])

  const categorias = useMemo(() => {
    const s = new Set<string>()
    for (const e of data ?? []) if (e.categoria) s.add(e.categoria)
    return [...s].sort()
  }, [data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) => {
      if (q && !e.nome.toLowerCase().includes(q) &&
        !(e.organizador_raw ?? '').toLowerCase().includes(q) &&
        !(e.local_raw ?? '').toLowerCase().includes(q)) return false
      if (fonte !== 'todas' && e.source_slug !== fonte) return false
      if (cidade !== 'todas' && `${e.cidade}${e.uf ? `/${e.uf}` : ''}` !== cidade) return false
      if (categoria !== 'todas' && e.categoria !== categoria) return false
      const promovido = !!e.promovido_crm_event_id
      if (status === 'ativos' && (e.ignorado || promovido)) return false
      if (status === 'promovidos' && !promovido) return false
      if (status === 'ignorados' && !e.ignorado) return false
      return true
    })
  }, [data, search, fonte, cidade, categoria, status])

  async function onIgnorar(ev: CrawledEventRow, ignorar: boolean) {
    setBusy(ev.id)
    try {
      await setEventoIgnorado(ev.id, ignorar)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setBusy(null) }
  }

  async function onPromover(ev: CrawledEventRow) {
    if (!orgId) return
    setBusy(ev.id)
    try {
      await promoverEvento(orgId, ev, profile?.id ?? null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events'] })
      toast.success('Evento promovido ao Comercial', {
        action: { label: 'Abrir', onClick: () => navigate('/comercial/eventos') },
        description: ev.nome,
      })
    } catch (e) {
      toast.error('Erro ao promover', { description: (e as Error).message })
    } finally { setBusy(null) }
  }

  return (
    <ListView
      title="Eventos capturados"
      count={data ? String(data.length) : undefined}
      footer={data ? `${rows.length} de ${data.length}` : undefined}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar evento, local, organizador…" />
          <Select value={fonte} onValueChange={setFonte}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[150px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as fontes</SelectItem>
              {(sources.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.slug}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cidade} onValueChange={setCidade}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[150px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as cidades</SelectItem>
              {cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {categorias.length > 0 && (
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[170px]`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFiltro)}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[140px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="promovidos">Promovidos</SelectItem>
              <SelectItem value="ignorados">Ignorados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Evento</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Preço</TableHead>
          <TableHead className="w-32" />
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
              Nenhum evento capturado ainda. Rode uma coleta em Configuração → Fontes.
            </TableCell></TableRow>
          ) : rows.map((e) => {
            const promovido = !!e.promovido_crm_event_id
            return (
              <TableRow
                key={e.id}
                className={e.ignorado ? 'opacity-50' : ''}
              >
                <TableCell className="max-w-[280px]">
                  <div className="truncate font-medium">{e.nome}</div>
                  {e.organizador_raw && (
                    <div className="truncate text-xs text-muted-foreground">{e.organizador_raw}</div>
                  )}
                </TableCell>
                <TableCell><Badge variant="outline">{e.source_nome ?? e.source_slug ?? '—'}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.data_inicio ? fmtDate(e.data_inicio) : '—'}</TableCell>
                <TableCell className="max-w-[180px] truncate text-muted-foreground">{e.local_raw ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : '—'}</TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground">{e.categoria ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{preco(e)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                    <CopyUrlButton url={e.url_evento} />
                    {!promovido && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy === e.id}
                        title="Promover ao Comercial" onClick={() => onPromover(e)}>
                        <ArrowUpRight className="size-4" />
                      </Button>
                    )}
                    {promovido ? (
                      <span className="inline-flex size-7 items-center justify-center text-emerald-600"><Check className="size-4" /></span>
                    ) : e.ignorado ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy === e.id}
                        title="Reativar" onClick={() => onIgnorar(e, false)}>
                        <RotateCcw className="size-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        disabled={busy === e.id} title="Ignorar" onClick={() => onIgnorar(e, true)}>
                        <Ban className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ListView>
  )
}
