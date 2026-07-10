import { CircleMinus, CalendarCheck, AlertTriangle } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { acompEstado, type AcompEstado, type RelItem } from '../hooks/useRelacionamento'

type IconType = typeof CircleMinus

/** Ícone, rótulo e cor de cada estado de acompanhamento. */
export const ACOMP_META: Record<AcompEstado, { icon: IconType; label: string; color: string }> = {
  em_dia: { icon: CalendarCheck, label: 'Em dia', color: 'var(--success)' },
  atrasada: { icon: AlertTriangle, label: 'Atrasada', color: 'var(--destructive)' },
  sem_acao: { icon: AlertTriangle, label: 'Sem próxima ação', color: '#f59e0b' },
  fora: { icon: CircleMinus, label: 'Fora de trabalho', color: 'var(--muted-foreground)' },
}

/** Ordem de exibição nos chips de filtro (trabalho ativo primeiro). */
export const ACOMP_ORDER: AcompEstado[] = ['em_dia', 'atrasada', 'sem_acao', 'fora']

/** Texto do tooltip do ícone, com as datas relevantes. */
export function acompTooltip(item: RelItem): string {
  switch (acompEstado(item)) {
    case 'em_dia':
      return item.proximaAcaoAt ? `Em dia — próxima ação em ${fmtDate(item.proximaAcaoAt)}` : 'Em dia'
    case 'atrasada':
      return item.atrasadaDesde ? `Atrasada desde ${fmtDate(item.atrasadaDesde)}` : 'Atrasada'
    case 'sem_acao':
      return 'Em trabalho, sem próxima ação agendada'
    case 'fora':
      return 'Fora de trabalho ativo'
  }
}
