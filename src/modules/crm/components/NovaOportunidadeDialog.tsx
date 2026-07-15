import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyField } from './EditFields'
import { EntityAutocomplete, type Lookup } from './EntityAutocomplete'
import { useAuth } from '@/lib/auth'
import { useCrmOrgId, useFunnel } from '../hooks/useFunnelStages'
import { useOrgGmvOptions, useEventGmvOptions, useLocalOptions } from '../hooks/useCrmLookups'
import { useGmvCopy } from '../hooks/useGmvCopy'
import { createOpportunity } from '../hooks/useOpportunities'
import { createOrganization } from '../hooks/useOrganizations'
import { linkLocalToOrg, saveCrmEvent, saveLocal } from '../hooks/useCadastros'

const NONE = '__none__'

export function NovaOportunidadeDialog({
  open,
  onOpenChange,
  organizationId,
  initialTitulo,
  initialGmv,
  initialEventId,
  initialLocalId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  organizationId?: string
  initialTitulo?: string
  initialGmv?: number | null
  initialEventId?: string
  initialLocalId?: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const orgId = useCrmOrgId()
  const { user } = useAuth()
  const orgOptions = useOrgGmvOptions()
  const eventOptions = useEventGmvOptions()
  const localOptions = useLocalOptions()
  const { stages } = useFunnel('oportunidade')
  const ativos = stages.filter((s) => s.ativo)

  const [titulo, setTitulo] = useState('')
  const [org, setOrg] = useState<string | null>(organizationId ?? null)
  const [evento, setEvento] = useState<string>(NONE)
  const [local, setLocal] = useState<string>(NONE)
  const [gmv, setGmv] = useState('')
  const [saving, setSaving] = useState(false)
  const { consider, dialog: gmvDialog } = useGmvCopy(gmv, setGmv)

  // Criação rápida de entidade dentro do diálogo (organização / evento / local).
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgNome, setNewOrgNome] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [newEventOpen, setNewEventOpen] = useState(false)
  const [newEventNome, setNewEventNome] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [newLocalOpen, setNewLocalOpen] = useState(false)
  const [newLocalNome, setNewLocalNome] = useState('')
  const [creatingLocal, setCreatingLocal] = useState(false)

  function abrirNovaOrg() {
    // Pré-preenche com o nome do local selecionado, se houver.
    const localNome = local !== NONE ? localOptions.data?.find((l) => l.id === local)?.nome : ''
    setNewOrgNome(localNome ?? '')
    setNewOrgOpen(true)
  }

  async function criarOrg() {
    if (!orgId || !newOrgNome.trim()) return
    setCreatingOrg(true)
    try {
      const novoId = await createOrganization(orgId, { nome: newOrgNome.trim() })
      // Se há um local selecionado, vincula-o à nova organização.
      if (local !== NONE) {
        try {
          await linkLocalToOrg(orgId, novoId, local)
          qc.invalidateQueries({ queryKey: ['crm', 'org-locais', novoId] })
        } catch { /* vínculo opcional */ }
      }
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'orgs-gmv'] })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      setOrg(novoId)
      setNewOrgOpen(false)
      toast.success('Organização criada')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setCreatingOrg(false)
    }
  }

  async function criarEvento() {
    if (!orgId || !newEventNome.trim()) return
    setCreatingEvent(true)
    try {
      const id = await saveCrmEvent(orgId, { nome: newEventNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'events-gmv'] })
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
      setEvento(id)
      setNewEventOpen(false); setNewEventNome('')
      toast.success('Evento criado')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setCreatingEvent(false) }
  }

  async function criarLocal() {
    if (!orgId || !newLocalNome.trim()) return
    setCreatingLocal(true)
    try {
      const id = await saveLocal(orgId, { nome: newLocalNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      setLocal(id)
      setNewLocalOpen(false); setNewLocalNome('')
      toast.success('Local criado')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally { setCreatingLocal(false) }
  }

  // Reinicializa o formulário ao abrir (com valores pré-preenchidos, se houver).
  useEffect(() => {
    if (!open) return
    setTitulo(initialTitulo ?? '')
    setOrg(organizationId ?? null)
    setEvento(initialEventId ?? NONE)
    setLocal(initialLocalId ?? NONE)
    setGmv(initialGmv != null ? String(Math.round(initialGmv)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onOrgChange(id: string) {
    setOrg(id)
    const o = orgOptions.data?.find((x) => x.id === id)
    if (o) consider(o.gmv, `A organização "${o.nome}"`)
  }
  function onEventChange(id: string) {
    setEvento(id)
    if (id === NONE) return
    const e = eventOptions.data?.find((x) => x.id === id)
    if (e) consider(e.gmv, `O evento "${e.nome}"`)
  }

  // Valores selecionados (para o autocomplete) e handlers de pick.
  const orgValue = org ? (orgOptions.data?.find((o) => o.id === org) ?? null) : null
  const eventoValue = evento !== NONE ? (eventOptions.data?.find((e) => e.id === evento) ?? null) : null
  const localValue = local !== NONE ? (localOptions.data?.find((l) => l.id === local) ?? null) : null
  const orgNome = orgValue?.nome ?? ''

  function pickOrg(v: Lookup | null) { if (v) onOrgChange(v.id); else setOrg(null) }
  function pickEvento(v: Lookup | null) { onEventChange(v ? v.id : NONE) }
  function pickLocal(v: Lookup | null) { setLocal(v ? v.id : NONE) }

  async function save() {
    if (!orgId || !user?.id || !titulo.trim() || ativos.length === 0) {
      toast.error('Informe ao menos o título.')
      return
    }
    setSaving(true)
    try {
      const id = await createOpportunity(orgId, user.id, {
        titulo: titulo.trim(),
        organization_id: org,
        stage_id: ativos[0].id,
        gmv_estimado: gmv ? Number(gmv) : null,
        crm_event_id: evento === NONE ? null : evento,
        local_id: local === NONE ? null : local,
      })
      qc.invalidateQueries({ queryKey: ['crm', 'opportunities'] })
      qc.invalidateQueries({ queryKey: ['crm', 'kanban', 'opps'] })
      qc.invalidateQueries({ queryKey: ['crm', 'events'] })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      onOpenChange(false)
      setTitulo(''); setGmv(''); setEvento(NONE); setLocal(NONE)
      navigate(`/comercial/oportunidades/${id}`)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Organização</Label>
            <div className="flex items-center gap-2">
              {organizationId ? (
                <Input className="h-9" value={orgNome} disabled />
              ) : (
                <EntityAutocomplete
                  className="flex-1"
                  value={orgValue}
                  onPick={pickOrg}
                  options={orgOptions.data ?? []}
                  placeholder="Digite para buscar…"
                />
              )}
              {!organizationId && (
                <Button type="button" variant="outline" size="sm" onClick={abrirNovaOrg} className="h-9 shrink-0 gap-1">
                  <Plus className="size-3.5" /> Nova
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Evento</Label>
            <div className="flex items-center gap-2">
              <EntityAutocomplete
                className="flex-1"
                value={eventoValue}
                onPick={pickEvento}
                options={eventOptions.data ?? []}
                placeholder="Digite para buscar…"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => { setNewEventNome(''); setNewEventOpen(true) }} className="h-9 shrink-0 gap-1">
                <Plus className="size-3.5" /> Novo
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Local</Label>
            <div className="flex items-center gap-2">
              <EntityAutocomplete
                className="flex-1"
                value={localValue}
                onPick={pickLocal}
                options={localOptions.data ?? []}
                placeholder="Digite para buscar…"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => { setNewLocalNome(''); setNewLocalOpen(true) }} className="h-9 shrink-0 gap-1">
                <Plus className="size-3.5" /> Novo
              </Button>
            </div>
          </div>
          <CurrencyField label="GMV estimado" value={gmv} onChange={setGmv} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={newOrgOpen} onOpenChange={(o) => !creatingOrg && setNewOrgOpen(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova organização</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); criarOrg() }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input value={newOrgNome} autoFocus onChange={(e) => setNewOrgNome(e.target.value)} />
          </div>
          {local !== NONE && (
            <p className="text-xs text-muted-foreground">
              O local selecionado será vinculado a esta organização.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewOrgOpen(false)} disabled={creatingOrg}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creatingOrg || !newOrgNome.trim()}>
              {creatingOrg ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={newEventOpen} onOpenChange={(o) => !creatingEvent && setNewEventOpen(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); criarEvento() }} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input value={newEventNome} autoFocus onChange={(e) => setNewEventNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewEventOpen(false)} disabled={creatingEvent}>Cancelar</Button>
            <Button type="submit" disabled={creatingEvent || !newEventNome.trim()}>{creatingEvent ? 'Criando…' : 'Criar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={newLocalOpen} onOpenChange={(o) => !creatingLocal && setNewLocalOpen(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo local</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); criarLocal() }} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input value={newLocalNome} autoFocus onChange={(e) => setNewLocalNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewLocalOpen(false)} disabled={creatingLocal}>Cancelar</Button>
            <Button type="submit" disabled={creatingLocal || !newLocalNome.trim()}>{creatingLocal ? 'Criando…' : 'Criar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {gmvDialog}
    </>
  )
}
