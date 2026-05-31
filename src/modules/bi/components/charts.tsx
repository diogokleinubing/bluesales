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
