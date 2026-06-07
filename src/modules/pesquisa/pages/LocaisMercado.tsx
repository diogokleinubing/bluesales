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
import { cn } from '@/lib/utils'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { EventosDialog } from '../components/EventosDialog'
import { StarButton, IgnoreButton } from '../components/StarButton'
import { ImportCrmButton } from '../components/ImportCrmButton'
import { faixaPreco, fmtTaxa } from '../lib/preco'
import {
  useCrawledLocals, useEventosDoLocal, usePromocoes, useCrawlerSources,
  useFavoritos, setFavoritoAgregado, useIgnorados, setIgnoradoAgregado,
  promoverLocal, useCrmOrgId,
  type LocalAgg, type LocalAggFilters, type PromoverAggInput,
} from '../hooks/usePesquisa'

export function LocaisMercado() {
  const promos = usePromocoes('local').data
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
  const [sel, setSel] = useState<LocalAgg | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
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
  }), [aplicado, fonte])

  const { data, isLoading } = useCrawledLocals(filters)
  const rows = useMemo(() => {
    const base = data ?? []
    if (soIgnorados) return base.filter((a) => ignorados?.has(a.chave))
    let r = base.filter((a) => !ignorados?.has(a.chave))
    if (soFav) r = r.filter((a) => favoritos?.has(a.chave))
    return r
  }, [data, soFav, soIgnorados, favoritos, ignorados])
  const { data: eventosDoSel } = useEventosDoLocal(sel?.nome ?? null, sel?.cidade ?? null, fonte)

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

  async function onPromover(a: LocalAgg) {
    if (!orgId) return
    setBusy(a.chave)
    try {
      const input: PromoverAggInput = {
        chave: a.chave,
        nome: a.nome,
        cidade: a.cidade_nome,
        uf: a.uf,
        precoMin: a.preco_min,
        precoMax: a.preco_max,
        taxaMediaPct: a.taxa_media,
        eventos: a.eventos,
        cidades: a.cidade ? [a.cidade] : [],
        fontes: a.fontes,
      }
      await promoverLocal(orgId, input, profile?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes', 'local'] })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      toast.success('Local promovido ao Comercial', { description: a.nome })
    } catch (e) {
      toast.error('Erro ao promover', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ListView
      title="Locais"
      count={rows.length ? String(rows.length) : undefined}
      footer={rows.length ? `${rows.length} local(is)` : undefined}
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
          <TableHead className="text-right">Eventos</TableHead>
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
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a)}>
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StarButton active={!!favoritos?.has(a.chave)} onToggle={() => onFav(a)} />
                    <IgnoreButton ignored={!!ignorados?.has(a.chave)} onToggle={() => onIgnorar(a)} />
                    <ImportCrmButton imported={!!promo} disabled={busy === a.chave || !orgId} onImport={() => onPromover(a)} />
                    <span className="truncate" title={a.nome}>{a.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="truncate text-muted-foreground" title={a.cidade ?? undefined}>{a.cidade ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
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
        subtitulo={[sel?.cidade, `${(eventosDoSel ?? []).length} evento(s) capturado(s)`].filter(Boolean).join(' · ')}
        eventos={eventosDoSel ?? []}
      />
    </ListView>
  )
}
