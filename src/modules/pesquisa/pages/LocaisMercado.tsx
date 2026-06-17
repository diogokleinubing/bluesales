import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Star, Ban, Link2, MoreVertical, Mic2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { ARTIST_CLASSES } from '@/modules/crm/hooks/useCadastros'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { norm } from '@/modules/bi/lib/classify'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { EntityAutocomplete, type Lookup } from '@/modules/crm/components/EntityAutocomplete'
import { LocalDialog, type PlatRel, type LocalInitial } from '@/modules/crm/components/LocalDialog'
import { usePlatforms } from '@/modules/crm/hooks/useConfigCadastros'
import { EventosDialog } from '../components/EventosDialog'
import { StarButton, IgnoreButton } from '../components/StarButton'
import { ImportCrmButton } from '../components/ImportCrmButton'
import { faixaPreco, fmtTaxa } from '../lib/preco'
import { BR_UFS } from '../lib/ufs'
import {
  useCrawledLocals, useEventosDoLocal, usePromocoes, useCrmNomes, useCrawlerSources,
  useFavoritos, setFavoritoAgregado, useIgnorados, setIgnoradoAgregado,
  registerLocalPromotion, conectarPromocoesPorNome, useCrmOrgId, useEventFacets,
  type LocalAgg, type LocalAggFilters,
} from '../hooks/usePesquisa'

export function LocaisMercado() {
  const promos = usePromocoes('local').data
  const crmNomes = useCrmNomes('local').data
  const sources = useCrawlerSources()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [fonte, setFonte] = useState('todas')
  const [cidade, setCidade] = useState('todas')
  const [uf, setUf] = useState('')
  const facets = useEventFacets()
  const [aplicado, setAplicado] = useState({ search: '', valorMin: '' })
  const [soFav, setSoFav] = useState(false)
  const [soIgnorados, setSoIgnorados] = useState(false)
  const [classes, setClasses] = useState<string[]>([])
  const [sel, setSel] = useState<LocalAgg | null>(null)
  const [busy] = useState<string | null>(null)
  const platforms = usePlatforms()
  const [importState, setImportState] = useState<{
    chave: string; nome: string; cidade: string | null; uf: string | null
    initial: LocalInitial; plats: PlatRel[]
  } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const favoritos = useFavoritos('local').data
  const ignorados = useIgnorados('local').data

  useEffect(() => {
    const t = setTimeout(() => setAplicado({ search, valorMin }), 400)
    return () => clearTimeout(t)
  }, [search, valorMin])

  const filters: LocalAggFilters = useMemo(() => ({
    search: aplicado.search,
    valorMin: aplicado.valorMin.trim() !== '' && Number.isFinite(Number(aplicado.valorMin))
      ? Number(aplicado.valorMin) : null,
    fonte,
    cidade,
    uf,
    classes,
  }), [aplicado, fonte, cidade, uf, classes])

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

  const { data, isLoading } = useCrawledLocals(filters)
  const rows = useMemo(() => {
    const base = data ?? []
    if (soIgnorados) return base.filter((a) => ignorados?.has(a.chave))
    let r = base.filter((a) => !ignorados?.has(a.chave))
    if (soFav) r = r.filter((a) => favoritos?.has(a.chave))
    return r
  }, [data, soFav, soIgnorados, favoritos, ignorados])
  const { data: eventosDoSel, isLoading: eventosDoSelLoading } = useEventosDoLocal(sel?.nome ?? null, sel?.cidade ?? null, fonte)

  async function onFav(a: LocalAgg) {
    if (!orgId) return
    try {
      await setFavoritoAgregado(orgId, 'local', a.chave, !favoritos?.has(a.chave))
      qc.invalidateQueries({ queryKey: ['pesquisa', 'favoritos', 'local'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onIgnorar(a: LocalAgg) {
    if (!orgId) return
    try {
      await setIgnoradoAgregado(orgId, 'local', a.chave, !ignorados?.has(a.chave))
      qc.invalidateQueries({ queryKey: ['pesquisa', 'ignorados-agg', 'local'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  // Plataformas detectadas (fontes) -> ids de plataforma do CRM (casa por nome).
  function detectarPlats(fontes: string[]): PlatRel[] {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const byNome = new Map((platforms.data ?? []).map((p) => [norm(p.nome), p.id]))
    const out: PlatRel[] = []
    for (const f of fontes) {
      const id = byNome.get(norm(f))
      if (id && !out.some((x) => x.platform_id === id)) out.push({ platform_id: id, tipo_relacao: null })
    }
    return out
  }

  // Abre o dialog completo do local pré-preenchido (não cria ainda).
  function onPromover(a: LocalAgg) {
    if (!orgId) return
    const obs = [
      'Adicionado da Pesquisa.',
      `Faixa de ingressos: ${faixaPreco(a.preco_min, a.preco_max)}`,
      `Taxa média: ${fmtTaxa(a.taxa_media)}`,
      `Eventos capturados: ${a.eventos}`,
      a.fontes.length ? `Fontes: ${a.fontes.join(', ')}` : null,
    ].filter(Boolean).join('\n')
    setImportState({
      chave: a.chave,
      nome: a.nome,
      cidade: a.cidade_nome,
      uf: a.uf,
      initial: { nome: a.nome, cidade: a.cidade_nome, uf: a.uf, observacoes: obs },
      plats: detectarPlats(a.fontes),
    })
    setImportOpen(true)
  }

  // Após salvar no dialog: registra a promoção (vínculo com o módulo Pesquisa).
  async function onImportSaved(localId: string) {
    if (!orgId || !importState) return
    try {
      await registerLocalPromotion(orgId, importState.chave, importState.nome, localId, profile?.id ?? null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes', 'local'] })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      toast.success('Local adicionado ao Comercial', { description: importState.nome })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  // Vincula por nome os locais que já existem no CRM mas ainda não têm vínculo.
  const [conectando, setConectando] = useState(false)
  async function onConectarPorNome() {
    if (!orgId || !crmNomes) return
    const links = (data ?? [])
      .filter((a) => !promos?.has(a.chave))
      .map((a) => ({ chave: a.chave, rotulo: a.nome, id: crmNomes.get(norm(a.nome)) }))
      .filter((l): l is { chave: string; rotulo: string; id: string } => !!l.id)
    if (!links.length) { toast.info('Nenhum local novo casou por nome com o CRM.'); return }
    setConectando(true)
    try {
      const n = await conectarPromocoesPorNome(orgId, 'local', links, profile?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes', 'local'] })
      toast.success(`${n} local(is) conectados ao CRM por nome.`)
    } catch (e) {
      toast.error('Erro ao conectar', { description: (e as Error).message })
    } finally { setConectando(false) }
  }

  return (
    <ListView
      title="Locais"
      count={rows.length ? String(rows.length) : undefined}
      footer={rows.length ? `${rows.length} local(is)` : undefined}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8" title="Opções">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onConectarPorNome} disabled={conectando || !crmNomes}>
              <Link2 className="size-4" /> {conectando ? 'Conectando…' : 'Conectar por nome'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar local…" />
          <Select value={fonte} onValueChange={setFonte}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[160px]`} size="sm"><SelectValue placeholder="Plataforma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as plataformas</SelectItem>
              {(sources.data ?? []).map((s) => <SelectItem key={s.id} value={s.slug}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={uf || '__todos'} onValueChange={(v) => setUf(v === '__todos' ? '' : v)}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[140px]`} size="sm"><SelectValue /></SelectTrigger>
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
          <Input type="number" min={0} value={valorMin} onChange={(e) => setValorMin(e.target.value)}
            placeholder="Valor mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
          <button
            type="button"
            onClick={() => setSoFav((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              soFav ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <Star className={cn('size-4', soFav && 'fill-amber-400 text-amber-400')} /> Favoritos
          </button>
          <button
            type="button"
            onClick={() => setSoIgnorados((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
              soIgnorados ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:border-primary',
            )}
          >
            <Ban className="size-4" /> Ignorados
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Filtrar por classe de artista mapeado"
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
                  classes.length ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary',
                )}
              >
                <Mic2 className="size-4" /> {classes.length ? `Artistas: ${classes.join(', ')}` : 'Artistas'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {ARTIST_CLASSES.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={classes.includes(c)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) =>
                    setClasses((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))
                  }
                >
                  {c}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-[16%]" />
          <col className="w-16" />
          <col className="w-[200px]" />
          <col className="w-[80px]" />
          <col className="w-[130px]" />
          <col className="w-[120px]" />
        </colgroup>
        <TableHeader><TableRow>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead className="text-right">{classes.length ? 'Artistas' : 'Eventos'}</TableHead>
          <TableHead className="text-right">Faixa de preço</TableHead>
          <TableHead className="text-right">Taxa</TableHead>
          <TableHead>Fontes</TableHead>
          <TableHead>Próximo</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
              Nenhum local encontrado.
            </TableCell></TableRow>
          ) : rows.map((a) => {
            const promo = promos?.get(a.chave)
            const noCrm = !promo && !!crmNomes?.has(norm(a.nome))
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a)}>
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StarButton active={!!favoritos?.has(a.chave)} onToggle={() => onFav(a)} />
                    <IgnoreButton ignored={!!ignorados?.has(a.chave)} onToggle={() => onIgnorar(a)} />
                    <ImportCrmButton imported={!!promo} inCrm={noCrm} disabled={busy === a.chave || !orgId} onImport={() => onPromover(a)} />
                    <span className="truncate" title={a.nome}>{a.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="truncate text-muted-foreground" title={a.cidade ?? undefined}>{a.cidade ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{classes.length ? a.artistas : a.eventos}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{faixaPreco(a.preco_min, a.preco_max)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtTaxa(a.taxa_media)}</TableCell>
                <TableCell className="truncate"><div className="flex gap-1 overflow-hidden">{a.fontes.map((f) => <Badge key={f} variant="outline" className="shrink-0">{f}</Badge>)}</div></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{a.proximo ? fmtDate(a.proximo) : '—'}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <EventosDialog
        open={!!sel}
        onOpenChange={(o) => !o && setSel(null)}
        titulo={sel?.nome ?? ''}
        subtitulo={[sel?.cidade, eventosDoSelLoading ? 'Carregando…' : `${(eventosDoSel ?? []).length} evento(s) capturado(s)`].filter(Boolean).join(' · ')}
        loading={eventosDoSelLoading}
        eventos={eventosDoSel ?? []}
      />

      <LocalDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        orgId={orgId ?? null}
        editId={null}
        initial={importState?.initial ?? {}}
        initialPlatforms={importState?.plats ?? []}
        saveLabel="Salvar e adicionar"
        onSaved={onImportSaved}
      />
    </ListView>
  )
}
