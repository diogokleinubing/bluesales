import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Barra flutuante para salvar alterações pendentes de segmento/gênero. */
export function PendingSaveBar({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  if (count <= 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
      <span className="text-sm text-muted-foreground">
        {count} {count === 1 ? 'alteração pendente' : 'alterações pendentes'}
      </span>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
        Descartar
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving}>
        <Save className="size-4" />
        {saving ? 'Salvando…' : 'Atualizar Segmento / Gênero'}
      </Button>
    </div>
  )
}
