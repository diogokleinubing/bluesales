import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ClassSelect } from './ClassSelect'
import type { KeywordRuleInput } from '../../lib/rules-api'
import { norm } from '../../lib/classify'
import { cn } from '@/lib/utils'
import { useCrmOrgId } from '@/modules/crm/hooks/useFunnelStages'
import { useGeneroOptions } from '@/modules/crm/hooks/useCrmLookups'
import {
  useArtists, saveArtist, ARTIST_CLASSES, type ArtistClasse,
} from '@/modules/crm/hooks/useCadastros'

/** Sugere um termo a partir do nome do evento (remove o ano e separadores finais). */
function suggestTerm(nome: string | null): string {
  return (nome ?? '')
    .replace(/\b20(2\d|30)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s|\-–—/]+$/, '')
    .trim()
}

/**
 * Converte um evento em: uma REGRA de termo no nome, OU uma ATRAÇÃO (cadastro
 * rápido: nome + segmento + gênero + classe, sem abrir o cadastro completo).
 */
export function ConvertToRuleDialog({
  event,
  segNames,
  genNames,
  onClose,
  onSave,
}: {
  event: { codigo: string; nome: string | null }
  segNames: string[]
  genNames: string[]
  onClose: () => void
  onSave: (rule: KeywordRuleInput) => Promise<void>
}) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { data: artists } = useArtists()
  const generos = useGeneroOptions()

  // null = ainda escolhendo (mostra os cards); depois mostra o formulário.
  const [tipo, setTipo] = useState<'termo' | 'atracao' | null>(null)
  const [termo, setTermo] = useState(suggestTerm(event.nome))
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)
  const [classe, setClasse] = useState<string | null>(null)
  const [ignorarComAno, setIgnorarComAno] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSaveTermo() {
    if (!termo.trim() || (!segmento && !genero)) {
      toast.error('Informe o termo e ao menos segmento ou gênero.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        keyword: termo.trim(),
        segmento,
        genero,
        ordem: 0,
        ignorar_com_ano: ignorarComAno,
      })
    } finally {
      setSaving(false)
    }
  }

  // Cadastro rápido de atração (sem abrir o dialog completo).
  async function handleSaveAtracao() {
    if (!orgId || !termo.trim()) return
    const alvo = norm(termo)
    const dup = (artists ?? []).find((a) => norm(a.nome) === alvo)
    if (dup) {
      toast.error('Atração já cadastrada', { description: `Já existe "${dup.nome}".` })
      return
    }
    setSaving(true)
    try {
      const genero_id = genero
        ? (generos.data ?? []).find((g) => norm(g.nome) === norm(genero))?.id ?? null
        : null
      await saveArtist(orgId, {
        nome: termo.trim(),
        segmento,
        genero_id,
        classificacao: classe ? (classe as ArtistClasse) : null,
      })
      qc.invalidateQueries({ queryKey: ['crm', 'artists'] })
      toast.success('Atração cadastrada', {
        description: 'Rode "Reclassificar eventos" para aplicar à base.',
      })
      onClose()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Converter evento</DialogTitle>
          <DialogDescription className="truncate">
            {event.nome ?? event.codigo}
          </DialogDescription>
        </DialogHeader>

        {tipo === null ? (
          // Passo 1: escolher o tipo (cards).
          <div className="grid grid-cols-2 gap-3 py-1">
            <button
              type="button"
              onClick={() => setTipo('termo')}
              className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <div className="font-medium">Termo</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cria uma regra que classifica eventos cujo nome contém este termo.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTipo('atracao')}
              className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <div className="font-medium">Atração</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cadastra uma atração (artista) que classifica os eventos onde o nome aparece.
              </p>
            </button>
          </div>
        ) : (
          // Passo 2: formulário do tipo escolhido.
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="conv-termo">
                  {tipo === 'termo' ? 'Termo no nome do evento' : 'Nome da atração'}
                </Label>
                <Input
                  id="conv-termo"
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={tipo === 'termo' ? 'ex.: Prime Rock Brasil' : 'ex.: Maiara e Maraisa'}
                />
              </div>

              <div className={cn('grid gap-3', tipo === 'atracao' ? 'grid-cols-3' : 'grid-cols-2')}>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Segmento</Label>
                  <ClassSelect value={segmento} options={segNames} onChange={setSegmento} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Gênero</Label>
                  <ClassSelect value={genero} options={genNames} onChange={setGenero} />
                </div>
                {tipo === 'atracao' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Classe</Label>
                    <ClassSelect value={classe} options={[...ARTIST_CLASSES]} onChange={setClasse} />
                  </div>
                )}
              </div>

              {tipo === 'termo' ? (
                <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={ignorarComAno}
                    onCheckedChange={(v) => setIgnorarComAno(v === true)}
                  />
                  Segmento só sem ano (não aplica o segmento se o nome tiver ano)
                </Label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Cadastra a atração com esses dados. Depois rode “Reclassificar eventos” para
                  aplicar à base.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setTipo(null)} disabled={saving}>
                Voltar
              </Button>
              {tipo === 'termo' ? (
                <Button onClick={handleSaveTermo} disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar regra'}
                </Button>
              ) : (
                <Button onClick={handleSaveAtracao} disabled={saving || !termo.trim()}>
                  {saving ? 'Cadastrando…' : 'Cadastrar atração'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
