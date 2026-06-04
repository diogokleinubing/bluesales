import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import {
  useIgnoreRules, usePesquisaOrgId, addIgnoreRule, deleteIgnoreRule, toggleIgnoreRule,
  type IgnoreTipoRow,
} from '../hooks/usePesquisa'

const TIPOS: { value: IgnoreTipoRow; label: string }[] = [
  { value: 'nome_evento', label: 'Nome do evento' },
  { value: 'local', label: 'Local' },
  { value: 'organizador', label: 'Organizador' },
]

export function FiltrosConfig() {
  const qc = useQueryClient()
  const orgId = usePesquisaOrgId()
  const { profile } = useProfile()
  const editable = profile?.role === 'gestor'
  const { data, isLoading } = useIgnoreRules()

  const [tipo, setTipo] = useState<IgnoreTipoRow>('nome_evento')
  const [keyword, setKeyword] = useState('')

  const grupos = useMemo(() => {
    const m: Record<IgnoreTipoRow, typeof data> = { nome_evento: [], local: [], organizador: [] }
    for (const r of data ?? []) (m[r.tipo] ??= []).push(r)
    return m
  }, [data])

  async function adicionar() {
    if (!orgId || !keyword.trim()) return
    try {
      await addIgnoreRule(orgId, tipo, keyword)
      setKeyword('')
      qc.invalidateQueries({ queryKey: ['pesquisa', 'ignore-rules'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function remover(id: string) {
    try { await deleteIgnoreRule(id); qc.invalidateQueries({ queryKey: ['pesquisa', 'ignore-rules'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function toggle(id: string, ativo: boolean) {
    try { await toggleIgnoreRule(id, ativo); qc.invalidateQueries({ queryKey: ['pesquisa', 'ignore-rules'] }) }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Filtros de ignorar</h1>
        <p className="text-sm text-muted-foreground">
          Eventos online e gratuitos já são descartados na coleta. Aqui ficam palavras-chave que marcam eventos como ignorados.
        </p>
      </div>

      {editable && (
        <Card><CardContent className="flex flex-wrap items-end gap-2 pt-6">
          <div className="space-y-1">
            <Select value={tipo} onValueChange={(v) => setTipo(v as IgnoreTipoRow)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input className="w-[260px]" value={keyword} placeholder="palavra-chave…"
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
          <Button onClick={adicionar} disabled={!keyword.trim()}><Plus className="size-4" /> Adicionar</Button>
        </CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {TIPOS.map((t) => (
          <Card key={t.value}>
            <CardHeader><CardTitle className="text-base">{t.label}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {isLoading ? (
                <Skeleton className="h-6 w-full" />
              ) : (grupos[t.value] ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Nenhuma regra.</p>
              ) : (grupos[t.value] ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <span className={`text-sm ${r.ativo ? '' : 'text-muted-foreground line-through'}`}>{r.keyword}</span>
                  <div className="flex items-center gap-2">
                    <Switch checked={r.ativo} disabled={!editable} onCheckedChange={(v) => toggle(r.id, v)} />
                    {editable && (
                      <button onClick={() => remover(r.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
