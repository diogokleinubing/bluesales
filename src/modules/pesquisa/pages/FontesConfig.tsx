import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Play, Pencil, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fmtDate } from '@/lib/format'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import {
  useCrawlerSources, setSourceAtivo, saveSourceConfig, runCrawler,
  type CrawlerSource,
} from '../hooks/usePesquisa'

const METODO_LABEL: Record<string, string> = {
  edge_api: 'API (JSON)',
  edge_html: 'HTML (scraping)',
  worker: 'Worker',
}

function cidadesToText(s: CrawlerSource): string {
  return (s.config?.cidades ?? []).map((c) => `${c.cidade};${c.uf}`).join('\n')
}
function parseCidades(text: string): { cidade: string; uf: string }[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [cidade, uf] = l.split(';').map((p) => p.trim())
    return { cidade, uf: (uf ?? '').toUpperCase() }
  }).filter((c) => c.cidade && c.uf)
}

export function FontesConfig() {
  const qc = useQueryClient()
  const { profile } = useProfile()
  const editable = profile?.role === 'gestor'
  const { data, isLoading } = useCrawlerSources()

  const [running, setRunning] = useState<string | null>(null)
  const [edit, setEdit] = useState<CrawlerSource | null>(null)
  const [janela, setJanela] = useState('90')
  const [cidadesTxt, setCidadesTxt] = useState('')

  async function executar(slug?: string) {
    setRunning(slug ?? '__all__')
    try {
      const r = await runCrawler(slug) as { resumo?: { fonte: string; novos: number; vistos: number }[] }
      const total = (r.resumo ?? []).reduce((s, x) => s + (x.novos ?? 0), 0)
      qc.invalidateQueries({ queryKey: ['pesquisa'] })
      toast.success('Coleta concluída', { description: `${total} novo(s) evento(s).` })
    } catch (e) {
      toast.error('Falha na coleta', { description: (e as Error).message })
    } finally { setRunning(null) }
  }

  async function toggle(s: CrawlerSource) {
    try {
      await setSourceAtivo(s.id, !s.ativo)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  function openEdit(s: CrawlerSource) {
    setEdit(s)
    setJanela(String(s.config?.janela_dias ?? 90))
    setCidadesTxt(cidadesToText(s))
  }

  async function salvar() {
    if (!edit) return
    try {
      await saveSourceConfig(edit.id, {
        janela_dias: Number(janela) || 90,
        cidades: parseCidades(cidadesTxt),
      })
      qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
      setEdit(null)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fontes</h1>
          <p className="text-sm text-muted-foreground">Plataformas monitoradas pela coleta automática semanal.</p>
        </div>
        {editable && (
          <Button onClick={() => executar()} disabled={running !== null}>
            {running === '__all__' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Executar tudo
          </Button>
        )}
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Fonte</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Cidades</TableHead>
            <TableHead>Janela</TableHead>
            <TableHead>Última execução</TableHead>
            <TableHead>Ativa</TableHead>
            {editable && <TableHead className="w-28" />}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (data ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell><Badge variant="outline">{METODO_LABEL[s.metodo] ?? s.metodo}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{s.config?.cidades?.length ? s.config.cidades.length : 'todas'}</TableCell>
                <TableCell className="text-muted-foreground">{s.config?.janela_dias ?? 90} dias</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{s.ultima_execucao ? fmtDate(s.ultima_execucao) : 'nunca'}</TableCell>
                <TableCell>
                  <Switch checked={s.ativo} disabled={!editable} onCheckedChange={() => toggle(s)} />
                </TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Executar agora"
                        disabled={running !== null} onClick={() => executar(s.slug)}>
                        {running === s.slug ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar cidades/janela"
                        onClick={() => openEdit(s)}>
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.nome} — coleta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Janela (dias à frente)</Label>
              <Input type="number" value={janela} onChange={(e) => setJanela(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Cidades (uma por linha: <code>Cidade;UF</code>)</Label>
              <Textarea rows={8} value={cidadesTxt} onChange={(e) => setCidadesTxt(e.target.value)}
                placeholder={'Florianópolis;SC\nSão Paulo;SP'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
