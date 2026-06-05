import { useMemo, useState } from 'react'
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
  type LocalAgg, type PromoverAggInput,
} from '../hooks/usePesquisa'

export function LocaisMercado() {
  const { data, isLoading } = useCrawledLocals()
  const promos = usePromocoes('local').data
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [sel, setSel] = useState<LocalAgg | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const { data: eventosDoSel } = useEventosDoLocal(sel?.nome ?? null, sel?.cidade ?? null)

  const aggregated = data ?? []

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = Number(valorMin)
    const temMin = valorMin.trim() !== '' && Number.isFinite(min)
    return aggregated.filter((a) => {
      if (q && !a.nome.toLowerCase().includes(q)) return false
      if (temMin && (a.preco_max == null || a.preco_max < min)) return false
      return true
    })
  }, [aggregated, search, valorMin])

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
      count={aggregated.length ? String(aggregated.length) : undefined}
      footer={aggregated.length ? `${rows.length} de ${aggregated.length}` : undefined}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar local…" />
          <Input type="number" min={0} value={valorMin} onChange={(e) => setValorMin(e.target.value)}
            placeholder="Valor mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
        </div>
      }
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Local</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead className="text-right">Eventos</TableHead>
          <TableHead className="text-right">Faixa de preço</TableHead>
          <TableHead className="text-right">Taxa média</TableHead>
          <TableHead>Fontes</TableHead>
          <TableHead>Próximo evento</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
              Nenhum local detectado ainda.
            </TableCell></TableRow>
          ) : rows.map((a) => {
            const promo = promos?.get(a.chave)
            return (
              <TableRow key={a.chave} className="cursor-pointer" onClick={() => setSel(a)}>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{a.cidade ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.eventos}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{faixaPreco(a.preco_min, a.preco_max)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{fmtTaxa(a.taxa_media)}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{a.fontes.map((f) => <Badge key={f} variant="outline">{f}</Badge>)}</div></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{a.proximo ? fmtDate(a.proximo) : '—'}</TableCell>
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
