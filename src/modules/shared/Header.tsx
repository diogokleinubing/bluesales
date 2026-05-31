import { useEffect, useMemo } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { useControls } from './controls-context'
import { useDataset } from '@/modules/bi/lib/dataset'
import { availableYears } from '@/modules/bi/lib/aggregate'
import {
  ALL_PDV,
  CURRENT_YEAR,
  DATE_BASE_LABELS,
  METRIC_LABELS,
  PDV_LABELS,
  type DateBase,
  type Metric,
  type Pdv,
} from '@/modules/bi/lib/controls'

export function Header() {
  const { user, signOut } = useAuth()
  const { year, metric, dateBase, pdv, setControls } = useControls()
  const { sales } = useDataset()

  // Anos reais da base (conforme a base de data). Fallback: ano atual.
  const years = useMemo(() => {
    const ys = availableYears(sales, dateBase)
    return ys.length ? ys : [CURRENT_YEAR]
  }, [sales, dateBase])

  // Corrige o ano selecionado se ele não existir mais na base.
  useEffect(() => {
    if (years.length && !years.includes(year)) {
      setControls({ year: years[0] })
    }
  }, [years, year, setControls])

  function togglePdv(value: Pdv, checked: boolean) {
    const next = checked
      ? [...new Set([...pdv, value])]
      : pdv.filter((p) => p !== value)
    // Garante ao menos um PDV selecionado.
    setControls({ pdv: next.length > 0 ? next : pdv })
  }

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-card/40 px-6 py-3">
      <ControlBlock label="Ano">
        <Select
          value={String(year)}
          onValueChange={(v) => setControls({ year: Number(v) })}
        >
          <SelectTrigger className="h-8 w-24" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ControlBlock>

      <ControlBlock label="Métrica">
        <Select
          value={metric}
          onValueChange={(v) => setControls({ metric: v as Metric })}
        >
          <SelectTrigger className="h-8 w-44" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(METRIC_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ControlBlock>

      <ControlBlock label="Base de data">
        <Select
          value={dateBase}
          onValueChange={(v) => setControls({ dateBase: v as DateBase })}
        >
          <SelectTrigger className="h-8 w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DATE_BASE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ControlBlock>

      <ControlBlock label="PDV">
        <div className="flex items-center gap-3">
          {ALL_PDV.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={pdv.includes(p)}
                onCheckedChange={(c) => togglePdv(p, c === true)}
              />
              {PDV_LABELS[p]}
            </label>
          ))}
        </div>
      </ControlBlock>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {user?.email}
        </span>
        <Button variant="ghost" size="icon" onClick={() => signOut()}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  )
}

function ControlBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
