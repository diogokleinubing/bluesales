import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useOpportunities } from '../hooks/useOpportunities'
import { useFunnel } from '../hooks/useFunnelStages'
import { NovaOportunidadeDialog } from '../components/NovaOportunidadeDialog'
import { ListView, TOOLBAR_TRIGGER } from '../components/ListView'
import { fmtBRL } from '@/lib/format'

const ALL = '__all__'

export function Oportunidades() {
  const navigate = useNavigate()
  const { data, isLoading } = useOpportunities()
  const { stages } = useFunnel('oportunidade')
  const [stageF, setStageF] = useState(ALL)
  const [open, setOpen] = useState(false)

  const rows = useMemo(
    () => (data ?? []).filter((o) => stageF === ALL || o.stage_id === stageF),
    [data, stageF],
  )

  return (
    <>
      <ListView
        title="Oportunidades"
        count={data ? String(data.length) : undefined}
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova oportunidade</Button>}
        footer={data ? `${rows.length} de ${data.length}` : undefined}
        toolbar={
          <Select value={stageF} onValueChange={setStageF}>
            <SelectTrigger className={`${TOOLBAR_TRIGGER} w-56`} size="sm"><SelectValue placeholder="Estágio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os estágios</SelectItem>
              {stages.filter((s) => s.ativo).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Título</TableHead><TableHead>Organização</TableHead><TableHead>Estágio</TableHead>
            <TableHead className="text-right">GMV est.</TableHead>
            <TableHead>Responsável</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma oportunidade.</TableCell></TableRow>
            ) : rows.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/comercial/oportunidades/${o.id}`)}>
                <TableCell className="font-medium">{o.titulo}</TableCell>
                <TableCell>{o.orgNome ?? '—'}</TableCell>
                <TableCell>
                  {o.stageNome ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: o.stageCor ?? 'var(--muted-foreground)' }} />
                      {o.stageNome}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.gmv_estimado != null ? fmtBRL(o.gmv_estimado) : '—'}</TableCell>
                <TableCell>{o.ownerNome ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListView>
      <NovaOportunidadeDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
