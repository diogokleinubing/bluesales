import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, X, CalendarSearch, Building2, Trash2, GitMerge } from 'lucide-react'
import { useEventosDoLocalNome } from '@/modules/pesquisa/hooks/usePesquisa'
import { EventosDialog } from '@/modules/pesquisa/components/EventosDialog'
import { SocialLinks } from '../components/SocialLinks'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import {
  useLocais, saveLocal, deleteLocal, replaceLocalPlatforms,
  useLocalOrgs, linkLocalToOrg, unlinkOrgLocal,
  RELACAO_PLATAFORMA, CRM_CLASSES, LOCAL_RELACOES, type RelacaoPlataforma, type CrmClasse, type LocalRelacao, type LocalRow,
} from '../hooks/useCadastros'
import { useOrganizations } from '../hooks/useOrganizations'
import { EntityAutocomplete, type Lookup } from '../components/EntityAutocomplete'
import { usePlatforms, useLocalTipos } from '../hooks/useConfigCadastros'
import { AtividadesPanel } from '../components/AtividadesPanel'
import { OportunidadesCard } from '../components/OportunidadesCard'
import { EntityContatos } from '../components/EntityContatos'
import { EmTrabalhoToggle } from '../components/EmTrabalhoToggle'
import { MergeEntityDialog } from '../components/MergeEntityDialog'
import { StageChanger } from '../components/StageChanger'
import { ClasseBadge } from '../components/ClasseBadge'
import { DeleteEntityButton } from '../components/DeleteEntityButton'
import {
  useDraft, TextField, SelectField, CurrencyField, FormActions, toText, toNumber,
} from '../components/EditFields'

const REL_NONE = '__none__'

export function LocalDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useLocais()
  const local = useMemo(() => (data ?? []).find((l) => l.id === id) ?? null, [data, id])
  const [verEventos, setVerEventos] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  // Eventos captados pelo módulo Pesquisa para este local (lazy: só ao abrir).
  // Inclui o nome principal + nomes alternativos (aliases) na busca.
  const eventosLocal = useEventosDoLocalNome(
    verEventos && local
      ? [local.nome, ...(local.aliases?.split(',').map((a) => a.trim()).filter(Boolean) ?? [])]
      : null,
  )

  if (isLoading) return <div className="-mx-6 -mt-6 p-6"><Skeleton className="h-96 w-full" /></div>
  if (!local) return <div className="-mx-6 -mt-6 p-6 text-muted-foreground">Local não encontrado.</div>

  return (
    <div className="-mx-6 -mt-6 flex min-h-[calc(100%+3rem)] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-sm">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/comercial/locais'))} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{local.nome}</h1>
        <ClasseBadge classe={local.classificacao} />
        <div className="ml-auto flex items-center gap-2">
          <EmTrabalhoToggle tipo="local" entityId={local.id} />
          <button
            onClick={() => setVerEventos(true)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            title="Ver eventos captados pelo módulo Pesquisa"
          >
            <CalendarSearch className="size-4" /> Ver eventos
          </button>
          <SocialLinks site={local.site} instagram={local.instagram} />
        </div>
      </div>

      <EventosDialog
        open={verEventos}
        onOpenChange={setVerEventos}
        titulo={`Eventos captados — ${local.nome}`}
        subtitulo={eventosLocal.isLoading ? 'Carregando…' : `${eventosLocal.data?.length ?? 0} evento(s) do módulo Pesquisa`}
        loading={eventosLocal.isLoading}
        eventos={eventosLocal.data ?? []}
      />

      <MergeEntityDialog tipo="local" entityId={local.id} entityNome={local.nome} open={mergeOpen} onOpenChange={setMergeOpen} />

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_450px]">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <AtividadesPanel entityType="local" entityId={local.id} allowObjection={false} />
        </div>
        <aside className="space-y-6 p-4">
          <LocalDetalhesForm local={local} />
          <div className="-mx-4 border-t border-border" />
          <LocalPlataformas local={local} />
          <div className="-mx-4 border-t border-border" />
          <LocalOrganizacoes localId={local.id} />
          <div className="-mx-4 border-t border-border" />
          <EntityContatos entityType="local" entityId={local.id} />
          <div className="-mx-4 border-t border-border" />
          <OportunidadesCard localId={local.id} initialTitulo={local.nome} />
          <div className="-mx-4 border-t border-border" />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Opções</h3>
            <button
              onClick={() => setMergeOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <GitMerge className="size-4" /> Unificar duplicado
            </button>
            <DeleteEntityButton
              title="Remover local?"
              description={`"${local.nome}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
              onDelete={() => deleteLocal(local.id)}
              onDeleted={() => navigate('/comercial/locais')}
              label="Remover local"
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function LocalDetalhesForm({ local }: { local: LocalRow }) {
  const orgId = useCrmOrgId()
  const qc = useQueryClient()
  const tipos = useLocalTipos()
  const initial = useMemo(() => ({
    nome: local.nome,
    cidade: local.cidade ?? '',
    uf: local.uf ?? '',
    capacidade: local.capacidade != null ? String(local.capacidade) : '',
    tipo_id: local.tipo_id ?? '',
    gmv: local.gmv_estimado != null ? String(Math.round(local.gmv_estimado)) : '',
    site: local.site ?? '',
    instagram: local.instagram ?? '',
    aliases: local.aliases ?? '',
    classificacao: local.classificacao ?? '',
    relacao: local.relacao ?? '',
    observacoes: local.observacoes ?? '',
  }), [local])
  const { draft, set, dirty, reset } = useDraft(initial, local.id + (local.classificacao ?? ''))
  const [saving, setSaving] = useState(false)
  const [maisDetalhes, setMaisDetalhes] = useState(false)
  const changed = dirty

  async function salvar() {
    if (!orgId) return
    setSaving(true)
    try {
      await saveLocal(orgId, {
        nome: draft.nome.trim() || local.nome,
        cidade: toText(draft.cidade), uf: toText(draft.uf),
        capacidade: toNumber(draft.capacidade), tipo_id: toText(draft.tipo_id),
        gmv_estimado: toNumber(draft.gmv),
        site: toText(draft.site), instagram: toText(draft.instagram),
        aliases: toText(draft.aliases),
        observacoes: toText(draft.observacoes),
        classificacao: (toText(draft.classificacao) as CrmClasse | null),
        relacao: (toText(draft.relacao) as LocalRelacao | null),
        funil_stage_id: local.funil_stage_id,
      }, local.id)
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Detalhes</h3>
      <div className="space-y-3">
        <TextField label="Nome" value={draft.nome} onChange={(v) => set('nome', v)} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Classe" value={draft.classificacao} options={[...CRM_CLASSES]} onChange={(v) => set('classificacao', v)} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estágio</Label>
            <StageChanger tipo="local" entityId={local.id} currentStageId={local.funil_stage_id} className="h-8 w-full" />
          </div>
        </div>
        <SelectField label="Relação (o que buscamos com o local)" value={draft.relacao} options={[...LOCAL_RELACOES]} onChange={(v) => set('relacao', v)} />
        <div className="grid grid-cols-[1fr_70px] gap-3">
          <TextField label="Cidade" value={draft.cidade} onChange={(v) => set('cidade', v)} />
          <TextField label="UF" value={draft.uf} onChange={(v) => set('uf', v.toUpperCase())} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Tipo" value={draft.tipo_id}
            options={(tipos.data ?? []).map((t) => ({ value: t.id, label: t.nome }))}
            onChange={(v) => set('tipo_id', v)} />
          <TextField label="Capacidade" type="number" value={draft.capacidade} onChange={(v) => set('capacidade', v)} />
        </div>
        <CurrencyField label="GMV estimado" value={draft.gmv} onChange={(v) => set('gmv', v)} />
        <button type="button" onClick={() => setMaisDetalhes((v) => !v)} className="text-xs font-medium text-primary hover:underline">
          {maisDetalhes ? '− Menos detalhes' : '+ Mais detalhes'}
        </button>
        {maisDetalhes && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Site" value={draft.site} onChange={(v) => set('site', v)} placeholder="https://…" />
              <TextField label="Instagram" value={draft.instagram} onChange={(v) => set('instagram', v)} placeholder="@perfil" />
            </div>
            <TextField label="Nomes alternativos (match com a Pesquisa)" value={draft.aliases} onChange={(v) => set('aliases', v)} placeholder="Separe por vírgula" />
          </>
        )}
        {changed && <FormActions dirty={changed} saving={saving} onSave={salvar} onCancel={reset} />}
      </div>
    </div>
  )
}

function LocalOrganizacoes({ localId }: { localId: string }) {
  const qc = useQueryClient()
  const tenantOrgId = useCrmOrgId()
  const { data: vinculos, isLoading } = useLocalOrgs(localId)
  const { data: orgs } = useOrganizations()
  const [pick, setPick] = useState<Lookup | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  const jaVinculadas = new Set((vinculos ?? []).map((v) => v.organization_id))
  const options: Lookup[] = (orgs ?? [])
    .filter((o) => !jaVinculadas.has(o.id))
    .map((o) => ({ id: o.id, nome: o.cidade ? `${o.nome} — ${o.cidade}${o.uf ? `/${o.uf}` : ''}` : o.nome }))

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'local-orgs', localId] })

  async function vincular() {
    if (!pick || !tenantOrgId) return
    setSaving(true)
    try {
      await linkLocalToOrg(tenantOrgId, pick.id, localId)
      setPick(null)
      setAdding(false)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function remover(linkId: string) {
    try {
      await unlinkOrgLocal(linkId)
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  if (isLoading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Organizações vinculadas</h3>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground" title="Vincular organização">
          <Plus className="size-4" />
        </button>
      </div>
      {(vinculos ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma organização vinculada</p>
      )}
      {(vinculos ?? []).map((v) => (
        <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-medium">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{v.nome}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {v.cidade ? `${v.cidade}${v.uf ? `/${v.uf}` : ''}` : '—'}
            </div>
          </div>
          <button onClick={() => remover(v.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover vínculo">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {adding && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <EntityAutocomplete
            className="w-56"
            value={pick}
            onPick={setPick}
            options={options}
            placeholder="Buscar organização…"
          />
          <Button size="sm" variant="secondary" onClick={vincular} disabled={!pick || saving}>
            <Plus className="size-4" /> Vincular
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setPick(null) }}>Cancelar</Button>
        </div>
      )}
    </div>
  )
}

function LocalPlataformas({ local }: { local: LocalRow }) {
  const orgId = useCrmOrgId()
  const qc = useQueryClient()
  const platforms = usePlatforms()
  const [plats, setPlats] = useState(() => local.platforms.map((p) => ({ platform_id: p.platform_id, tipo_relacao: p.tipo_relacao })))
  const [newPlat, setNewPlat] = useState('')
  const [adding, setAdding] = useState(false)
  const platformById = useMemo(() => new Map((platforms.data ?? []).map((p) => [p.id, p.nome])), [platforms.data])
  const avail = (platforms.data ?? []).filter((p) => !plats.some((x) => x.platform_id === p.id))

  async function persist(next: { platform_id: string; tipo_relacao: RelacaoPlataforma | null }[]) {
    if (!orgId) return
    setPlats(next)
    try {
      await replaceLocalPlatforms(orgId, local.id, next)
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Plataformas de ingressos</h3>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground" title="Adicionar plataforma">
          <Plus className="size-4" />
        </button>
      </div>
      {plats.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">Nenhuma plataforma</p>
      ) : (
        <div className="space-y-2">
          {plats.length > 0 && (
            <ul className="space-y-1">
              {plats.map((pl) => (
                <li key={pl.platform_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{platformById.get(pl.platform_id) ?? '?'}</span>
                  <Select value={pl.tipo_relacao ?? REL_NONE}
                    onValueChange={(v) => persist(plats.map((x) => x.platform_id === pl.platform_id ? { ...x, tipo_relacao: v === REL_NONE ? null : (v as RelacaoPlataforma) } : x))}>
                    <SelectTrigger className="h-7 w-32 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={REL_NONE}>-</SelectItem>
                      {RELACAO_PLATAFORMA.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => persist(plats.filter((x) => x.platform_id !== pl.platform_id))} className="shrink-0 text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {adding && (
            <div className="flex items-end gap-2">
              <Select value={newPlat} onValueChange={setNewPlat}>
                <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Adicionar plataforma…" /></SelectTrigger>
                <SelectContent>{avail.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" size="sm" variant="secondary" disabled={!newPlat}
                onClick={() => { if (newPlat) { persist([...plats, { platform_id: newPlat, tipo_relacao: null }]); setNewPlat('') } }}>
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
