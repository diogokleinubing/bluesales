import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Star, Ban, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { norm } from '@/modules/bi/lib/classify'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { EntityAutocomplete, type Lookup } from '@/modules/crm/components/EntityAutocomplete'
import { useFitRules, pickRule, scoreFit } from '@/modules/crm/hooks/useFitScore'
import { FitBadge } from '@/modules/crm/components/FitBadge'
import { EventosDialog } from '../components/EventosDialog'
import { StarButton, IgnoreButton } from '../components/StarButton'
import { ImportCrmButton } from '../components/ImportCrmButton'
import { faixaPreco, fmtTaxa } from '../lib/preco'
import { BR_UFS } from '../lib/ufs'
import {
  useCrawledOrganizers, useEventosDoOrganizador, usePromocoes, useCrmNomes, useCrawlerSources,
  useFavoritos, setFavoritoAgregado, useIgnorados, setIgnoradoAgregado,
  promoverOrganizador, conectarPromocoesPorNome, useCrmOrgId, useEventFacets,
  type OrganizerAgg, type OrganizerFilters, type PromoverAggInput,
} from '../hooks/usePesquisa'

export function OrganizadoresMercado() {
  const promos = usePromocoes('organizador').data
  const crmNomes = useCrmNomes('organizador').data
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
  const [fitMin, setFitMin] = useState('')
  const [ordFit, setOrdFit] = useState(false)
  const fitRules = useFitRules()
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
    cidade,
    uf,
  }), [aplicado, fonte, cidade, uf])

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

  const { data, isLoading } = useCrawledOrganizers(filters)
  const rows = useMemo(() => {
    const base = data ?? []
    if (soIgnorados) return base.filter((a) => ignorados?.has(a.chave))
    let r = base.filter((a) => !ignorados?.has(a.chave))
    if (soFav) r = r.filter((a) => favoritos?.has(a.chave))
    return r
  }, [data, soFav, soIgnorados, favoritos, ignorados])
  // Fit Score (configurável em Comercial → Configuração → Fit Score).
  const cfgOrg = useMemo(() => pickRule(fitRules.data ?? [], 'organizador', null), [fitRules.data])
  const rowsFit = useMemo(() => {
    const fitMinNum = fitMin.trim() !== '' ? Number(fitMin) : null
    let out = rows.map((a) => {
      const ticket = (a.preco_min != null || a.preco_max != null)
        ? ((a.preco_min ?? a.preco_max!) + (a.preco_max ?? a.preco_min!)) / 2 : null
      const fit = scoreFit({ ticket_medio: ticket, frequencia: a.eventos, alcance: a.cidades.length }, cfgOrg)
      return { a, fit }
    })
    if (fitMinNum != null) out = out.filter((r) => r.fit.score != null && !r.fit.eliminado && r.fit.score >= fitMinNum)
    if (ordFit) out = [...out].sort((x, y) => (y.fit.score ?? -1) - (x.fit.score ?? -1))
    return out
  }, [rows, cfgOrg, fitMin, ordFit])

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

  // Conecta (vincula) por nome os organizadores que já existem no CRM mas ainda
  // não têm vínculo — cria o link durável (chave→id) sobre os nomes atuais.
  const [conectando, setConectando] = useState(false)
  async function onConectarPorNome() {
    if (!orgId || !crmNomes) return
    const links = (data ?? [])
      .filter((a) => !promos?.has(a.chave))
      .map((a) => ({ chave: a.chave, rotulo: a.nome, id: crmNomes.get(norm(a.nome)) }))
      .filter((l): l is { chave: string; rotulo: string; id: string } => !!l.id)
    if (!links.length) { toast.info('Nenhum organizador novo casou por nome com o CRM.'); return }
    setConectando(true)
    try {
      const n = await conectarPromocoesPorNome(orgId, 'organizador', links, profile?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes', 'organizador'] })
      toast.success(`${n} organizador(es) conectados ao CRM por nome.`)
    } catch (e) {
      toast.error('Erro ao conectar', { description: (e as Error).message })
    } finally { setConectando(false) }
  }

  return (
    <ListView
      title="Organizadores"
      count={rowsFit.length ? String(rowsFit.length) : undefined}
      footer={rowsFit.length ? `${rowsFit.length} organizador(es)` : undefined}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar organizador…" />
          <Button variant="outline" size="sm" onClick={onConectarPorNome} disabled={conectando || !crmNomes}
            title="Vincular ao CRM os organizadores que já existem lá (match por nome atual)">
            <Link2 className="size-4" /> {conectando ? 'Conectando…' : 'Conectar por nome'}
          </Button>
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
          <Input type="number" min={0} max={100} value={fitMin} onChange={(e) => setFitMin(e.target.value)}
            placeholder="Fit mín." className={`${TOOLBAR_TRIGGER} w-[110px]`} />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={ordFit} onCheckedChange={(v) => setOrdFit(v === true)} /> Ordenar por fit
          </label>
        </div>
      }
    >
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-16" />
          <col className="w-16" />
          <col className="w-[16%]" />
          <col className="w-[200px]" />
          <col className="w-[88px]" />
          <col className="w-[140px]" />
          <col className="w-[112px]" />
        </colgroup>
        <TableHeader><TableRow>
          <TableHead>Organizador</TableHead>
          <TableHead>Fit</TableHead>
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
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rowsFit.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
              Nenhum organizador encontrado.
            </TableCell></TableRow>
          ) : rowsFit.map(({ a, fit }) => {
            const promo = promos?.get(a.chave)
            const noCrm = !promo && !!crmNomes?.has(norm(a.nome))
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a.nome)}>
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StarButton active={!!favoritos?.has(a.chave)} onToggle={() => onFav(a)} />
                    <IgnoreButton ignored={!!ignorados?.has(a.chave)} onToggle={() => onIgnorar(a)} />
                    <ImportCrmButton imported={!!promo} inCrm={noCrm} disabled={busy === a.chave || !orgId} onImport={() => onPromover(a)} />
                    <span className="truncate" title={a.nome}>{a.nome}</span>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}><FitBadge fit={fit} /></TableCell>
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
        showOrganizador={false}
      />
    </ListView>
  )
}
