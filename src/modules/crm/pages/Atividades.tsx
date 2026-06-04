import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ActivityDialog } from '../components/ActivityDialog'
import type { ActivityTipo } from '../hooks/useActivities'

const TIPOS: ActivityTipo[] = ['Reunião', 'Ligação', 'Email', 'WhatsApp', 'Nota', 'Tarefa', 'Outro']
const ALL = '__all__'

export function Atividades() {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<string>(ALL)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atividades</h1>
          <p className="text-sm text-muted-foreground">Reuniões, ligações, e-mails e notas.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Registrar atividade</Button>
      </div>
      <Card><CardContent className="p-3">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-44" size="sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <ActivityTimeline filter={tipo === ALL ? {} : { tipo: tipo as ActivityTipo }} showOrg />
      </CardContent></Card>
      <ActivityDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
