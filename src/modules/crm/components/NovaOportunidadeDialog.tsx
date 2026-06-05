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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { useCrmOrgId, useFunnel } from '../hooks/useFunnelStages'
import { useOrgGmvOptions, useEventGmvOptions, useLocalOptions } from '../hooks/useCrmLookups'
import { useGmvCopy } from '../hooks/useGmvCopy'
import { createOpportunity } from '../hooks/useOpportunities'
import { createOrganization } from '../hooks/useOrganizations'
import { linkLocalToOrg } from '../hooks/useCadastros'

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

  // Criação rápida de organização dentro do diálogo.
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgNome, setNewOrgNome] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

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

  async function save() {
    if (!orgId || !user?.id || !titulo.trim() || !org || ativos.length === 0) {
      toast.error('Informe título e organização.')
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
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Organização</Label>
              {!organizationId && (
                <button
                  type="button"
                  onClick={abrirNovaOrg}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="size-3" /> Nova
                </button>
              )}
            </div>
            <Select value={org ?? ''} onValueChange={onOrgChange} disabled={!!organizationId}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(orgOptions.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Evento (opcional)</Label>
            <Select value={evento} onValueChange={onEventChange}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(eventOptions.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Local (opcional)</Label>
            <Select value={local} onValueChange={setLocal}>
              <SelectTrigger className="h-9" size="sm">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(localOptions.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    {gmvDialog}
    </>
  )
}
