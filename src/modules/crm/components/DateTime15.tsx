import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS = ['00', '15', '30', '45']

/** Arredonda "mm" (0-59) para o múltiplo de 15 mais próximo (string 2 dígitos). */
function snapMin(mm: string): string {
  const n = Number(mm)
  if (!Number.isFinite(n)) return '00'
  const r = Math.min(45, Math.round(n / 15) * 15)
  return String(r).padStart(2, '0')
}

/**
 * Seleção de data + hora com minutos restritos a 00/15/30/45 (o input nativo
 * datetime-local não permite limitar as opções do spinner de minutos).
 * `value`/`onChange` usam o formato "YYYY-MM-DDTHH:mm".
 */
export function DateTime15({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const [datePart = '', timePart = ''] = value.split('T')
  const hh = HORAS.includes(timePart.slice(0, 2)) ? timePart.slice(0, 2) : '09'
  const mm = snapMin(timePart.slice(3, 5) || '00')

  const emit = (d: string, h: string, m: string) => onChange(`${d}T${h}:${m}`)

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Input
        type="date"
        value={datePart}
        onChange={(e) => emit(e.target.value, hh, mm)}
        className="h-9 w-fit"
      />
      <Select value={hh} onValueChange={(h) => emit(datePart, h, mm)}>
        <SelectTrigger className="h-9 w-[68px]" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {HORAS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={mm} onValueChange={(m) => emit(datePart, hh, m)}>
        <SelectTrigger className="h-9 w-[68px]" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MINUTOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
