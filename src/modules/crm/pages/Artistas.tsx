import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readStr, readArr, buildSearchParams } from '@/lib/urlState'
import { cn } from '@/lib/utils'
import { Plus, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, CalendarDays, ExternalLink } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { useArtistUnifiedAgenda, useArtistAgendaCounts } from '@/modules/pesquisa/hooks/useAgenda'
import { CopyUrlButton } from '@/modules/pesquisa/components/CopyUrlButton'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useArtists, ARTIST_CLASSES,
  type ArtistRow, type ArtistClasse,
} from '../hooks/useCadastros'
import { useGeneroOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import { ListView, ToolbarSearch } from '../components/ListView'
import { ClasseBadge } from '../components/ClasseBadge'
import { AtracaoDialog } from '../components/AtracaoDialog'

const NONE = '__none__'

type SortKey = 'nome' | 'classe' | 'segmento' | 'genero' | 'organizacao' | 'plataforma' | 'eventos'

/** Linha da lista com a contagem de eventos anexada. */
type ArtistListRow = ArtistRow & { eventos: number }

/** Valor ordenável da coluna; índice p/ classe (ordem natural), nº p/ eventos, texto p/ resto. */
function sortVal(a: ArtistListRow, k: SortKey): string | number {
  switch (k) {
    case 'classe': { const i = ARTIST_CLASSES.indexOf(a.classificacao as ArtistClasse); return i < 0 ? 99 : i }
    case 'segmento': return (a.segmento ?? '').toLowerCase()
    case 'genero': return (a.genero_nome ?? '').toLowerCase()
    case 'organizacao': return (a.organization_nome ?? '').toLowerCase()
    case 'plataforma': return (a.platform_nome ?? '').toLowerCase()
    case 'eventos': return a.eventos
    default: return (a.nome ?? '').toLowerCase()
  }
}

/** Passa no filtro de coluna: 'all' = todos, NONE = vazios, senão igualdade. */
function passaFiltro(val: string | null, filtro: string): boolean {
  if (filtro === 'all') return true
  if (filtro === NONE) return !val
  return val === filtro
}

export function Artistas() {
  const { data, isLoading } = useArtists()
  const counts = useArtistAgendaCounts()
  const generos = useGeneroOptions()
  const segmentos = useSegmentOptions()
  const [params, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => readStr(params, 'search'))
  const [classesSel, setClassesSel] = useState<string[]>(() => readArr(params, 'classes'))
  const [segmentoFiltro, setSegmentoFiltro] = useState<string>(() => readStr(params, 'segment', 'all'))
  const [generoFiltro, setGeneroFiltro] = useState<string>(() => readStr(params, 'genre', 'all'))
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(() => ({
    key: readStr(params, 'sortBy', 'nome') as SortKey,
    dir: readStr(params, 'sortDir', 'asc') === 'desc' ? 'desc' : 'asc',
  }))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'search', v: search },
      { k: 'classes', v: classesSel },
      { k: 'segment', v: segmentoFiltro, def: 'all' },
      { k: 'genre', v: generoFiltro, def: 'all' },
      { k: 'sortBy', v: sort.key, def: 'nome' },
      { k: 'sortDir', v: sort.dir, def: 'asc' },
    ]), { replace: true })
  }, [search, classesSel, segmentoFiltro, generoFiltro, sort, setSearchParams])
  const [open, setOpen] = useState(false)
  const [agenda, setAgenda] = useState<ArtistRow | null>(null)
  const [edit, setEdit] = useState<ArtistRow | null>(null)

  const rows = useMemo<ArtistListRow[]>(() => {
    const q = search.trim().toLowerCase()
    const filtered = (data ?? []).filter((a) => {
      if (q && !a.nome.toLowerCase().includes(q)) return false
      return (
        (classesSel.length === 0 || classesSel.includes(a.classificacao ?? '')) &&
        passaFiltro(a.segmento, segmentoFiltro) &&
        passaFiltro(a.genero_nome, generoFiltro)
      )
    })
    const withCount: ArtistListRow[] = filtered.map((a) => ({ ...a, eventos: counts.data?.get(a.id) ?? 0 }))
    const mul = sort.dir === 'asc' ? 1 : -1
    // "Vazio" (vai por último): texto '' ou o sentinel 99 só da coluna classe.
    const vazio = (v: string | number) => v === '' || (sort.key === 'classe' && v === 99)
    return withCount.sort((a, b) => {
      const va = sortVal(a, sort.key), vb = sortVal(b, sort.key)
      const ea = vazio(va), eb = vazio(vb)
      if (ea !== eb) return ea ? 1 : -1 // vazios/sem valor sempre por último
      if (va < vb) return -1 * mul
      if (va > vb) return 1 * mul
      return 0
    })
  }, [data, counts.data, search, classesSel, segmentoFiltro, generoFiltro, sort])

  // Clique simples na linha abre a agenda; duplo clique abre o editar. Usa um
  // timer p/ não disparar a agenda quando o usuário dá duplo clique.
  const clickTimer = useRef<number | null>(null)
  function onRowClick(a: ArtistRow) {
    if (clickTimer.current) return
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      setAgenda(a)
    }, 220)
  }
  function onRowDouble(a: ArtistRow) {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    openEdit(a)
  }

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }))
  }
  function SortHead({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) {
    const active = sort.key === k
    return (
      <TableHead className={className}>
        <button type="button" onClick={() => toggleSort(k)} className="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground">
          {children}
          {active
            ? (sort.dir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)
            : <ChevronsUpDown className="size-3.5 opacity-40" />}
        </button>
      </TableHead>
    )
  }

  function openNew() { setEdit(null); setOpen(true) }
  function openEdit(a: ArtistRow) { setEdit(a); setOpen(true) }

  return (
    <>
      <ListView
        title="Atrações"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={openNew}><Plus className="size-4" /> Nova atração</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />
            <Select value={segmentoFiltro} onValueChange={setSegmentoFiltro}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Segmento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os segmentos</SelectItem>
                {(segmentos.data ?? []).map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                <SelectItem value={NONE}>(sem segmento)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={generoFiltro} onValueChange={setGeneroFiltro}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Gênero" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os gêneros</SelectItem>
                {(generos.data ?? []).map((g) => <SelectItem key={g.id} value={g.nome}>{g.nome}</SelectItem>)}
                <SelectItem value={NONE}>(sem gênero)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Classe:</span>
              {ARTIST_CLASSES.map((c) => {
                const on = classesSel.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassesSel((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))}
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
          </div>
        }
      >
        <Table>
          <TableHeader><TableRow>
            <SortHead k="nome">Nome</SortHead>
            <SortHead k="classe">Classe</SortHead>
            <SortHead k="segmento">Segmento</SortHead>
            <SortHead k="genero">Gênero</SortHead>
            <SortHead k="organizacao">Organização</SortHead>
            <SortHead k="plataforma">Plataforma</SortHead>
            <SortHead k="eventos" className="w-24">Eventos</SortHead>
            <TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma atração.</TableCell></TableRow>
            ) : rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => onRowClick(a)} onDoubleClick={() => onRowDouble(a)}>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={a.nome}>{a.nome}</div></TableCell>
                <TableCell><ClasseBadge classe={a.classificacao} /></TableCell>
                <TableCell>{a.segmento ?? '—'}</TableCell>
                <TableCell>{a.genero_nome ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{a.organization_nome ?? '—'}</TableCell>
                <TableCell>{a.platform_nome ? <Badge variant="outline">{a.platform_nome}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {a.eventos > 0 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAgenda(a) }}
                      className="font-medium tabular-nums text-primary hover:underline"
                      title="Ver agenda"
                    >
                      {a.eventos}
                    </button>
                  ) : (
                    <span className="tabular-nums text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setAgenda(a) }} className="text-muted-foreground hover:text-foreground" title="Ver agenda"><CalendarDays className="size-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(a) }} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>

      <AtracaoDialog open={open} onOpenChange={setOpen} edit={edit} />

      <AgendaArtistaDialog artist={agenda} onClose={() => setAgenda(null)} />
    </>
  )
}

/** Site oficial só pode abrir direto (nova aba) se for Instagram ou Linktree;
 *  os demais (plataformas concorrentes, produtores) são apenas cópia. */
function podeAbrirOficial(url: string): boolean {
  return /(^|\.)instagram\.com\b|(^|\.)linktr\.ee\b|(^|\.)linktree\.com\b/i.test(url)
}

function AgendaArtistaDialog({ artist, onClose }: { artist: ArtistRow | null; onClose: () => void }) {
  const { data, isLoading } = useArtistUnifiedAgenda(artist?.id ?? null)
  const [apenasFuturos, setApenasFuturos] = useState(false)

  const hoje = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    [],
  )
  const linhas = useMemo(() => {
    const rows = data ?? []
    return apenasFuturos ? rows.filter((r) => r.data && r.data >= hoje) : rows
  }, [data, apenasFuturos, hoje])

  return (
    <Dialog open={!!artist} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-[1000px] sm:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle>Agenda — {artist?.nome}</DialogTitle>
          <p className="text-sm text-muted-foreground">Agenda oficial + eventos detectados nas plataformas (mesma data = 1 linha).</p>
        </DialogHeader>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={apenasFuturos} onCheckedChange={(v) => setApenasFuturos(v === true)} />
          Apenas futuros
        </label>
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Site Oficial</TableHead>
              <TableHead>Plataformas</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                ))
              ) : linhas.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum show na agenda.</TableCell></TableRow>
              ) : linhas.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.data ? fmtDate(r.data) : '—'}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium" title={r.nome}>{r.nome}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.cidade ? `${r.cidade}${r.uf ? `/${r.uf}` : ''}` : '—'}</TableCell>
                  <TableCell>
                    {r.oficial ? (
                      r.oficial.link
                        ? (podeAbrirOficial(r.oficial.link)
                            ? <a href={r.oficial.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3.5" /> oficial</a>
                            : <CopyUrlButton url={r.oficial.link} label="oficial" />)
                        : <Badge variant="secondary" className="font-normal">Site Oficial</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {r.plataformas.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <div className="flex flex-wrap gap-1">
                        {r.plataformas.map((p) => (
                          <CopyUrlButton key={p.url} url={p.url} label={p.nome} />
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
