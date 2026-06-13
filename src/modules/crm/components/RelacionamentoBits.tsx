import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useFunnel, type FunnelStage } from '../hooks/useFunnelStages'
import { moveRelItemStage, updateRelClasse, type RelTipo } from '../hooks/useRelacionamento'
import { ClasseBadge } from './ClasseBadge'

export const CLASSES = ['A+', 'A', 'B', 'C'] as const
const NONE = '__none__'

/** Estilo do gatilho inline (parece um badge, mas é clicável). */
const INLINE_TRIGGER = 'h-7 w-auto gap-1 border-0 bg-transparent px-1.5 shadow-none hover:bg-accent focus:ring-0 [&>svg]:size-3 [&>svg]:opacity-40'

// Cores dos chips de classe quando selecionados (espelha o ClasseBadge).
const CLASSE_CHIP_ON: Record<string, string> = {
  'A+': 'border-transparent bg-[var(--success)] text-white',
  A: 'border-[var(--success)] bg-[var(--success)]/15 text-[var(--success)]',
  B: 'border-[var(--warning)] bg-[var(--warning)]/15 text-[var(--warning)]',
  C: 'border-destructive bg-destructive/15 text-destructive',
}
const CHIP_OFF = 'border-border text-muted-foreground hover:border-primary'

/** Chips multi-seleção de classe (A+/A/B/C). */
export function ClasseChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(c: string) {
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  }
  return (
    <div className="flex items-center gap-1">
      {CLASSES.map((c) => {
        const on = value.includes(c)
        return (
          <button key={c} type="button" onClick={() => toggle(c)}
            className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              on ? (CLASSE_CHIP_ON[c] ?? 'border-primary bg-primary text-primary-foreground') : CHIP_OFF)}>
            {c}
          </button>
        )
      })}
    </div>
  )
}

/** Badge inline de estágio (bolinha de cor + nome) para células de tabela. */
export function StageDot({ stage }: { stage?: { nome: string; cor: string | null } | null }) {
  if (!stage) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ backgroundColor: stage.cor ?? 'var(--muted-foreground)' }} />
      {stage.nome}
    </span>
  )
}

/** Mapa id→estágio do funil de relacionamento (cacheado). */
export function useRelStageMap(): Map<string, FunnelStage> {
  const { stages } = useFunnel('relacionamento')
  return useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/**
 * Abertura controlada que ignora o fechamento imediato — evita que o 2º clique
 * de um duplo-clique (hábito nas telas que editam a linha com duplo-clique)
 * feche/reselecione o dropdown logo após abrir.
 */
function useGuardedOpen() {
  const [open, setOpen] = useState(false)
  const openedAt = useRef(0)
  function onOpenChange(o: boolean) {
    if (o) { openedAt.current = Date.now(); setOpen(true) }
    else if (Date.now() - openedAt.current > 350) setOpen(false)
  }
  return { open, setOpen, onOpenChange }
}

/** Seletor de estágio inline (clica na célula, escolhe e salva). */
export function InlineStageSelect({ tipo, id, value }: { tipo: RelTipo; id: string; value: string | null }) {
  const qc = useQueryClient()
  const { stages } = useFunnel('relacionamento')
  const [saving, setSaving] = useState(false)
  const { open, setOpen, onOpenChange } = useGuardedOpen()
  const current = value ? stages.find((s) => s.id === value) ?? null : null
  const ativos = stages // mostra todos, inclusive inativos (ex.: "Inativo")
  async function change(v: string) {
    setOpen(false); setSaving(true)
    try {
      await moveRelItemStage(tipo, id, v === NONE ? null : v)
      qc.invalidateQueries({ queryKey: ['crm'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }
  return (
    <Select open={open} onOpenChange={onOpenChange} value={value ?? NONE} onValueChange={change} disabled={saving}>
      <SelectTrigger onClick={stop} onDoubleClick={stop} className={INLINE_TRIGGER}>
        <StageDot stage={current} />
      </SelectTrigger>
      <SelectContent position="popper" onClick={stop}>
        <SelectItem value={NONE}>— Sem estágio</SelectItem>
        {ativos.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.cor ?? 'var(--muted-foreground)' }} />
              {s.nome}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Seletor de classe inline (clica na célula, escolhe e salva). */
export function InlineClasseSelect({ tipo, id, value }: { tipo: RelTipo; id: string; value: string | null }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const { open, setOpen, onOpenChange } = useGuardedOpen()
  async function change(v: string) {
    setOpen(false); setSaving(true)
    try {
      await updateRelClasse(tipo, id, v === NONE ? null : v)
      qc.invalidateQueries({ queryKey: ['crm'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }
  return (
    <Select open={open} onOpenChange={onOpenChange} value={value ?? NONE} onValueChange={change} disabled={saving}>
      <SelectTrigger onClick={stop} onDoubleClick={stop} className={INLINE_TRIGGER}>
        <ClasseBadge classe={value} />
      </SelectTrigger>
      <SelectContent position="popper" onClick={stop}>
        <SelectItem value={NONE}>—</SelectItem>
        {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
