import { useState } from 'react'
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

/** Sugere um termo a partir do nome do evento (remove o ano e separadores finais). */
function suggestTerm(nome: string | null): string {
  return (nome ?? '')
    .replace(/\b20(2\d|30)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s|\-–—/]+$/, '')
    .trim()
}

/**
 * Converte um evento em uma regra de termo no nome. Pré-preenche o termo (sem o
 * ano), e ao salvar cria a regra e reclassifica o evento.
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
  const [termo, setTermo] = useState(suggestTerm(event.nome))
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)
  const [ignorarComAno, setIgnorarComAno] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Converter em regra</DialogTitle>
          <DialogDescription className="truncate">
            {event.nome ?? event.codigo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conv-termo">Termo no nome do evento</Label>
            <Input
              id="conv-termo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="ex.: Prime Rock Brasil"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Segmento</Label>
              <ClassSelect value={segmento} options={segNames} onChange={setSegmento} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Gênero</Label>
              <ClassSelect value={genero} options={genNames} onChange={setGenero} />
            </div>
          </div>
          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={ignorarComAno}
              onCheckedChange={(v) => setIgnorarComAno(v === true)}
            />
            Segmento só sem ano (não aplica o segmento se o nome tiver ano)
          </Label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
