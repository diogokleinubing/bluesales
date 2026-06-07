import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Copia a URL do evento para a área de transferência (sem navegar) — assim o
 * Blueticket nunca aparece no referer dos acessos às plataformas concorrentes.
 */
export function CopyUrlButton({ url, label }: { url: string; label?: string }) {
  const [done, setDone] = useState(false)

  async function copy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setDone(true)
      toast.success('URL copiada')
      setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-muted-foreground hover:text-foreground"
      title="Copiar URL do evento"
      onClick={copy}
    >
      {done ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />}
      {label ? <span className="ml-1.5">{label}</span> : null}
    </Button>
  )
}
