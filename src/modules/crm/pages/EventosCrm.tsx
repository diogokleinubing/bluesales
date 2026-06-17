import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readStr, readArr, buildSearchParams } from '@/lib/urlState'
import { useOpenItem } from '@/lib/useOpenItem'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CurrencyField } from '../components/EditFields'
import { EntityAutocomplete, type Lookup } from '../components/EntityAutocomplete'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useLocalOptions, useOrgOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import { usePlatforms, useLocalTipos } from '../hooks/useConfigCadastros'
import { createOrganization } from '../hooks/useOrganizations'
import {
  useCrmEvents, saveCrmEvent, deleteCrmEvent, saveLocal,
  replaceEventEditions,
  EVENTO_STATUS, CRM_CLASSES, type CrmEventRow, type EventoStatus, type CrmClasse,
} from '../hooks/useCadastros'
import { ListView, ToolbarSearch, TOOLBAR_TRIGGER } from '../components/ListView'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import { ClasseChips, useRelStageMap, InlineStageSelect, InlineClasseSelect } from '../components/RelacionamentoBits'
import { StageSelector } from '../components/StageSelector'
import { fmtBRL, fmtDate } from '@/lib/format'

const NONE = '__none__'
const STATUS_NONE = '__status_none__'
const ALL = '__all__'
const STAGE_NONE = '__stage_none__'

type Edicao = { data: string; platform_ids: string[] }

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  Planejado: 'secondary',
  Confirmado: 'default',
  Cancelado: 'destructive',
  Realizado: 'outline',
}

const EMPTY_FORM = {
  nome: '', capacidade_estimada: '', gmv_estimado: '', segmento_id: NONE,
  status: '' as string, observacoes: '', bi_event_codigo: '', site: '', instagram: '',
  classificacao: NONE,
}

export function EventosCrm() {
  const qc = useQueryClient()
  const openItem = useOpenItem()
  const orgId = useCrmOrgId()
  const { data, isLoading } = useCrmEvents()
  const locais = useLocalOptions()
  const orgs = useOrgOptions()
  const segs = useSegmentOptions()
  const platforms = usePlatforms()
  const tiposLocal = useLocalTipos()
  const stageMap = useRelStageMap()
  const platformById = useMemo(
    () => new Map((platforms.data ?? []).map((p) => [p.id, p.nome])),
    [platforms.data],
  )

  const [params, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => readStr(params, 'search'))
  const [statusFilter, setStatusFilter] = useState<string>(() => readStr(params, 'status', 'todos'))
  const [oppFilter, setOppFilter] = useState<string>(() => readStr(params, 'opportunity', 'todos'))
  const [classesSel, setClassesSel] = useState<string[]>(() => readArr(params, 'classes'))
  const [stageFilter, setStageFilter] = useState<string>(() => readStr(params, 'stage', ALL))
  const [gmvMin, setGmvMin] = useState(() => readStr(params, 'gmvMin'))
  useEffect(() => {
    setSearchParams(buildSearchParams([
      { k: 'search', v: search },
      { k: 'status', v: statusFilter, def: 'todos' },
      { k: 'opportunity', v: oppFilter, def: 'todos' },
      { k: 'classes', v: classesSel },
      { k: 'stage', v: stageFilter, def: ALL },
      { k: 'gmvMin', v: gmvMin },
    ]), { replace: true })
  }, [search, statusFilter, oppFilter, classesSel, stageFilter, gmvMin, setSearchParams])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [f, setF] = useState({ ...EMPTY_FORM })
  const [stage, setStage] = useState<string | null>(null)
  const [localPick, setLocalPick] = useState<Lookup | null>(null)
  const [orgPick, setOrgPick] = useState<Lookup | null>(null)
  const [edicoes, setEdicoes] = useState<Edicao[]>([])
  const [newEd, setNewEd] = useState<Edicao>({ data: '', platform_ids: [] })
  const [addEdOpen, setAddEdOpen] = useState(false)

  // Criar oportunidade a partir de um evento (pré-preenchida)
  const [oppFrom, setOppFrom] = useState<CrmEventRow | null>(null)

  // Diálogos de criação rápida
  const [nlOpen, setNlOpen] = useState(false)
  const [nl, setNl] = useState({ nome: '', cidade: '', uf: '', tipo: NONE })
  const [noOpen, setNoOpen] = useState(false)
  const [noNome, setNoNome] = useState('')

  const oppStages = useMemo(
    () => [...new Set((data ?? []).map((e) => e.oportunidade_status).filter(Boolean))] as string[],
    [data],
  )
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) => {
      if (q && !e.nome.toLowerCase().includes(q)) return false
      if (statusFilter !== 'todos' && e.status !== statusFilter) return false
      if (oppFilter === '__com__' && !e.oportunidade_status) return false
      if (oppFilter === '__sem__' && e.oportunidade_status) return false
      if (oppFilter !== 'todos' && oppFilter !== '__com__' && oppFilter !== '__sem__'
        && e.oportunidade_status !== oppFilter) return false
      if (classesSel.length > 0 && !(e.classificacao != null && classesSel.includes(e.classificacao))) return false
      if (stageFilter !== ALL && (stageFilter === STAGE_NONE ? e.funil_stage_id != null : e.funil_stage_id !== stageFilter)) return false
      if (gmvMin.trim() !== '' && (e.gmv_estimado == null || e.gmv_estimado < Number(gmvMin))) return false
      return true
    })
  }, [data, search, statusFilter, oppFilter, classesSel, stageFilter, gmvMin])

  function openNew() {
    setEditId(null)
    setF({ ...EMPTY_FORM })
    setStage(null)
    setLocalPick(null); setOrgPick(null)
    setEdicoes([]); setNewEd({ data: '', platform_ids: [] }); setAddEdOpen(false)
    setOpen(true)
  }

  function addEdicao() {
    if (!newEd.data && newEd.platform_ids.length === 0) return
    setEdicoes((e) => [...e, newEd])
    setNewEd({ data: '', platform_ids: [] })
    setAddEdOpen(false)
  }
  function addNewPlat(id: string) {
    setNewEd((e) => (e.platform_ids.includes(id) ? e : { ...e, platform_ids: [...e.platform_ids, id] }))
  }

  async function salvar() {
    if (!orgId || !f.nome.trim()) return
    try {
      const id = await saveCrmEvent(orgId, {
        nome: f.nome.trim(),
        local_id: localPick?.id ?? null,
        organization_id: orgPick?.id ?? null,
        capacidade_estimada: f.capacidade_estimada ? Number(f.capacidade_estimada) : null,
        gmv_estimado: f.gmv_estimado ? Number(f.gmv_estimado) : null,
        segmento_id: f.segmento_id === NONE ? null : f.segmento_id,
        status: (f.status || null) as EventoStatus | null,
        observacoes: f.observacoes.trim() || null,
        bi_event_codigo: f.bi_event_codigo.trim() || null,
        site: f.site.trim() || null,
        instagram: f.instagram.trim() || null,
        classificacao: f.classificacao === NONE ? null : (f.classificacao as CrmClasse),
        funil_stage_id: stage,
      }, editId ?? undefined)
      await replaceEventEditions(
        orgId, id,
        edicoes.map((e) => ({ data: e.data || null, platform_ids: e.platform_ids })),
      )
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
      setOpen(false)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }


  async function criarLocal() {
    if (!orgId || !nl.nome.trim()) return
    try {
      const id = await saveLocal(orgId, {
        nome: nl.nome.trim(),
        cidade: nl.cidade.trim() || null,
        uf: nl.uf.trim() || null,
        tipo_id: nl.tipo === NONE ? null : nl.tipo,
      })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      setLocalPick({ id, nome: nl.nome.trim() })
      setNlOpen(false); setNl({ nome: '', cidade: '', uf: '', tipo: NONE })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function criarOrg() {
    if (!orgId || !noNome.trim()) return
    try {
      const id = await createOrganization(orgId, { nome: noNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'orgs'] })
      setOrgPick({ id, nome: noNome.trim() })
      setNoOpen(false); setNoNome('')
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <>
      <ListView
        title="Eventos"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={openNew}><Plus className="size-4" /> Novo evento</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          <>
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar por nome…" />
            <ClasseChips value={classesSel} onChange={setClassesSel} />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue placeholder="Estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os estágios</SelectItem>
                <SelectItem value={STAGE_NONE}>Sem estágio</SelectItem>
                {[...stageMap.values()].map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-44`} size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {EVENTO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={oppFilter} onValueChange={setOppFilter}>
              <SelectTrigger className={`${TOOLBAR_TRIGGER} w-48`} size="sm"><SelectValue placeholder="Oportunidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as oportunidades</SelectItem>
                <SelectItem value="__com__">Com oportunidade</SelectItem>
                <SelectItem value="__sem__">Sem oportunidade</SelectItem>
                {oppStages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" min={0} value={gmvMin} onChange={(e) => setGmvMin(e.target.value)}
              placeholder="GMV mín. (R$)" className={`${TOOLBAR_TRIGGER} w-[150px]`} />
          </>
        }
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Datas</TableHead><TableHead>Local</TableHead>
            <TableHead>Organização</TableHead><TableHead className="text-right">GMV est.</TableHead>
            <TableHead>Status</TableHead><TableHead>Classe</TableHead><TableHead>Estágio</TableHead>
            <TableHead>Oportunidade</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Nenhum evento.</TableCell></TableRow>
            ) : rows.map((e) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={(ev) => openItem(ev, `/comercial/eventos/${e.id}`)}>
                <TableCell className="font-medium"><div className="max-w-[260px] truncate" title={e.nome}>{e.nome}</div></TableCell>
                <TableCell className="text-muted-foreground">
                  {e.datas.length ? e.datas.map((d) => fmtDate(d)).join(', ') : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.local_nome ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{e.organization_nome ?? '—'}</TableCell>
                <TableCell className="text-right">{e.gmv_estimado != null ? fmtBRL(e.gmv_estimado) : '—'}</TableCell>
                <TableCell>{e.status ? <Badge variant={STATUS_VARIANT[e.status] ?? 'secondary'}>{e.status}</Badge> : '—'}</TableCell>
                <TableCell><InlineClasseSelect tipo="evento" id={e.id} value={e.classificacao} /></TableCell>
                <TableCell><InlineStageSelect tipo="evento" id={e.id} value={e.funil_stage_id} /></TableCell>
                <TableCell>
                  {e.oportunidade_status ? (
                    <Badge
                      variant="outline"
                      className="cursor-pointer gap-1.5"
                      title="Abrir a oportunidade"
                      onClick={(ev) => { ev.stopPropagation(); if (e.oportunidade_id) openItem(ev, `/comercial/oportunidades/${e.oportunidade_id}`) }}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: e.oportunidade_cor ?? 'var(--muted-foreground)' }} />
                      {e.oportunidade_status}
                    </Badge>
                  ) : (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setOppFrom(e) }}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      className="inline-flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                      title="Criar oportunidade deste evento"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <button onClick={(ev) => openItem(ev, `/comercial/eventos/${e.id}`)} className="text-muted-foreground hover:text-foreground" title="Abrir"><Pencil className="size-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? 'Editar evento' : 'Novo evento'}</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>Nome</Label>
                <Input value={f.nome} autoFocus onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>

              <div className="space-y-1"><Label>Local</Label>
                <div className="flex gap-1">
                  <EntityAutocomplete className="flex-1" value={localPick} onPick={setLocalPick} options={locais.data ?? []} placeholder="Buscar local…" />
                  <Button type="button" variant="outline" size="icon" className="h-9 shrink-0" onClick={() => setNlOpen(true)} title="Novo local"><Plus className="size-4" /></Button>
                </div>
              </div>
              <div className="space-y-1"><Label>Organização</Label>
                <div className="flex gap-1">
                  <EntityAutocomplete className="flex-1" value={orgPick} onPick={setOrgPick} options={orgs.data ?? []} placeholder="Buscar organização…" />
                  <Button type="button" variant="outline" size="icon" className="h-9 shrink-0" onClick={() => setNoOpen(true)} title="Nova organização"><Plus className="size-4" /></Button>
                </div>
              </div>

              <div className="space-y-1"><Label>Status</Label>
                <Select value={f.status === '' ? STATUS_NONE : f.status} onValueChange={(v) => setF({ ...f, status: v === STATUS_NONE ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_NONE}>— Em branco</SelectItem>
                    {EVENTO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Segmento</Label>
                <Select value={f.segmento_id} onValueChange={(v) => setF({ ...f, segmento_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(segs.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>

              <div className="space-y-1"><Label>Classe</Label>
                <Select value={f.classificacao} onValueChange={(v) => setF({ ...f, classificacao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {CRM_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Estágio de relacionamento</Label>
                <StageSelector slug="relacionamento" value={stage} onChange={setStage} className="h-9 w-full" /></div>

              <div className="space-y-1"><Label>Capacidade estimada</Label>
                <Input type="number" value={f.capacidade_estimada} onChange={(e) => setF({ ...f, capacidade_estimada: e.target.value })} /></div>
              <CurrencyField label="GMV estimado" value={f.gmv_estimado} onChange={(v) => setF({ ...f, gmv_estimado: v })} />
              <div className="space-y-1"><Label>Site</Label>
                <Input value={f.site} placeholder="https://…" onChange={(e) => setF({ ...f, site: e.target.value })} /></div>
              <div className="space-y-1"><Label>Instagram</Label>
                <Input value={f.instagram} placeholder="@perfil" onChange={(e) => setF({ ...f, instagram: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label>Código BI</Label>
                <Input value={f.bi_event_codigo} onChange={(e) => setF({ ...f, bi_event_codigo: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label>Observações</Label>
                <Textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
            </div>

            {/* Histórico de edições (datas + plataformas) */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label>Edições (datas e plataformas)</Label>
              {edicoes.length > 0 && (
                <ul className="space-y-1">
                  {edicoes.map((ed, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{ed.data ? fmtDate(ed.data) : 'Sem data'}</span>
                        {ed.platform_ids.map((pid) => (
                          <Badge key={pid} variant="outline" className="text-xs">{platformById.get(pid) ?? '?'}</Badge>
                        ))}
                      </span>
                      <button onClick={() => setEdicoes((e) => e.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!addEdOpen ? (
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => { setNewEd({ data: '', platform_ids: [] }); setAddEdOpen(true) }}>
                  <Plus className="size-4" /> Adicionar edição
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-dashed border-border p-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Data</Label>
                      <Input type="date" className="h-8 w-40" value={newEd.data} onChange={(e) => setNewEd({ ...newEd, data: e.target.value })} />
                    </div>
                    <div className="min-w-44 flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Plataforma</Label>
                      <Select value="" onValueChange={addNewPlat}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Adicionar plataforma…" /></SelectTrigger>
                        <SelectContent>
                          {(platforms.data ?? []).filter((p) => !newEd.platform_ids.includes(p.id)).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {newEd.platform_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {newEd.platform_ids.map((pid) => (
                        <Badge key={pid} variant="outline" className="gap-1">
                          {platformById.get(pid) ?? '?'}
                          <button type="button" onClick={() => setNewEd((e) => ({ ...e, platform_ids: e.platform_ids.filter((x) => x !== pid) }))} className="text-muted-foreground hover:text-destructive">
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={addEdicao} disabled={!newEd.data && newEd.platform_ids.length === 0}>Adicionar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setAddEdOpen(false); setNewEd({ data: '', platform_ids: [] }) }}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {editId ? (
              <DeleteEntityButton
                title="Remover evento?"
                description={`"${f.nome}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
                onDelete={() => deleteCrmEvent(editId)}
                onDeleted={() => { qc.invalidateQueries({ queryKey: ['crm', 'events'] }); setOpen(false) }}
                label="Remover"
              />
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={!f.nome.trim()}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo local */}
      <Dialog open={nlOpen} onOpenChange={setNlOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo local</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label>
              <Input value={nl.nome} autoFocus onChange={(e) => setNl({ ...nl, nome: e.target.value })} /></div>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <div className="space-y-1"><Label>Cidade</Label>
                <Input value={nl.cidade} onChange={(e) => setNl({ ...nl, cidade: e.target.value })} /></div>
              <div className="space-y-1"><Label>UF</Label>
                <Input value={nl.uf} maxLength={2} onChange={(e) => setNl({ ...nl, uf: e.target.value.toUpperCase() })} /></div>
            </div>
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={nl.tipo} onValueChange={(v) => setNl({ ...nl, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(tiposLocal.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNlOpen(false)}>Cancelar</Button>
            <Button onClick={criarLocal} disabled={!nl.nome.trim()}>Criar e usar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova organização */}
      <Dialog open={noOpen} onOpenChange={setNoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova organização</DialogTitle></DialogHeader>
          <Input placeholder="Nome da organização" value={noNome} autoFocus onChange={(e) => setNoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criarOrg()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoOpen(false)}>Cancelar</Button>
            <Button onClick={criarOrg} disabled={!noNome.trim()}>Criar e usar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NovaOportunidadeDialog
        open={!!oppFrom}
        onOpenChange={(o) => !o && setOppFrom(null)}
        organizationId={oppFrom?.organization_id ?? undefined}
        initialTitulo={oppFrom?.nome}
        initialGmv={oppFrom?.gmv_estimado}
        initialEventId={oppFrom?.id}
      />
    </>
  )
}
