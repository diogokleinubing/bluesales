import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useProjetos } from '../store'
import type { Pessoa } from '../types'
import { PageShell } from '../components/Shell'
import { PessoaAvatar } from '../components/bits'

const SEM = '__none__'

export function Pessoas() {
  const store = useProjetos()
  const { pessoas, areas, acoes, tarefas } = store

  // Quantos itens cada pessoa é responsável (ações + tarefas).
  const carga = useMemo(() => {
    const m = new Map<string, { acoes: number; tarefas: number }>()
    const bump = (id: string | null, k: 'acoes' | 'tarefas') => {
      if (!id) return
      const cur = m.get(id) ?? { acoes: 0, tarefas: 0 }
      cur[k]++
      m.set(id, cur)
    }
    for (const a of acoes) bump(a.responsavelId, 'acoes')
    for (const t of tarefas) bump(t.responsavelId, 'tarefas')
    return m
  }, [acoes, tarefas])

  function excluir(p: Pessoa) {
    const c = carga.get(p.id)
    const total = (c?.acoes ?? 0) + (c?.tarefas ?? 0)
    const msg = total > 0
      ? `Excluir "${p.nome}"? ${total} ${total === 1 ? 'item ficará' : 'itens ficarão'} sem responsável.`
      : `Excluir "${p.nome}"?`
    if (confirm(msg)) store.removePessoa(p.id)
  }

  return (
    <PageShell
      title="Pessoas"
      count={`${pessoas.length}`}
      actions={
        <Button size="sm" className="h-8 gap-1.5" onClick={() => store.addPessoa({ nome: 'Nova pessoa', areaId: null })}>
          <Plus className="size-4" /> Nova pessoa
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pessoa</TableHead>
            <TableHead className="w-[110px]">Você</TableHead>
            <TableHead className="w-[220px]">Área</TableHead>
            <TableHead className="w-[120px]">Ações</TableHead>
            <TableHead className="w-[120px]">Tarefas</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pessoas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                Nenhuma pessoa — crie a primeira.
              </TableCell>
            </TableRow>
          ) : (
            pessoas.map((p) => {
              const c = carga.get(p.id)
              const isMe = store.currentPessoaId === p.id
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PessoaAvatar nome={p.nome} />
                      <Input
                        value={p.nome}
                        onChange={(e) => store.updatePessoa(p.id, { nome: e.target.value })}
                        className="h-8 max-w-[360px] border-0 bg-transparent px-1 font-medium shadow-none focus-visible:bg-card focus-visible:ring-1"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => store.setCurrentPessoa(isMe ? null : p.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        isMe ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary',
                      )}
                      title={isMe ? 'Você (clique para desmarcar)' : 'Marcar como você'}
                    >
                      {isMe ? 'Você' : 'Sou eu'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Select value={p.areaId ?? SEM} onValueChange={(v) => store.updatePessoa(p.id, { areaId: v === SEM ? null : v })}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM}>Sem área</SelectItem>
                        {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c?.acoes ?? 0}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c?.tarefas ?? 0}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => excluir(p)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      title="Excluir pessoa"
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
