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
import {
  AXIS_COLOR,
  CHART_COLORS,
  GRID_COLOR,
  MONTH_LABELS,
  tooltipStyle,
} from './chart-theme'
import { fmtBRL, fmtShort } from '@/lib/format'

const axisProps = {
  stroke: AXIS_COLOR,
  tick: { fill: AXIS_COLOR, fontSize: 12 },
  tickLine: false,
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
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
          formatter={(value) => [fmtBRL(Number(value)), metricLabel]}
        />
        <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
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
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
          formatter={(value, name) => [
            fmtBRL(Number(value)),
            name === 'gmv' ? 'GMV' : 'Receita BT',
          ]}
        />
        <Legend
          formatter={(v) => (v === 'gmv' ? 'GMV' : 'Receita BT')}
          wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }}
        />
        <Bar dataKey="gmv" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="receitaBt"
          stroke={CHART_COLORS[1]}
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
            <Cell key={s.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, n) => {
            const v = Number(value)
            return [
              `${fmtBRL(v)} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`,
              n,
            ]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />
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
  const chartData = data.map((d) => ({ ...d, mes: MONTH_LABELS[d.month] }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [fmtBRL(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />
        {series.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
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
  const absoluteNames = new Set([data[0]?.name, data[data.length - 1]?.name])
  function colorFor(d: WaterfallDatum): string {
    if (absoluteNames.has(d.name)) return CHART_COLORS[0]
    return d.positive ? CHART_COLORS[1] : CHART_COLORS[4]
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => fmtShort(v)} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
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
  const chartData = data.map((d) => ({
    mes: MONTH_LABELS[d.month],
    growth: d.growth == null ? 0 : d.growth * 100,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} width={50} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Crescimento']}
        />
        <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell
              key={i}
              fill={d.growth >= 0 ? CHART_COLORS[1] : CHART_COLORS[4]}
            />
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
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtShort(v)} />
        <YAxis
          type="category"
          dataKey="label"
          {...axisProps}
          width={150}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
          formatter={(value, name) => [fmtBRL(Number(value)), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />
        <Bar dataKey="base" name={baseLabel} fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
        <Bar dataKey="target" name={targetLabel} fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
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
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
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
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(26,127,232,0.08)' }}
          formatter={(value) => fmtBRL(Number(value))}
        />
        <Bar
          dataKey="value"
          fill={CHART_COLORS[2]}
          radius={[0, 4, 4, 0]}
          cursor={onClickBar ? 'pointer' : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
