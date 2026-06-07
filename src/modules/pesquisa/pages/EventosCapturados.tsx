import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Download, RefreshCw, ChevronLeft, ChevronRight, X, Mic2,
} from 'lucide-react'
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
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

// UFs do Brasil (lista fixa — evita lixo/valores estrangeiros vindos dos dados).
const BR_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

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
    }),
    [searchAplicada, fonte, cidade, categoriaAplicada, status, pais, uf, local, organizador, valorMinAplicado, classes, artistNames.data, favoritos, comArtista],
  )

  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => { setPage(0) }, [searchAplicada, fonte, cidade, categoriaAplicada, status, pais, uf, local, organizador, valorMinAplicado, classes, artistNames.data, favoritos, comArtista])

  const ignoradosLocais = useIgnorados('local')
  const { data, isLoading, isFetching } = useCrawledEventsPaged(filters, page)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const from = total === 0 ? 0 : page * EVENTS_PAGE_SIZE + 1
  const to = Math.min((page + 1) * EVENTS_PAGE_SIZE, total)
  const temProx = (page + 1) * EVENTS_PAGE_SIZE < total

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
    <ListView
      title="Eventos capturados"
      count={total ? String(total) : undefined}
      actions={
        <div className="flex items-center gap-2">
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
          <TableHead>Evento</TableHead>
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
              <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
              Nenhum evento encontrado.
            </TableCell></TableRow>
          ) : rows.map((e) => {
            const promovido = !!e.promovido_crm_event_id
            return (
              <TableRow key={e.id} className={e.ignorado ? 'opacity-50' : ''}>
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
  )
}
