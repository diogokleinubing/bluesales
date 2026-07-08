import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProjetos } from '../store'
import type { Area } from '../types'
import { PageShell } from '../components/Shell'

export function Areas() {
  const store = useProjetos()
  const { areas, acoes, pessoas } = store

  const countAcoes = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acoes) if (a.areaId) m.set(a.areaId, (m.get(a.areaId) ?? 0) + 1)
    return m
  }, [acoes])
  const countPessoas = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pessoas) if (p.areaId) m.set(p.areaId, (m.get(p.areaId) ?? 0) + 1)
    return m
  }, [pessoas])

  function excluir(a: Area) {
    const n = countAcoes.get(a.id) ?? 0
    const msg = n > 0
      ? `Excluir a área "${a.nome}"? ${n} ${n === 1 ? 'ação vinculada ficará' : 'ações vinculadas ficarão'} sem área.`
      : `Excluir a área "${a.nome}"?`
    if (confirm(msg)) store.removeArea(a.id)
  }

  return (
    <PageShell
      title="Áreas"
      count={`${areas.length}`}
      actions={
        <Button size="sm" className="h-8 gap-1.5" onClick={() => store.addArea({ nome: 'Nova área' })}>
          <Plus className="size-4" /> Nova área
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Área</TableHead>
            <TableHead className="w-[140px]">Ações</TableHead>
            <TableHead className="w-[140px]">Pessoas</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {areas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                Nenhuma área — crie a primeira.
              </TableCell>
            </TableRow>
          ) : (
            areas.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Input
                    value={a.nome}
                    onChange={(e) => store.updateArea(a.id, { nome: e.target.value })}
                    className="h-8 max-w-[420px] border-0 bg-transparent px-1 font-medium shadow-none focus-visible:bg-card focus-visible:ring-1"
                  />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{countAcoes.get(a.id) ?? 0}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{countPessoas.get(a.id) ?? 0}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => excluir(a)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    title="Excluir área"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </PageShell>
  )
}
