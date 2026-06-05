import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowUpRight, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '@/modules/crm/components/ListView'
import { EventosDialog } from '../components/EventosDialog'
import { faixaPreco, fmtTaxa } from '../lib/preco'
import {
  useCrawledLocals, useEventosDoLocal, usePromocoes,
  promoverLocal, useCrmOrgId,
  type LocalAgg, type LocalAggFilters, type PromoverAggInput,
} from '../hooks/usePesquisa'

export function LocaisMercado() {
  const promos = usePromocoes('local').data
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [aplicado, setAplicado] = useState({ search: '', valorMin: '' })
  const [sel, setSel] = useState<LocalAgg | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setAplicado({ search, valorMin }), 400)
    return () => clearTimeout(t)
  }, [search, valorMin])

  const filters: LocalAggFilters = useMemo(() => ({
    search: aplicado.search,
    valorMin: aplicado.valorMin.trim() !== '' && Number.isFinite(Number(aplicado.valorMin))
      ? Number(aplicado.valorMin) : null,
  }), [aplicado])

  const { data, isLoading } = useCrawledLocals(filters)
  const rows = data ?? []
  const { data: eventosDoSel } = useEventosDoLocal(sel?.nome ?? null, sel?.cidade ?? null)

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
          <Input type="number" min={0} value={valorMin} onChange={(e) => setValorMin(e.target.value)}
            placeholder="Valor mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
        </div>
      }
    >
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-[18%]" />
          <col className="w-16" />
          <col className="w-[120px]" />
          <col className="w-[88px]" />
          <col className="w-[140px]" />
          <col className="w-[96px]" />
          <col className="w-12" />
        </colgroup>
        <TableHeader><TableRow>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead className="text-right">Eventos</TableHead>
          <TableHead className="text-right">Faixa de preço</TableHead>
          <TableHead className="text-right">Taxa</TableHead>
          <TableHead>Fontes</TableHead>
          <TableHead>Próximo</TableHead>
          <TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
              Nenhum local encontrado.
            </TableCell></TableRow>
          ) : rows.map((a) => {
            const promo = promos?.get(a.chave)
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a)}>
                <TableCell className="truncate font-medium" title={a.nome}>{a.nome}</TableCell>
                <TableCell className="truncate text-muted-foreground" title={a.cidade ?? undefined}>{a.cidade ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
                <TableCell className="truncate text-right tabular-nums">{faixaPreco(a.preco_min, a.preco_max)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtTaxa(a.taxa_media)}</TableCell>
                <TableCell className="truncate"><div className="flex gap-1 overflow-hidden">{a.fontes.map((f) => <Badge key={f} variant="outline" className="shrink-0">{f}</Badge>)}</div></TableCell>
                <TableCell className="truncate text-muted-foreground">{a.proximo ? fmtDate(a.proximo) : '—'}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {promo ? (
                    <Badge variant="secondary" className="gap-1 whitespace-nowrap font-normal">
                      <Check className="size-3" /> No Comercial
                    </Badge>
                  ) : (
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2"
                      disabled={busy === a.chave || !orgId}
                      title="Promover ao Comercial"
                      onClick={() => onPromover(a)}
                    >
                      <ArrowUpRight className="size-4" />
                    </Button>
                  )}
                </TableCell>
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
