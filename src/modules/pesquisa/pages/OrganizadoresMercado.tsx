import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Star, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { cn } from '@/lib/utils'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { EventosDialog } from '../components/EventosDialog'
import { StarButton, IgnoreButton } from '../components/StarButton'
import { ImportCrmButton } from '../components/ImportCrmButton'
import { faixaPreco, fmtTaxa } from '../lib/preco'
import {
  useCrawledOrganizers, useEventosDoOrganizador, usePromocoes, useCrawlerSources,
  useFavoritos, setFavoritoAgregado, useIgnorados, setIgnoradoAgregado,
  promoverOrganizador, useCrmOrgId,
  type OrganizerAgg, type OrganizerFilters, type PromoverAggInput,
} from '../hooks/usePesquisa'

export function OrganizadoresMercado() {
  const promos = usePromocoes('organizador').data
  const sources = useCrawlerSources()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [fonte, setFonte] = useState('todas')
  const [aplicado, setAplicado] = useState({ search: '', valorMin: '' })
  const [soFav, setSoFav] = useState(false)
  const [soIgnorados, setSoIgnorados] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const favoritos = useFavoritos('organizador').data
  const ignorados = useIgnorados('organizador').data

  // Debounce de busca/valor (evita uma query por tecla).
  useEffect(() => {
    const t = setTimeout(() => setAplicado({ search, valorMin }), 400)
    return () => clearTimeout(t)
  }, [search, valorMin])

  const filters: OrganizerFilters = useMemo(() => ({
    search: aplicado.search,
    valorMin: aplicado.valorMin.trim() !== '' && Number.isFinite(Number(aplicado.valorMin))
      ? Number(aplicado.valorMin) : null,
    fonte,
  }), [aplicado, fonte])

  const { data, isLoading } = useCrawledOrganizers(filters)
  const rows = useMemo(() => {
    const base = data ?? []
    if (soIgnorados) return base.filter((a) => ignorados?.has(a.chave))
    let r = base.filter((a) => !ignorados?.has(a.chave))
    if (soFav) r = r.filter((a) => favoritos?.has(a.chave))
    return r
  }, [data, soFav, soIgnorados, favoritos, ignorados])
  const { data: eventosDoSel } = useEventosDoOrganizador(sel, fonte)

  async function onFav(a: OrganizerAgg) {
    if (!orgId) return
    try {
      await setFavoritoAgregado(orgId, 'organizador', a.chave, !favoritos?.has(a.chave))
      qc.invalidateQueries({ queryKey: ['pesquisa', 'favoritos', 'organizador'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onIgnorar(a: OrganizerAgg) {
    if (!orgId) return
    try {
      await setIgnoradoAgregado(orgId, 'organizador', a.chave, !ignorados?.has(a.chave))
      qc.invalidateQueries({ queryKey: ['pesquisa', 'ignorados-agg', 'organizador'] })
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function onPromover(a: OrganizerAgg) {
    if (!orgId) return
    setBusy(a.chave)
    try {
      const input: PromoverAggInput = {
        chave: a.chave,
        nome: a.nome,
        cidade: a.cidades.length === 1 ? a.cidade_nome : null,
        uf: a.cidades.length === 1 ? a.uf : null,
        precoMin: a.preco_min,
        precoMax: a.preco_max,
        taxaMediaPct: a.taxa_media,
        eventos: a.eventos,
        cidades: a.cidades,
        fontes: a.fontes,
      }
      await promoverOrganizador(orgId, input, profile?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes', 'organizador'] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      toast.success('Organizador promovido ao Comercial', { description: a.nome })
    } catch (e) {
      toast.error('Erro ao promover', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ListView
      title="Organizadores"
      count={rows.length ? String(rows.length) : undefined}
      footer={rows.length ? `${rows.length} organizador(es)` : undefined}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar organizador…" />
          <Select value={fonte} onValueChange={setFonte}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-[160px]`} size="sm"><SelectValue placeholder="Plataforma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as plataformas</SelectItem>
              {(sources.data ?? []).map((s) => <SelectItem key={s.id} value={s.slug}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
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
        </div>
      }
    >
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-16" />
          <col className="w-[16%]" />
          <col className="w-[200px]" />
          <col className="w-[88px]" />
          <col className="w-[140px]" />
          <col className="w-[112px]" />
        </colgroup>
        <TableHeader><TableRow>
          <TableHead>Organizador</TableHead>
          <TableHead className="text-right">Eventos</TableHead>
          <TableHead>Cidades</TableHead>
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
              Nenhum organizador encontrado.
            </TableCell></TableRow>
          ) : rows.map((a) => {
            const promo = promos?.get(a.chave)
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a.nome)}>
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StarButton active={!!favoritos?.has(a.chave)} onToggle={() => onFav(a)} />
                    <IgnoreButton ignored={!!ignorados?.has(a.chave)} onToggle={() => onIgnorar(a)} />
                    <ImportCrmButton imported={!!promo} disabled={busy === a.chave || !orgId} onImport={() => onPromover(a)} />
                    <span className="truncate" title={a.nome}>{a.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
                <TableCell className="truncate text-muted-foreground" title={a.cidades.join(', ')}>{a.cidades.slice(0, 3).join(', ')}{a.cidades.length > 3 ? ` +${a.cidades.length - 3}` : ''}</TableCell>
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
        titulo={sel ?? ''}
        subtitulo={`${(eventosDoSel ?? []).length} evento(s) capturado(s)`}
        eventos={eventosDoSel ?? []}
      />
    </ListView>
  )
}
