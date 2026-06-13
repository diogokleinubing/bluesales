import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Download, RefreshCw, ChevronLeft, ChevronRight, X, Mic2, Sparkles, CalendarClock, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fmtBRL, fmtDate } from '@/lib/format'
import { exportToXlsx } from '@/modules/bi/lib/export'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { Input } from '@/components/ui/input'
import { EntityAutocomplete, type Lookup } from '@/modules/crm/components/EntityAutocomplete'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { CopyUrlButton } from '../components/CopyUrlButton'
import { ImportCrmButton } from '../components/ImportCrmButton'
import { IgnoreButton } from '../components/StarButton'
import {
  useCrawlerSources, usePesquisaOrgId, useSourceMap,
  useCrawledEventsPaged, useEventFacets, fetchAllCrawledEvents,
  useArtistNamesByClasse,
  setEventoIgnorado, setEventoFavorito, promoverEvento,
  detectEventArtists, removeEventArtist, useIgnorados,
  EVENTS_PAGE_SIZE, type CrawledEventRow, type EventFilters, type EventStatusFiltro,
  type PaisFiltro,
} from '../hooks/usePesquisa'
import { ARTIST_CLASSES } from '@/modules/crm/hooks/useCadastros'
import { StarButton } from '../components/StarButton'
import { useDeepAnalyses, runDeepAnalysis, type DeepAnalysis } from '../hooks/useEventDeepAnalysis'
import { BR_UFS } from '../lib/ufs'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'


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
  const sources = useCrawlerSources()
  const sourceMap = useSourceMap()
  const facets = useEventFacets()

  const [search, setSearch] = useState('')
  const [searchAplicada, setSearchAplicada] = useState('')
  const [fonte, setFonte] = useState('todas')
  const [status, setStatus] = useState<EventStatusFiltro>('ativos')
  const [cidade, setCidade] = useState('todas')
  const [categoria, setCategoria] = useState('')
  const [categoriaAplicada, setCategoriaAplicada] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [valorMinAplicado, setValorMinAplicado] = useState('')
  const [pais, setPais] = useState<PaisFiltro>('brasil')
  const [uf, setUf] = useState('')
  const [local, setLocal] = useState('')
  const [organizador, setOrganizador] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [favoritos, setFavoritos] = useState(false)
  const [comArtista, setComArtista] = useState(false)
  const [comVendas, setComVendas] = useState(false)
  const [proxSeven, setProxSeven] = useState(false)
  const [page, setPage] = useState(0)
  const artistNames = useArtistNamesByClasse(classes)
  const [busy, setBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [detecting, setDetecting] = useState(false)

  // Deep-link a partir do relatório de uma fonte (?fonte=&uf=&cidade=&local=&organizador=).
  const [params] = useSearchParams()
  useEffect(() => {
    if (params.get('fonte')) setFonte(params.get('fonte')!)
    if (params.get('cidade')) setCidade(params.get('cidade')!)
    setUf(params.get('uf') ?? '')
    setLocal(params.get('local') ?? '')
    setOrganizador(params.get('organizador') ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Debounce da busca (evita 1 query por tecla).
  useEffect(() => {
    const t = setTimeout(() => setSearchAplicada(search), 400)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => setCategoriaAplicada(categoria), 400)
    return () => clearTimeout(t)
  }, [categoria])
  useEffect(() => {
    const t = setTimeout(() => setValorMinAplicado(valorMin), 400)
    return () => clearTimeout(t)
  }, [valorMin])

  // Cidades como opções de autocomplete (id = "cidade|uf" usado no filtro).
  const cidadeOptions: Lookup[] = useMemo(
    () => (facets.data?.cidades ?? []).map((c) => ({
      id: `${c.cidade}|${c.uf ?? ''}`,
      nome: `${c.cidade}${c.uf ? `/${c.uf}` : ''}`,
    })),
    [facets.data],
  )
  const cidadeValue: Lookup | null = cidade === 'todas'
    ? null
    : (cidadeOptions.find((o) => o.id === cidade) ?? { id: cidade, nome: cidade.split('|')[0] })

  const filters: EventFilters = useMemo(
    () => ({
      search: searchAplicada, fonte, cidade, categoria: categoriaAplicada, status, pais, uf, local, organizador,
      valorMin: valorMinAplicado.trim() ? Number(valorMinAplicado) : undefined,
      artistasNomes: classes.length > 0 ? artistNames.data : undefined,
      favoritos: favoritos || undefined,
      comArtista: comArtista || undefined,
      comVendas: comVendas || undefined,
      proxDias: proxSeven ? 7 : undefined,
    }),
    [searchAplicada, fonte, cidade, categoriaAplicada, status, pais, uf, local, organizador, valorMinAplicado, classes, artistNames.data, favoritos, comArtista, comVendas, proxSeven],
  )

  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => { setPage(0) }, [searchAplicada, fonte, cidade, categoriaAplicada, status, pais, uf, local, organizador, valorMinAplicado, classes, artistNames.data, favoritos, comArtista, comVendas, proxSeven])

  const ignoradosLocais = useIgnorados('local')
  const { data, isLoading, isFetching } = useCrawledEventsPaged(filters, page)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const from = total === 0 ? 0 : page * EVENTS_PAGE_SIZE + 1
  const to = Math.min((page + 1) * EVENTS_PAGE_SIZE, total)
  const temProx = (page + 1) * EVENTS_PAGE_SIZE < total

  // Fit Score — análise profunda (IA) dos eventos selecionados.
  const ids = useMemo(() => rows.map((r) => r.id), [rows])
  const deep = useDeepAnalyses(ids)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [verDetalhe, setVerDetalhe] = useState<DeepAnalysis | null>(null)
  useEffect(() => { setSel(new Set()) }, [page, data])
  function toggleSel(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id))
  function toggleAll() { setSel(allSel ? new Set() : new Set(rows.map((r) => r.id))) }

  async function runSelected() {
    const lista = [...sel]
    if (lista.length === 0) return
    setRunning(true)
    let done = 0, erros = 0
    toast.loading(`Analisando… 0/${lista.length}`, { id: 'deep' })
    let i = 0
    async function worker() {
      while (i < lista.length) {
        const id = lista[i++]
        try { await runDeepAnalysis(id) } catch { erros++ }
        done++
        toast.loading(`Analisando… ${done}/${lista.length}`, { id: 'deep' })
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, lista.length) }, () => worker()))
    toast.success(`Análise concluída — ${lista.length - erros} ok${erros ? `, ${erros} erro(s)` : ''}`, { id: 'deep' })
    setSel(new Set())
    qc.invalidateQueries({ queryKey: ['pesquisa', 'deep-analysis'] })
    setRunning(false)
  }

  async function onIgnorar(ev: CrawledEventRow, ignorar: boolean) {
    setBusy(ev.id)
    try {
      await setEventoIgnorado(ev.id, ignorar)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events-paged'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setBusy(null) }
  }

  async function onFavoritar(ev: CrawledEventRow) {
    try {
      await setEventoFavorito(ev.id, !ev.favorito)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events-paged'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onPromover(ev: CrawledEventRow) {
    if (!orgId) return
    setBusy(ev.id)
    try {
      await promoverEvento(orgId, ev, profile?.id ?? null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events-paged'] })
      toast.success('Evento promovido ao Comercial', {
        action: { label: 'Abrir', onClick: () => navigate('/comercial/eventos') },
        description: ev.nome,
      })
    } catch (e) {
      toast.error('Erro ao promover', { description: (e as Error).message })
    } finally { setBusy(null) }
  }

  async function onDetect() {
    setDetecting(true)
    try {
      const n = await detectEventArtists()
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events-paged'] })
      toast.success(n > 0 ? `${n} novo(s) vínculo(s) evento↔artista` : 'Nenhum vínculo novo')
    } catch (e) {
      toast.error('Erro ao detectar', { description: (e as Error).message })
    } finally { setDetecting(false) }
  }

  async function onRemoveArtist(ev: CrawledEventRow, artistId: string) {
    try {
      await removeEventArtist(ev.id, artistId)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'events-paged'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onExport() {
    if (!orgId) return
    setExporting(true)
    try {
      const all = await fetchAllCrawledEvents(orgId, filters, sourceMap, [...(ignoradosLocais.data ?? [])])
      const linhas = all.map((e) => ({
        Evento: e.nome,
        Fonte: e.source_nome ?? e.source_slug ?? '',
        Data: e.data_inicio ? fmtDate(e.data_inicio) : '',
        Local: e.local_raw ?? '',
        Cidade: e.cidade ?? '',
        UF: e.uf ?? '',
        País: e.pais ?? '',
        Categoria: e.categoria ?? '',
        Organizador: e.organizador_raw ?? '',
        'Preço mín': e.preco_min ?? '',
        'Preço máx': e.preco_max ?? '',
        'Taxa %': e.taxa_pct ?? '',
        Gratuito: e.gratuito ? 'Sim' : 'Não',
        Vendidos: e.vendidos ?? '',
        Capacidade: e.capacidade_total ?? '',
        Status: e.promovido_crm_event_id ? 'Promovido' : e.ignorado ? 'Ignorado' : 'Novo',
        URL: e.url_evento,
      }))
      await exportToXlsx(`eventos-pesquisa-${new Date().toISOString().slice(0, 10)}`, [
        { name: 'Eventos', rows: linhas },
      ])
      toast.success(`${linhas.length} evento(s) exportado(s)`)
    } catch (e) {
      toast.error('Erro ao exportar', { description: (e as Error).message })
    } finally { setExporting(false) }
  }

  return (
    <>
    <ListView
      title="Eventos capturados"
      count={total ? String(total) : undefined}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={runSelected} disabled={sel.size === 0 || running}
            title="Re-scrape do evento + site oficial e análise de fit por IA">
            {running ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Análise detalhada{sel.size > 0 ? ` (${sel.size})` : ''}
          </Button>
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['pesquisa'] })}>
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={onDetect} disabled={detecting}
            title="Detecta artistas cadastrados nos títulos dos eventos">
            {detecting ? <RefreshCw className="size-4 animate-spin" /> : <Mic2 className="size-4" />} Detectar artistas
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting || total === 0}>
            <Download className="size-4" /> {exporting ? 'Exportando…' : 'Excel'}
          </Button>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <span>{total ? `${from}–${to} de ${total}` : 'Nenhum evento'}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={!temProx}
              onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      }
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
          <Select value={uf || '__todos'} onValueChange={(v) => setUf(v === '__todos' ? '' : v)}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[140px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todos os estados</SelectItem>
              {BR_UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <EntityAutocomplete
            className="w-[180px]"
            placeholder="Cidade…"
            value={cidadeValue}
            options={cidadeOptions}
            onPick={(v) => setCidade(v ? v.id : 'todas')}
          />
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Categoria…"
            className={`${TOOLBAR_TRIGGER} w-[150px]`}
          />
          <Input
            type="number" min={0}
            value={valorMin}
            onChange={(e) => setValorMin(e.target.value)}
            placeholder="Valor mín. (R$)"
            className={`${TOOLBAR_TRIGGER} w-[130px]`}
          />
          <Select value={pais} onValueChange={(v) => setPais(v as PaisFiltro)}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[130px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os países</SelectItem>
              <SelectItem value="brasil">Brasil</SelectItem>
              <SelectItem value="exterior">Exterior</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as EventStatusFiltro)}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[140px]`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="promovidos">Promovidos</SelectItem>
              <SelectItem value="ignorados">Ignorados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1" title="Eventos cujo nome contenha artistas das classes selecionadas">
            <span className="text-xs text-muted-foreground">Artistas:</span>
            {ARTIST_CLASSES.map((c) => {
              const on = classes.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClasses((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
                  )}
                >
                  {c}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setFavoritos((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              favoritos ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <Star className={cn('size-4', favoritos && 'fill-amber-400 text-amber-400')} /> Favoritos
          </button>
          <button
            type="button"
            onClick={() => setComArtista((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              comArtista ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <Mic2 className="size-4" /> Com artista
          </button>
          <button
            type="button"
            onClick={() => setProxSeven((v) => !v)}
            title="Eventos que acontecem nos próximos 7 dias (vendas perto do final)"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              proxSeven ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <CalendarClock className="size-4" /> Próx. 7 dias
          </button>
          <button
            type="button"
            onClick={() => setComVendas((v) => !v)}
            title="Só eventos com dado de vendas capturado (ex.: Bileto)"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              comVendas ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <TrendingUp className="size-4" /> Com vendas
          </button>
          {([['Local', local, setLocal], ['Organizador', organizador, setOrganizador]] as const)
            .filter(([, v]) => v)
            .map(([label, v, set]) => (
              <Badge key={label} variant="secondary" className="h-8 gap-1 px-2 text-sm font-normal">
                {label}: <span className="max-w-[160px] truncate">{v}</span>
                <button onClick={() => set('')} className="ml-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
              </Badge>
            ))}
        </div>
      }
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8"><Checkbox checked={allSel} onCheckedChange={() => toggleAll()} aria-label="Selecionar todos" /></TableHead>
          <TableHead>Evento</TableHead>
          <TableHead>Fit IA</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead>Artistas</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Preço</TableHead>
          <TableHead className="text-right">Taxa</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
              Nenhum evento encontrado.
            </TableCell></TableRow>
          ) : rows.map((e) => {
            const promovido = !!e.promovido_crm_event_id
            return (
              <TableRow key={e.id} className={e.ignorado ? 'opacity-50' : ''}>
                <TableCell className="w-8" onClick={(ev) => ev.stopPropagation()}>
                  <Checkbox checked={sel.has(e.id)} onCheckedChange={() => toggleSel(e.id)} aria-label="Selecionar" />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className="flex shrink-0 items-center gap-1">
                      <StarButton active={e.favorito} onToggle={() => onFavoritar(e)} />
                      <IgnoreButton ignored={e.ignorado} disabled={busy === e.id} onToggle={() => onIgnorar(e, !e.ignorado)} />
                      <ImportCrmButton imported={promovido} disabled={busy === e.id} onImport={() => onPromover(e)} />
                    </div>
                    <div className="min-w-0 max-w-[280px]">
                      <div className="truncate font-medium">{e.nome}</div>
                      {e.organizador_raw && (
                        <div className="truncate text-xs text-muted-foreground">{e.organizador_raw}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell><FitIaCell a={deep.data?.get(e.id)} onOpen={setVerDetalhe} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{e.source_nome ?? e.source_slug ?? '—'}</Badge>
                    <CopyUrlButton url={e.url_evento} />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.data_inicio ? fmtDate(e.data_inicio) : '—'}</TableCell>
                <TableCell className="max-w-[180px] truncate text-muted-foreground">{e.local_raw ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : '—'}</TableCell>
                <TableCell className="max-w-[200px]">
                  {e.artistas.length === 0 ? <span className="text-muted-foreground">—</span> : (
                    <div className="flex flex-wrap gap-1">
                      {e.artistas.map((a) => (
                        <Badge key={a.id} variant="secondary" className="gap-1 pr-1 font-normal">
                          {a.nome}
                          <button onClick={(ev) => { ev.stopPropagation(); onRemoveArtist(e, a.id) }}
                            className="text-muted-foreground hover:text-destructive" title="Remover artista deste evento">
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground">{e.categoria ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{preco(e)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{e.taxa_pct != null ? `${e.taxa_pct}%` : '—'}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ListView>
    <DeepDetalheDialog a={verDetalhe} onClose={() => setVerDetalhe(null)} />
    </>
  )
}

const FIT_COR = (s: number) => s >= 70
  ? 'bg-[var(--success)]/15 text-[var(--success)]'
  : s >= 40 ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-destructive/15 text-destructive'

const REC_LABEL: Record<string, string> = { prospectar: 'Prospectar', avaliar: 'Avaliar', descartar: 'Descartar' }

function FitIaCell({ a, onOpen }: { a?: DeepAnalysis; onOpen: (a: DeepAnalysis) => void }) {
  if (!a) return <span className="text-muted-foreground">—</span>
  if (a.status === 'erro' || a.fit_score == null) {
    return <button onClick={() => onOpen(a)} className="text-xs text-destructive hover:underline" title={a.erro ?? ''}>erro</button>
  }
  return (
    <button onClick={() => onOpen(a)} className="inline-flex items-center gap-1.5 hover:opacity-80" title={a.recomendacao ? REC_LABEL[a.recomendacao] : ''}>
      <span className={`inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${FIT_COR(a.fit_score)}`}>{a.fit_score}</span>
    </button>
  )
}

function DeepDetalheDialog({ a, onClose }: { a: DeepAnalysis | null; onClose: () => void }) {
  const s = (a?.sinais ?? {}) as Record<string, unknown>
  const linhas: [string, unknown][] = [
    ['Lineup / atrações', s.lineup_forca],
    ['Edição', s.edicao],
    ['Multi-dia', s.multi_dia === true ? 'Sim' : s.multi_dia === false ? 'Não' : undefined],
    ['Indícios de venda antecipada', s.indicios_venda_antecipada],
    ['Preços', s.preco_resumo],
    ['Público estimado', s.publico_estimado],
    ['Resumo', s.resumo],
  ]
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader><DialogTitle>Análise detalhada</DialogTitle></DialogHeader>
        {a && (
          <div className="space-y-3 text-sm">
            {a.status === 'erro' ? (
              <p className="text-destructive">{a.erro ?? 'Falha na análise.'}</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {a.fit_score != null && (
                    <span className={`inline-flex min-w-10 justify-center rounded-md px-2 py-1 text-base font-bold tabular-nums ${FIT_COR(a.fit_score)}`}>{a.fit_score}</span>
                  )}
                  {a.recomendacao && <Badge variant="outline">{REC_LABEL[a.recomendacao] ?? a.recomendacao}</Badge>}
                </div>
                {a.veredito && <p className="text-foreground">{a.veredito}</p>}
                <dl className="space-y-1.5">
                  {linhas.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[150px_1fr] gap-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
                {a.official_url && (
                  <a href={a.official_url} target="_blank" rel="noreferrer" className="inline-block text-primary hover:underline">Site oficial</a>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
