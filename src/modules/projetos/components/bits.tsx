import { Compass, Hammer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS, TIPO_TAREFA, TRILHAS } from '../types'
import type { AcaoStatus, TarefaTipo, Trilha } from '../types'
import { iniciais } from '../lib/compute'

/** Pílula colorida da trilha (com bolinha na cor da trilha). */
export function TrilhaBadge({ trilha, className }: { trilha: Trilha; className?: string }) {
  const meta = TRILHAS[trilha]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ borderColor: `${meta.cor}55`, backgroundColor: `${meta.cor}18`, color: meta.cor }}
      title={meta.label}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.cor }} />
      {meta.label}
    </span>
  )
}

/** Bolinha + rótulo do status. */
export function StatusBadge({ status }: { status: AcaoStatus }) {
  const meta = STATUS[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2 rounded-full" style={{ backgroundColor: meta.cor }} />
      {meta.label}
    </span>
  )
}

/** Alterna o tipo da tarefa (execução ↔ descoberta) com ícone. */
export function TipoToggle({
  value,
  onChange,
  className,
}: {
  value: TarefaTipo
  onChange: (v: TarefaTipo) => void
  className?: string
}) {
  const isDesc = value === 'descoberta'
  const Icon = isDesc ? Compass : Hammer
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(isDesc ? 'execucao' : 'descoberta') }}
      title={`${TIPO_TAREFA[value].label} — clique para alternar`}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors',
        isDesc ? 'border-violet-400/50 bg-violet-400/10 text-violet-500' : 'border-border text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5" />
      {TIPO_TAREFA[value].label}
    </button>
  )
}

const AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#f97316']

function corDaPessoa(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Avatar circular com iniciais; vazio vira placeholder tracejado. */
export function PessoaAvatar({ nome, size = 20 }: { nome: string; size?: number }) {
  if (!nome) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        title="Sem responsável"
      >
        ?
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: corDaPessoa(nome) }}
      title={nome}
    >
      {iniciais(nome)}
    </span>
  )
}

/** Avatar + nome inline. */
export function PessoaChip({ nome }: { nome: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <PessoaAvatar nome={nome} />
      <span className={cn('truncate', !nome && 'text-muted-foreground')}>{nome || 'Sem responsável'}</span>
    </span>
  )
}
