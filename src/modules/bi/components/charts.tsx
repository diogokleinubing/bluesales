import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MONTH_LABELS } from './chart-theme'
import { useChartColors, type ChartColors } from './useChartColors'
import { fmtBRL, fmtShort } from '@/lib/format'

/** Props de eixo derivadas das cores do tema atual. */
function useAxis(c: ChartColors) {
  return {
    stroke: c.axis,
    tick: { fill: c.axis, fontSize: 12 },
    tickLine: false,
  }
}

interface MonthlyDatum {
  month: number
  value: number
}

/** Barras mensais da métrica selecionada. */
export function MonthlyBarChart({
  data,
  metricLabel,
}: {
  data: MonthlyDatum[]
  metricLabel: string
}) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(value) => [fmtBRL(Number(value)), metricLabel]}
        />
        <Bar dataKey="value" fill={c.series[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface ComboDatum {
  month: number
  gmv: number
  receitaBt: number
}

/** GMV (barras) + Receita BT (linha) por mês. */
export function GmvReceitaCombo({ data }: { data: ComboDatum[] }) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(value, name) => [
            fmtBRL(Number(value)),
            name === 'gmv' ? 'GMV' : 'Receita BT',
          ]}
        />
        <Legend
          formatter={(v) => (v === 'gmv' ? 'GMV' : 'Receita BT')}
          wrapperStyle={{ fontSize: 12, color: c.axis }}
        />
        <Bar dataKey="gmv" fill={c.series[0]} radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="receitaBt"
          stroke={c.series[1]}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

interface Slice {
  key: string
  label: string
  value: number
}

/** Doughnut de composição. */
export function CompositionDonut({ data }: { data: Slice[] }) {
  const c = useChartColors()
  const total = data.reduce((a, b) => a + b.value, 0)
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {data.map((s, i) => (
            <Cell key={s.key} fill={c.series[i % c.series.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={c.tooltip}
          formatter={(value, n) => {
            const v = Number(value)
            return [
              `${fmtBRL(v)} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`,
              n,
            ]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Múltiplas linhas por mês (ex.: evolução por segmento). */
export function MultiLineChart({
  data,
  series,
}: {
  data: Array<Record<string, number>>
  series: string[]
}) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={c.tooltip}
          formatter={(value, name) => [fmtBRL(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
        {series.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            stroke={c.series[i % c.series.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

interface RankDatum {
  label: string
  value: number
}

interface WaterfallDatum {
  name: string
  offset: number
  height: number
  positive: boolean
  value: number
}

/** Gráfico waterfall (offset transparente + barra colorida empilhada). */
export function WaterfallChart({ data }: { data: WaterfallDatum[] }) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  const absoluteNames = new Set([data[0]?.name, data[data.length - 1]?.name])
  function colorFor(d: WaterfallDatum): string {
    if (absoluteNames.has(d.name)) return c.series[0]
    return d.positive ? c.series[1] : c.series[4]
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(_value, _name, item) => {
            const p = (item?.payload ?? {}) as WaterfallDatum
            return [fmtBRL(p.value), p.name]
          }}
        />
        <Bar dataKey="offset" stackId="w" fill="transparent" />
        <Bar dataKey="height" stackId="w" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Barras de crescimento % por mês (verde positivo, vermelho negativo). */
export function GrowthBars({
  data,
}: {
  data: Array<{ month: number; growth: number | null }>
}) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  const chartData = data.map((d) => ({
    mes: MONTH_LABELS[d.month],
    growth: d.growth == null ? 0 : d.growth * 100,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} width={50} />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Crescimento']}
        />
        <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.growth >= 0 ? c.success : c.destructive} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Comparativo agrupado (ano-alvo vs ano-base) por categoria. */
export function ComparisonBars({
  data,
  targetLabel,
  baseLabel,
  onClickBar,
}: {
  data: Array<{ label: string; target: number; base: number }>
  targetLabel: string
  baseLabel: string
  onClickBar?: (label: string) => void
}) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        onClick={(state) => {
          const label = (state as { activeLabel?: string })?.activeLabel
          if (onClickBar && label) onClickBar(label)
        }}
      >
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtShort(v)} />
        <YAxis
          type="category"
          dataKey="label"
          {...axisProps}
          width={150}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(value, name) => [fmtBRL(Number(value)), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
        <Bar dataKey="base" name={baseLabel} fill={c.series[3]} radius={[0, 4, 4, 0]} />
        <Bar dataKey="target" name={targetLabel} fill={c.series[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Barras horizontais para rankings (top eventos, organizadores, etc.). */
export function HorizontalRankBar({
  data,
  onClickBar,
  height = 320,
}: {
  data: RankDatum[]
  onClickBar?: (label: string) => void
  height?: number
}) {
  const c = useChartColors()
  const axisProps = useAxis(c)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        onClick={(state) => {
          const label = (state as { activeLabel?: string })?.activeLabel
          if (onClickBar && label) onClickBar(label)
        }}
      >
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtShort(v)} />
        <YAxis
          type="category"
          dataKey="label"
          {...axisProps}
          width={150}
          tickFormatter={(v: string) =>
            v.length > 22 ? `${v.slice(0, 21)}…` : v
          }
        />
        <Tooltip
          contentStyle={c.tooltip}
          cursor={{ fill: c.cursor }}
          formatter={(value) => fmtBRL(Number(value))}
        />
        <Bar
          dataKey="value"
          fill={c.series[2]}
          radius={[0, 4, 4, 0]}
          cursor={onClickBar ? 'pointer' : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
