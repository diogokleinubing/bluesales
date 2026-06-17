import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readStr, readBool, readArr, buildSearchParams } from '@/lib/urlState'
import { useOpenItem } from '@/lib/useOpenItem'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, CalendarDays, Upload, Globe } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  useLocais, bulkUpdateLocais, CRM_CLASSES,
  type LocalRow, type CrmClasse,
} from '../hooks/useCadastros'
import { usePlatforms, useLocalTipos } from '../hooks/useConfigCadastros'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '../components/ListView'
import { ClasseChips, useRelStageMap, InlineStageSelect, InlineClasseSelect } from '../components/RelacionamentoBits'
import { LocalDialog, type PlatRel, type LocalInitial } from '../components/LocalDialog'
import { useFitRules, pickRule, scoreFit } from '../hooks/useFitScore'
import { FitBadge } from '../components/FitBadge'
import { InstagramIcon } from '../components/SocialIcons'
import { LocaisImportWizard } from '../import/LocaisImportWizard'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import { EventosDialog } from '@/modules/pesquisa/components/EventosDialog'
import { useCrawledLocals, useEventosDoLocalChaves } from '@/modules/pesquisa/hooks/usePesquisa'
import { fmtBRL, fmtInt } from '@/lib/format'

const ALL = '__all__'
const STAGE_NONE = '__none__'
const STAGE_ATIVOS = '__ativos__'

const siteHref = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`)
const igHref = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://instagram.com/${s.replace(/^@/, '').trim()}`)

/** Normaliza nome para casar locais do CRM com os da Pesquisa (sem acento/pontuação). */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function Locais() {
  const qc = useQueryClient()
  const openItem = useOpenItem()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useLocais()
  const platforms = usePlatforms()
  const tipos = useLocalTipos()
  const stageMap = useRelStageMap()
  // Locais detectados na Pesquisa (agregado por nome) para casar por nome.
  const crawled = useCrawledLocals({ search: '', valorMin: null, fonte: 'todas', cidade: 'todas', uf: '' })
  const fitRules = useFitRules()
  const matchMap = useMemo(() => {
    const m = new Map<string, { chaves: string[]; eventos: number; precoMin: number | null; precoMax: number | null }>()
    for (const a of crawled.data ?? []) {
      const k = norm(a.nome)
      if (!k) continue
      const e = m.get(k) ?? { chaves: [], eventos: 0, precoMin: null, precoMax: null }
      e.chaves.push(a.chave); e.eventos += a.eventos
      if (a.preco_min != null) e.precoMin = e.precoMin == null ? a.preco_min : Math.min(e.precoMin, a.preco_min)
      if (a.preco_max != null) e.precoMax = e.precoMax == null ? a.preco_max : Math.max(e.precoMax, a.preco_max)
      m.set(k, e)
    }
    return m
  }, [crawled.data])
  const [params, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => readStr(params, 'search'))
  const [platFilter, setPlatFilter] = useState<string>(() => readStr(params, 'platform', ALL))
  const [tipoFilter, setTipoFilter] = useState<string>(() => readStr(params, 'type', ALL))
  const [ufFilter, setUfFilter] = useState<string>(() => readStr(params, 'state', ALL))
  const [classesSel, setClassesSel] = useState<string[]>(() => readArr(params, 'classes'))
  const [stageFilter, setStageFilter] = useState<string>(() => readStr(params, 'stage', STAGE_ATIVOS))
  const [gmvMin, setGmvMin] = useState(() => readStr(params, 'gmvMin'))
  const [capMin, setCapMin] = useState(() => readStr(params, 'capMin'))
  const [fitMin, setFitMin] = useState(() => readStr(params, 'fitMin'))
  const [ordFit, setOrdFit] = useState(() => readBool(params, 'sortByFit'))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'search', v: search },
      { k: 'platform', v: platFilter, def: ALL },
      { k: 'type', v: tipoFilter, def: ALL },
      { k: 'state', v: ufFilter, def: ALL },
      { k: 'classes', v: classesSel },
      { k: 'stage', v: stageFilter, def: STAGE_ATIVOS },
      { k: 'gmvMin', v: gmvMin },
      { k: 'capMin', v: capMin },
      { k: 'fitMin', v: fitMin },
      { k: 'sortByFit', v: ordFit },
    ]), { replace: true })
  }, [search, platFilter, tipoFilter, ufFilter, classesSel, stageFilter, gmvMin, capMin, fitMin, ordFit, setSearchParams])
  const [oppFrom, setOppFrom] = useState<LocalRow | null>(null)
  const [eventsLocal, setEventsLocal] = useState<{ row: LocalRow; chaves: string[] } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [initial, setInitial] = useState<LocalInitial>({})
  const [initialPlats, setInitialPlats] = useState<PlatRel[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = Number(gmvMin)
    const temMin = gmvMin.trim() !== '' && Number.isFinite(min)
    const cap = Number(capMin)
    const temCap = capMin.trim() !== '' && Number.isFinite(cap)
    return (data ?? []).filter((l) =>
      (!q || l.nome.toLowerCase().includes(q) || (l.cidade ?? '').toLowerCase().includes(q)) &&
      (platFilter === ALL || l.platforms.some((p) => p.platform_id === platFilter)) &&
      (tipoFilter === ALL || l.tipo_id === tipoFilter) &&
      (ufFilter === ALL || l.uf === ufFilter) &&
      (classesSel.length === 0 || (l.classificacao != null && classesSel.includes(l.classificacao))) &&
      (stageFilter === ALL
        ? true
        : stageFilter === STAGE_ATIVOS
          ? (l.funil_stage_id == null || stageMap.get(l.funil_stage_id)?.ativo !== false)
          : stageFilter === STAGE_NONE
            ? l.funil_stage_id == null
            : l.funil_stage_id === stageFilter) &&
      (!temCap || (l.capacidade != null && l.capacidade >= cap)) &&
      (!temMin || (l.gmv != null && l.gmv >= min)))
  }, [data, search, platFilter, tipoFilter, ufFilter, classesSel, stageFilter, gmvMin, capMin, stageMap])

  const ufs = useMemo(
    () => [...new Set((data ?? []).map((l) => l.uf).filter(Boolean) as string[])].sort(),
    [data],
  )

  // Fit Score: métricas do local (do match na Pesquisa + CRM) → regra do tipo.
  const rowsFit = useMemo(() => {
    const fitMinNum = fitMin.trim() !== '' ? Number(fitMin) : null
    let out = rows.map((l) => {
      const m = matchMap.get(norm(l.nome))
      const ticket = m && (m.precoMin != null || m.precoMax != null)
        ? ((m.precoMin ?? m.precoMax!) + (m.precoMax ?? m.precoMin!)) / 2 : null
      const cfg = pickRule(fitRules.data ?? [], 'local', l.tipo_id)
      const fit = scoreFit({ ticket_medio: ticket, frequencia: m?.eventos ?? null, capacidade: l.capacidade ?? null }, cfg)
      return { ...l, fit }
    })
    if (fitMinNum != null) out = out.filter((r) => r.fit.score != null && !r.fit.eliminado && r.fit.score >= fitMinNum)
    if (ordFit) out = [...out].sort((a, b) => (b.fit.score ?? -1) - (a.fit.score ?? -1))
    return out
  }, [rows, matchMap, fitRules.data, fitMin, ordFit])

  // Eventos capturados (Pesquisa) do local selecionado para o dialog.
  const { data: localEventos, isLoading: localEventosLoading } = useEventosDoLocalChaves(eventsLocal?.chaves ?? null)

  function invalidarLocais() {
    qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
    qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
  }

  function openNew() {
    setEditId(null); setInitial({}); setInitialPlats([]); setOpen(true)
  }

  // Seleção em massa
  const rowIds = rowsFit.map((r) => r.id)
  const allSel = rowIds.length > 0 && rowIds.every((id) => selected.has(id))
  const headerState: boolean | 'indeterminate' = allSel ? true : rowIds.some((id) => selected.has(id)) ? 'indeterminate' : false
  function toggle(id: string) {
    setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelected((p) => (rowIds.every((id) => p.has(id)) ? new Set<string>() : new Set(rowIds)))
  }
  async function applyBulk(patch: { classificacao?: CrmClasse | null; tipo_id?: string | null; funil_stage_id?: string | null }) {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      await bulkUpdateLocais(ids, patch)
      invalidarLocais()
      toast.success(`${ids.length} local(is) atualizado(s)`)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  const bulkBar = selected.size > 0 ? (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
      <span className="font-medium text-foreground">{selected.size} selecionado(s)</span>
      <span className="text-muted-foreground">Atualizar:</span>
      <Select value="" onValueChange={(v) => applyBulk({ classificacao: v === STAGE_NONE ? null : (v as CrmClasse) })}>
        <SelectTrigger className="h-8 w-32" size="sm"><SelectValue placeholder="Classe…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={STAGE_NONE}>— (remover)</SelectItem>
          {CRM_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value="" onValueChange={(v) => applyBulk({ tipo_id: v === STAGE_NONE ? null : v })}>
        <SelectTrigger className="h-8 w-44" size="sm"><SelectValue placeholder="Tipo de local…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={STAGE_NONE}>— (remover)</SelectItem>
          {(tipos.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value="" onValueChange={(v) => applyBulk({ funil_stage_id: v === STAGE_NONE ? null : v })}>
        <SelectTrigger className="h-8 w-44" size="sm"><SelectValue placeholder="Estágio…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={STAGE_NONE}>— Sem estágio</SelectItem>
          {[...stageMap.values()].map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
    </div>
  ) : null

  return (
    <>
      <ListView
        title="Locais"
        count={data ? String(data.length) : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Importar</Button>
            <Button onClick={openNew}><Plus className="size-4" /> Novo local</Button>
          </>
        }
        footer={data ? `${rowsFit.length} de ${data.length}` : undefined}
        toolbar={
          <>
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome ou cidade…" />
            <ClasseChips value={classesSel} onChange={setClassesSel} />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={STAGE_ATIVOS}>Estágios ativos</SelectItem>
                <SelectItem value={ALL}>Todos os estágios</SelectItem>
                <SelectItem value={STAGE_NONE}>Sem estágio</SelectItem>
                {[...stageMap.values()].map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-40`} size="sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {(tipos.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ufFilter} onValueChange={setUfFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-28`} size="sm"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as UFs</SelectItem>
                {ufs.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={platFilter} onValueChange={setPlatFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-48`} size="sm"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as plataformas</SelectItem>
                {(platforms.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" min={0} value={capMin} onChange={(e) => setCapMin(e.target.value)}
              placeholder="Capacidade mín." className={`${TOOLBAR_TRIGGER} w-[150px]`} />
            <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
              placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
            <Input type="number" min={0} max={100} value={fitMin} onChange={(e) => setFitMin(e.target.value)}
              placeholder="Fit mín." className={`${TOOLBAR_TRIGGER} w-[110px]`} />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={ordFit} onCheckedChange={(v) => setOrdFit(v === true)} /> Ordenar por fit
            </label>
          </>
        }
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-8"><Checkbox checked={headerState} onCheckedChange={() => toggleAll()} aria-label="Selecionar todos" /></TableHead>
            <TableHead>Nome</TableHead><TableHead>Fit</TableHead><TableHead>Cidade/UF</TableHead>
            <TableHead>Capacidade</TableHead><TableHead>Tipo</TableHead>
            <TableHead>Plataformas</TableHead><TableHead className="text-right">GMV</TableHead>
            <TableHead>Classe</TableHead><TableHead>Estágio</TableHead>
            <TableHead>Oportunidade</TableHead><TableHead className="w-28" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={12}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rowsFit.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum local.</TableCell></TableRow>
            ) : rowsFit.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={(e) => openItem(e, `/comercial/locais/${l.id}`)} data-state={selected.has(l.id) ? 'selected' : undefined}>
                <TableCell className="w-8" onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} aria-label="Selecionar" /></TableCell>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={l.nome}>{l.nome}</div></TableCell>
                <TableCell><FitBadge fit={l.fit} /></TableCell>
                <TableCell className="text-muted-foreground">{[l.cidade, l.uf].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell>{l.capacidade != null ? fmtInt(l.capacidade) : '—'}</TableCell>
                <TableCell>{l.tipo_nome ? <Badge variant="outline">{l.tipo_nome}</Badge> : '—'}</TableCell>
                <TableCell>
                  {l.platforms.length ? (
                    <div className="flex flex-wrap gap-1">
                      {l.platforms.map((pl) => {
                        const isBt = pl.nome.toLowerCase() === 'blueticket'
                        return (
                          <Badge
                            key={pl.platform_id}
                            variant="outline"
                            className={`gap-1.5 ${isBt ? 'border-sky-200 bg-sky-100 text-sky-700' : ''}`}
                            title={pl.tipo_relacao ?? undefined}
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{
                                backgroundColor:
                                  pl.tipo_relacao === 'Exclusividade'
                                    ? 'var(--success)'
                                    : pl.tipo_relacao === 'Homologada'
                                      ? 'var(--warning)'
                                      : 'var(--muted-foreground)',
                              }}
                            />
                            {pl.nome}
                          </Badge>
                        )
                      })}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{l.gmv != null ? fmtBRL(l.gmv) : '—'}</TableCell>
                <TableCell><InlineClasseSelect tipo="local" id={l.id} value={l.classificacao} /></TableCell>
                <TableCell><InlineStageSelect tipo="local" id={l.id} value={l.funil_stage_id} /></TableCell>
                <TableCell>
                  {l.oppAtivas > 0 ? (
                    <Badge variant="outline" className="gap-1.5" title={`${l.oppAtivas} oportunidade(s) em aberto neste local`}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: l.oppCor ?? 'var(--muted-foreground)' }} />
                      {l.oppStatus ?? 'Em aberto'}
                      {l.oppAtivas > 1 && <span className="text-muted-foreground">+{l.oppAtivas - 1}</span>}
                    </Badge>
                  ) : (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setOppFrom(l) }}
                      className="inline-flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                      title="Criar oportunidade deste local"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {l.instagram && <a href={igHref(l.instagram)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title="Instagram"><InstagramIcon className="size-4" /></a>}
                    {l.site && <a href={siteHref(l.site)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title="Site"><Globe className="size-4" /></a>}
                    {(() => {
                      const m = matchMap.get(norm(l.nome))
                      return m ? (
                        <button onClick={(ev) => { ev.stopPropagation(); setEventsLocal({ row: l, chaves: m.chaves }) }}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--success)]/15 px-1.5 py-0.5 text-[var(--success)] hover:bg-[var(--success)]/25"
                          title={`${m.eventos} evento(s) capturado(s) na Pesquisa`}>
                          <CalendarDays className="size-4" /><span className="text-xs font-medium tabular-nums">{m.eventos}</span>
                        </button>
                      ) : null
                    })()}
                    <button onClick={(e) => openItem(e, `/comercial/locais/${l.id}`)} className="text-muted-foreground hover:text-foreground" title="Abrir"><Pencil className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>

      <LocalDialog
        open={open}
        onOpenChange={setOpen}
        orgId={orgId ?? null}
        editId={editId}
        initial={initial}
        initialPlatforms={initialPlats}
        onSaved={invalidarLocais}
        onDeleted={invalidarLocais}
      />

      <NovaOportunidadeDialog
        open={!!oppFrom}
        onOpenChange={(o) => !o && setOppFrom(null)}
        initialTitulo={oppFrom?.nome}
        initialLocalId={oppFrom?.id}
      />

      <EventosDialog
        open={!!eventsLocal}
        onOpenChange={(o) => !o && setEventsLocal(null)}
        titulo={eventsLocal?.row.nome ?? ''}
        subtitulo={localEventosLoading ? 'Carregando…' : `${(localEventos ?? []).length} evento(s) capturado(s)`}
        loading={localEventosLoading}
        eventos={localEventos ?? []}
      />

      <LocaisImportWizard open={importOpen} onOpenChange={setImportOpen} />

      {bulkBar}
    </>
  )
}
