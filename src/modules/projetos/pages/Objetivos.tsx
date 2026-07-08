import { useMemo } from 'react'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProjetos } from '../store'
import { TRILHAS } from '../types'
import type { Objetivo } from '../types'
import { PageShell } from '../components/Shell'

export function Objetivos() {
  const store = useProjetos()
  const { objetivos, areas, acoes } = store

  const ordenados = useMemo(
    () => [...objetivos].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'empresa' ? -1 : 1)),
    [objetivos],
  )
  const countAcoes = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acoes) if (a.objetivoId) m.set(a.objetivoId, (m.get(a.objetivoId) ?? 0) + 1)
    return m
  }, [acoes])

  function novo() {
    store.addObjetivo({ nome: 'Novo objetivo', tipo: 'empresa', areaId: null })
  }
  function setTipo(o: Objetivo, tipo: 'empresa' | 'area') {
    store.updateObjetivo(o.id, {
      tipo,
      areaId: tipo === 'area' ? o.areaId ?? areas[0]?.id ?? null : null,
    })
  }
  function excluir(o: Objetivo) {
    const n = countAcoes.get(o.id) ?? 0
    const msg = n > 0
      ? `Excluir "${o.nome}"? ${n} ${n === 1 ? 'ação vinculada voltará' : 'ações vinculadas voltarão'} a ser "Avulso".`
      : `Excluir "${o.nome}"?`
    if (confirm(msg)) store.removeObjetivo(o.id)
  }

  return (
    <PageShell
      title="Objetivos"
      count={`${objetivos.length}`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { if (confirm('Apagar TODOS os dados do módulo Projetos (objetivos, ações, tarefas, áreas e pessoas)? Esta ação não pode ser desfeita.')) store.resetSeed() }}
            title="Apagar todos os dados do módulo"
          >
            <RotateCcw className="size-4" /> Limpar tudo
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={novo}>
            <Plus className="size-4" /> Novo objetivo
          </Button>
        </>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Objetivo</TableHead>
            <TableHead className="w-[160px]">Tipo</TableHead>
            <TableHead className="w-[200px]">Área</TableHead>
            <TableHead className="w-[120px]">Ações vinculadas</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenados.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                Nenhum objetivo — crie o primeiro.
              </TableCell>
            </TableRow>
          ) : (
            ordenados.map((o) => {
              const cor = o.tipo === 'empresa' ? TRILHAS.estrategico.cor : TRILHAS.area.cor
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
                      <Input
                        value={o.nome}
                        onChange={(e) => store.updateObjetivo(o.id, { nome: e.target.value })}
                        className="h-8 max-w-[420px] border-0 bg-transparent px-1 font-medium shadow-none focus-visible:bg-card focus-visible:ring-1"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={o.tipo} onValueChange={(v) => setTipo(o, v as 'empresa' | 'area')}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empresa">Estratégico</SelectItem>
                        <SelectItem value="area">De área</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {o.tipo === 'area' ? (
                      <Select value={o.areaId ?? ''} onValueChange={(v) => store.updateObjetivo(o.id, { areaId: v })}>
                        <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Escolha a área" /></SelectTrigger>
                        <SelectContent>
                          {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{countAcoes.get(o.id) ?? 0}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => excluir(o)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      title="Excluir objetivo"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </PageShell>
  )
}
