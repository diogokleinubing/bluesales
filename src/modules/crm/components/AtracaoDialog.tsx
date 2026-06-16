import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { norm } from '@/modules/bi/lib/classify'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { useGeneroOptions, useOrgOptions, useSegmentOptions } from '../hooks/useCrmLookups'
import { usePlatforms } from '../hooks/useConfigCadastros'
import {
  useArtists, saveArtist, deleteArtist, ARTIST_CLASSES,
  type ArtistRow, type ArtistClasse,
} from '../hooks/useCadastros'
import { DeleteEntityButton } from './DeleteEntityButton'

const NONE = '__none__'

/** Pré-preenchimento ao abrir para uma nova atração (ex.: a partir de um evento). */
export interface AtracaoInitial {
  nome?: string
  segmentoNome?: string | null
  generoNome?: string | null
}

/** Dialog de cadastro/edição de atração (reutilizável fora da tela de Atrações). */
export function AtracaoDialog({
  open,
  onOpenChange,
  edit,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Quando definido, edita a atração existente; senão cria uma nova. */
  edit?: ArtistRow | null
  initial?: AtracaoInitial
  onSaved?: (id: string | null) => void
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data: artists } = useArtists()
  const generos = useGeneroOptions()
  const segmentos = useSegmentOptions()
  const orgs = useOrgOptions()
  const platforms = usePlatforms()

  const [nome, setNome] = useState('')
  const [aliases, setAliases] = useState('')
  const [segmentoSel, setSegmentoSel] = useState(NONE)
  const [generoId, setGeneroId] = useState(NONE)
  const [classe, setClasse] = useState(NONE)
  const [orgSel, setOrgSel] = useState(NONE)
  const [platSel, setPlatSel] = useState(NONE)
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)

  // Inicializa os campos ao abrir (edição ou pré-preenchimento).
  useEffect(() => {
    if (!open) return
    if (edit) {
      setNome(edit.nome)
      setAliases(edit.aliases ?? '')
      setSegmentoSel(edit.segmento ?? NONE)
      setGeneroId(edit.genero_id ?? NONE)
      setClasse(edit.classificacao ?? NONE)
      setOrgSel(edit.organization_id ?? NONE)
      setPlatSel(edit.platform_id ?? NONE)
      setObs(edit.observacoes ?? '')
    } else {
      const gid = initial?.generoNome
        ? (generos.data ?? []).find((g) => norm(g.nome) === norm(initial.generoNome!))?.id ?? NONE
        : NONE
      setNome(initial?.nome ?? '')
      setAliases('')
      setSegmentoSel(initial?.segmentoNome ?? NONE)
      setGeneroId(gid)
      setClasse(NONE)
      setOrgSel(NONE)
      setPlatSel(NONE)
      setObs('')
    }
  }, [open, edit, initial, generos.data])

  async function salvar() {
    if (!orgId || !nome.trim()) return
    const alvo = norm(nome)
    const dup = (artists ?? []).find((a) => a.id !== edit?.id && norm(a.nome) === alvo)
    if (dup) {
      toast.error('Atração já cadastrada', { description: `Já existe "${dup.nome}".` })
      return
    }
    setSaving(true)
    try {
      await saveArtist(orgId, {
        nome: nome.trim(),
        genero_id: generoId === NONE ? null : generoId,
        segmento: segmentoSel === NONE ? null : segmentoSel,
        classificacao: classe === NONE ? null : (classe as ArtistClasse),
        organization_id: orgSel === NONE ? null : orgSel,
        platform_id: platSel === NONE ? null : platSel,
        observacoes: obs.trim() || null,
        aliases: aliases.trim() || null,
      }, edit?.id)
      qc.invalidateQueries({ queryKey: ['crm', 'artists'] })
      onOpenChange(false)
      onSaved?.(edit?.id ?? null)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? 'Editar atração' : 'Nova atração'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome</Label>
            <Input value={nome} autoFocus onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nomes alternativos (busca)</Label>
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Ex.: Gustavo Lima, Gusttavo" />
            <p className="text-xs text-muted-foreground">Separe por vírgula. Também usados para detectar esta atração nos eventos capturados.</p></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Segmento Padrão</Label>
              <Select value={segmentoSel} onValueChange={setSegmentoSel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(segmentos.data ?? []).map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Gênero</Label>
              <Select value={generoId} onValueChange={setGeneroId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(generos.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Classe</Label>
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {ARTIST_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Segmento Padrão é usado para classificar automaticamente eventos desta atração.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Organização</Label>
              <Select value={orgSel} onValueChange={setOrgSel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(orgs.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Plataforma</Label>
              <Select value={platSel} onValueChange={setPlatSel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(platforms.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1"><Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter className="sm:justify-between">
          {edit ? (
            <DeleteEntityButton
              title="Remover atração?"
              description={`"${edit.nome}" sairá das listagens. Pode ser desfeito em Comercial → Logs.`}
              onDelete={() => deleteArtist(edit.id)}
              onDeleted={() => { qc.invalidateQueries({ queryKey: ['crm', 'artists'] }); onOpenChange(false) }}
              label="Remover"
            />
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!nome.trim() || saving}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
