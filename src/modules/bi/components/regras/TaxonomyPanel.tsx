import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { useRules } from '../../hooks/useRules'
import { fmtInt } from '@/lib/format'

interface Item {
  id: string
  nome: string
}

/**
 * CRUD genérico de taxonomia (Segmentos / Gêneros), com contagem de eventos
 * que usam cada valor no campo correspondente (`segmento` ou `genero`).
 */
export function TaxonomyPanel({
  kind,
}: {
  kind: 'segmento' | 'genero'
}) {
  const { rules, orgId } = useRules()
  const qc = useQueryClient()
  const [novo, setNovo] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  const table = kind === 'segmento' ? 'segments' : 'generos'
  const field = kind === 'segmento' ? 'segmento' : 'genero'
  const items: Item[] = kind === 'segmento' ? rules.segments : rules.generos
  const label = kind === 'segmento' ? 'Segmento' : 'Gênero'

  // Contagem de eventos por valor (no campo calculado).
  const countsQ = useQuery({
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryKey: ['rules', 'taxonomy-counts', kind, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(field)
        .eq('org_id', orgId!)
      if (error) throw new Error(error.message)
      const map = new Map<string, number>()
      for (const row of (data ?? []) as Record<string, string | null>[]) {
        const v = row[field]
        if (v) map.set(v, (map.get(v) ?? 0) + 1)
      }
      return map
    },
  })
  const counts = countsQ.data ?? new Map<string, number>()

  function refresh() {
    qc.invalidateQueries({ queryKey: ['rules'] })
  }

  async function add() {
    const nome = novo.trim()
    if (!orgId || !nome) return
    const { error } = await supabase.from(table).insert({ org_id: orgId, nome })
    if (error) return toast.error('Erro', { description: error.message })
    setNovo('')
    refresh()
  }

  async function rename(id: string) {
    const nome = editNome.trim()
    if (!nome) return
    const { error } = await supabase.from(table).update({ nome }).eq('id', id)
    if (error) return toast.error('Erro', { description: error.message })
    setEditId(null)
    refresh()
  }

  async function remove(item: Item) {
    if ((counts.get(item.nome) ?? 0) > 0) {
      toast.error('Em uso', {
        description: `"${item.nome}" está em eventos. Reclassifique antes de excluir.`,
      })
      return
    }
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) return toast.error('Erro', { description: error.message })
    refresh()
  }

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [items],
  )

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex gap-2 p-3">
          <Input
            placeholder={`Novo ${label.toLowerCase()}`}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className="max-w-xs"
          />
          <Button variant="secondary" onClick={add}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead className="text-right">Eventos</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                  Nenhum {label.toLowerCase()} cadastrado.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {editId === item.id ? (
                    <Input
                      className="h-8 max-w-xs"
                      value={editNome}
                      autoFocus
                      onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && rename(item.id)}
                    />
                  ) : (
                    item.nome
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">
                    {fmtInt(counts.get(item.nome) ?? 0)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {editId === item.id ? (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => rename(item.id)}>
                        <Check className="size-4 text-[var(--success)]" />
                      </button>
                      <button onClick={() => setEditId(null)}>
                        <X className="size-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditId(item.id)
                          setEditNome(item.nome)
                        }}
                      >
                        <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button onClick={() => remove(item)}>
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
