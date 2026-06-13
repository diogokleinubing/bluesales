import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  saveLocal, deleteLocal, replaceLocalPlatforms,
  RELACAO_PLATAFORMA, type RelacaoPlataforma,
  CRM_CLASSES, type CrmClasse,
} from '../hooks/useCadastros'
import { usePlatforms, useLocalTipos } from '../hooks/useConfigCadastros'
import { StageSelector } from './StageSelector'
import { DeleteEntityButton } from './DeleteEntityButton'

const TIPO_NONE = '__none__'
const REL_NONE = '__none__' // relação em branco (tipo_relacao = null)
const CLASSE_NONE = '__none__'

export type PlatRel = { platform_id: string; tipo_relacao: RelacaoPlataforma | null }

export interface LocalInitial {
  nome?: string
  cidade?: string | null
  uf?: string | null
  capacidade?: number | null
  tipo_id?: string | null
  observacoes?: string | null
  site?: string | null
  instagram?: string | null
  funil_stage_id?: string | null
  classificacao?: string | null
}

/** Dialog de cadastro/edição de local (form + plataformas). Reutilizado pela
 *  tela de Locais e pela importação da Pesquisa (com dados pré-preenchidos). */
export function LocalDialog({
  open,
  onOpenChange,
  orgId,
  editId,
  initial,
  initialPlatforms,
  saveLabel = 'Salvar',
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orgId: string | null
  editId: string | null
  initial: LocalInitial
  initialPlatforms: PlatRel[]
  saveLabel?: string
  onSaved?: (localId: string) => void
  onDeleted?: () => void
}) {
  const platforms = usePlatforms()
  const tipos = useLocalTipos()
  const platformById = useMemo(
    () => new Map((platforms.data ?? []).map((p) => [p.id, p.nome])),
    [platforms.data],
  )

  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [tipo, setTipo] = useState<string>(TIPO_NONE)
  const [site, setSite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [classe, setClasse] = useState<string>(CLASSE_NONE)
  const [stage, setStage] = useState<string | null>(null)
  const [obs, setObs] = useState('')
  const [plats, setPlats] = useState<PlatRel[]>([])
  const [newPlat, setNewPlat] = useState('')
  const [newRel, setNewRel] = useState<string>(REL_NONE)
  const [saving, setSaving] = useState(false)

  // Reinicializa o form ao abrir (com os valores fornecidos).
  useEffect(() => {
    if (!open) return
    setNome(initial.nome ?? '')
    setCidade(initial.cidade ?? '')
    setUf(initial.uf ?? '')
    setCapacidade(initial.capacidade != null ? String(initial.capacidade) : '')
    setTipo(initial.tipo_id ?? TIPO_NONE)
    setSite(initial.site ?? '')
    setInstagram(initial.instagram ?? '')
    setClasse(initial.classificacao ?? CLASSE_NONE)
    setStage(initial.funil_stage_id ?? null)
    setObs(initial.observacoes ?? '')
    setPlats(initialPlatforms)
    setNewPlat(''); setNewRel(REL_NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const availPlatforms = (platforms.data ?? []).filter((p) => !plats.some((x) => x.platform_id === p.id))

  function addPlat() {
    if (!newPlat || plats.some((p) => p.platform_id === newPlat)) return
    setPlats((p) => [...p, { platform_id: newPlat, tipo_relacao: newRel === REL_NONE ? null : (newRel as RelacaoPlataforma) }])
    setNewPlat('')
  }

  async function salvar() {
    if (!orgId || !nome.trim()) return
    setSaving(true)
    try {
      const id = await saveLocal(orgId, {
        nome: nome.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        capacidade: capacidade ? Number(capacidade) : null,
        tipo_id: tipo === TIPO_NONE ? null : tipo,
        observacoes: obs.trim() || null,
        site: site.trim() || null,
        instagram: instagram.trim() || null,
        classificacao: classe === CLASSE_NONE ? null : (classe as CrmClasse),
        funil_stage_id: stage,
      }, editId ?? undefined)
      await replaceLocalPlatforms(orgId, id, plats)
      onSaved?.(id)
      onOpenChange(false)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editId ? 'Editar local' : 'Novo local'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome</Label>
            <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-1"><Label>Cidade</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
            <div className="space-y-1"><Label>UF</Label>
              <Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Capacidade</Label>
              <Input type="number" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} /></div>
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TIPO_NONE}>—</SelectItem>
                  {(tipos.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Site</Label>
              <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" /></div>
            <div className="space-y-1"><Label>Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@perfil" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Classe</Label>
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLASSE_NONE}>—</SelectItem>
                  {CRM_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Estágio de relacionamento</Label>
              <StageSelector slug="relacionamento" value={stage} onChange={setStage} className="h-9 w-full" /></div>
          </div>
          <div className="space-y-1"><Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>

          {/* Plataformas de ingressos */}
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Plataformas de ingressos</Label>
            {plats.length > 0 && (
              <ul className="space-y-1">
                {plats.map((pl) => (
                  <li key={pl.platform_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{platformById.get(pl.platform_id) ?? '?'}</span>
                    <Select
                      value={pl.tipo_relacao ?? REL_NONE}
                      onValueChange={(v) => setPlats((p) => p.map((x) => x.platform_id === pl.platform_id
                        ? { ...x, tipo_relacao: v === REL_NONE ? null : (v as RelacaoPlataforma) } : x))}
                    >
                      <SelectTrigger className="h-7 w-36 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={REL_NONE}>-</SelectItem>
                        {RELACAO_PLATAFORMA.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button onClick={() => setPlats((p) => p.filter((x) => x.platform_id !== pl.platform_id))} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Plataforma</Label>
                <Select value={newPlat} onValueChange={setNewPlat}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {availPlatforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Relação</Label>
                <Select value={newRel} onValueChange={setNewRel}>
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={REL_NONE}>-</SelectItem>
                    {RELACAO_PLATAFORMA.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addPlat} disabled={!newPlat}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </div>
            {(platforms.data ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">Cadastre plataformas em Configuração → Plataformas.</span>
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {editId ? (
            <DeleteEntityButton
              title="Remover local?"
              description={`"${nome}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
              onDelete={() => deleteLocal(editId)}
              onDeleted={() => { onDeleted?.(); onOpenChange(false) }}
              label="Remover"
            />
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={!nome.trim() || saving}>{saving ? 'Salvando…' : saveLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
