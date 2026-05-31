import { useMemo } from 'react'
import { useTheme } from '@/lib/theme'

export interface ChartColors {
  /** Série categórica (chart-1..5). */
  series: string[]
  axis: string
  grid: string
  cursor: string
  tooltip: { backgroundColor: string; border: string; color: string }
  success: string
  destructive: string
  warning: string
  info: string
  primary: string
}

function readVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

/**
 * Lê as cores do tema atual a partir das CSS variables computadas.
 * Recalcula quando o tema muda (depende de resolvedTheme), pois o Recharts não
 * aceita classes Tailwind — precisamos das cores resolvidas.
 */
export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme()

  return useMemo<ChartColors>(() => {
    const series = [
      readVar('--chart-1', '#1a7fe8'),
      readVar('--chart-2', '#22c55e'),
      readVar('--chart-3', '#a78bfa'),
      readVar('--chart-4', '#f59e0b'),
      readVar('--chart-5', '#ef4444'),
    ]
    return {
      series,
      axis: readVar('--chart-axis', '#5a7290'),
      grid: readVar('--chart-grid', '#e2e8f0'),
      cursor: readVar('--chart-cursor', 'rgba(26,127,232,0.08)'),
      tooltip: {
        backgroundColor: readVar('--tooltip-bg', '#ffffff'),
        border: `1px solid ${readVar('--tooltip-border', '#d8e0ec')}`,
        color: readVar('--tooltip-fg', '#0f1c34'),
      },
      success: readVar('--success', '#16a34a'),
      destructive: readVar('--destructive', '#ef4444'),
      warning: readVar('--warning', '#d97706'),
      info: readVar('--info', '#7c5cf0'),
      primary: readVar('--primary', '#1a7fe8'),
    }
    // resolvedTheme garante recálculo quando o tema muda.
  }, [resolvedTheme])
}
