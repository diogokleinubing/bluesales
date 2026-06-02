import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

/** Checkbox "comparar com ano anterior" usado nas telas de Análises. */
export function CompareToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      Comparar com ano anterior (até o último mês com vendas)
    </Label>
  )
}
