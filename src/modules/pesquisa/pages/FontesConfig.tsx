import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Play, Pencil, Loader2, RefreshCw, BarChart3, Timer, Square, FastForward, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fmtDate, fmtInt } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import {
  useCrawlerSources, useSourceCounts, useSourceFutureCounts, setSourceAtivo, saveSourceConfig, resetSourceScan, runCrawler,
  fetchSourceProgresso,
  type CrawlerSource, type Progresso,
} from '../hooks/usePesquisa'
import { RelatorioFonteDialog } from '../components/RelatorioFonteDialog'
import { ExecucoesTabela } from '../components/ExecucoesTabela'

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
  const counts = useSourceCounts()
  const futureCounts = useSourceFutureCounts()

  const [running, setRunning] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [report, setReport] = useState<CrawlerSource | null>(null)
  const [edit, setEdit] = useState<CrawlerSource | null>(null)
  const [cidadesTxt, setCidadesTxt] = useState('')
  // Faixa de IDs do Bileto (só p/ essa fonte): subir a partir de / descer até.
  const [biletoAlto, setBiletoAlto] = useState('')
  const [biletoMin, setBiletoMin] = useState('')

  // Lote: roda N ciclos em sequência com intervalo (loop no front, interrompível).
  const [batch, setBatch] = useState<{ slug: string; nome: string; total: number; done: number; intervalSec: number; running: boolean; reprocessar: boolean } | null>(null)
  const batchStop = useRef(false)
  const [loteCfg, setLoteCfg] = useState<CrawlerSource | null>(null)
  const [ciclos, setCiclos] = useState('20')
  const [intervalo, setIntervalo] = useState('60')
  const [reprocLote, setReprocLote] = useState(false)

  // Para o lote ao sair da tela.
  useEffect(() => () => { batchStop.current = true }, [])

  async function cicloLote(slug: string, total: number, intervalSec: number, done: number, reprocessar: boolean) {
    if (batchStop.current || done >= total) { setBatch((b) => (b ? { ...b, running: false } : null)); return }
    try { await runCrawler(slug, { reprocessar }) } catch { /* segue para o próximo ciclo */ }
    const novoDone = done + 1
    setBatch((b) => (b ? { ...b, done: novoDone } : null))
    setTimeout(() => qc.invalidateQueries({ queryKey: ['pesquisa'] }), 4000)
    if (batchStop.current || novoDone >= total) { setBatch((b) => (b ? { ...b, running: false } : null)); return }
    window.setTimeout(() => cicloLote(slug, total, intervalSec, novoDone, reprocessar), intervalSec * 1000)
  }

  function iniciarLote() {
    if (!loteCfg) return
    const total = Math.max(1, Math.floor(Number(ciclos) || 1))
    const intervalSec = Math.max(5, Math.floor(Number(intervalo) || 60))
    const { slug, nome } = loteCfg
    const reprocessar = reprocLote
    setLoteCfg(null)
    batchStop.current = false
    setBatch({ slug, nome, total, done: 0, intervalSec, running: true, reprocessar })
    void cicloLote(slug, total, intervalSec, 0, reprocessar)
  }

  function pararLote() {
    batchStop.current = true
    setBatch((b) => (b ? { ...b, running: false } : null))
    toast('Lote interrompido', { description: 'Para após o ciclo atual.' })
  }

  // Varredura completa: roda em ciclos (modo normal) até fechar uma volta
  // (config.progresso.voltou), detectando o fim de cada run pelo progresso.em.
  const [varredura, setVarredura] = useState<{ slug: string; nome: string; ciclo: number } | null>(null)
  const varreduraStop = useRef(false)
  useEffect(() => () => { varreduraStop.current = true }, [])
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  async function cicloVarredura(s: CrawlerSource, ciclo: number, emAntes: string, zeros = 0) {
    if (varreduraStop.current) { setVarredura(null); return }
    setVarredura({ slug: s.slug, nome: s.nome, ciclo })
    try { await runCrawler(s.slug) } catch { /* segue */ }
    // Espera a run terminar: progresso.em muda (até 5 min de tolerância).
    const t0 = Date.now()
    let prog: Progresso | null = null
    while (Date.now() - t0 < 300_000) {
      await sleep(5000)
      if (varreduraStop.current) { setVarredura(null); return }
      prog = await fetchSourceProgresso(s.id)
      if (prog && prog.em !== emAntes) break
    }
    qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
    qc.invalidateQueries({ queryKey: ['pesquisa', 'runs'] })
    if (!prog || prog.em === emAntes) {
      setVarredura(null); toast('Varredura parada', { description: `${s.nome}: sem resposta no tempo limite.` }); return
    }
    if (prog.voltou) {
      setVarredura(null); toast.success('Varredura completa', { description: `${s.nome} — volta fechada em ${ciclo} ciclo(s).` }); return
    }
    // Encerra também quando não captura novos por 3 ciclos seguidos — evita
    // rodar sem fim em fontes cuja detecção de "volta" (pager) é imprecisa.
    const zerosN = prog.novos === 0 ? zeros + 1 : 0
    if (zerosN >= 3) {
      setVarredura(null); toast.success('Varredura completa', { description: `${s.nome} — catálogo coberto (sem novos há 3 ciclos).` }); return
    }
    if (ciclo >= 100) {
      setVarredura(null); toast('Varredura parada', { description: `${s.nome}: limite de 100 ciclos.` }); return
    }
    void cicloVarredura(s, ciclo + 1, prog.em, zerosN)
  }

  async function iniciarVarredura(s: CrawlerSource) {
    varreduraStop.current = false
    const emAntes = (await fetchSourceProgresso(s.id))?.em ?? ''
    void cicloVarredura(s, 1, emAntes, 0)
  }
  function pararVarredura() {
    varreduraStop.current = true
    setVarredura(null)
    toast('Varredura interrompida', { description: 'Para após o ciclo atual.' })
  }
  const varreduraAtivo = !!varredura

  // Executar tudo: roda 1 ciclo de cada fonte ativa, em sequência (espera uma
  // terminar p/ ir à próxima), pausável. Cada fonte é uma invocação separada
  // (curta) — evita o timeout de rodar todas numa só chamada.
  const [tudo, setTudo] = useState<{ idx: number; total: number; nome: string; ciclo: number } | null>(null)
  const tudoStop = useRef(false)
  useEffect(() => () => { tudoStop.current = true }, [])

  // Ao terminar qualquer varredura, atualiza a agregação de locais (materialized
  // view) em background, para os novos eventos aparecerem sem esperar o cron.
  const sweepingRef = useRef(false)
  useEffect(() => {
    if (varredura || tudo) { sweepingRef.current = true; return }
    if (sweepingRef.current) {
      sweepingRef.current = false
      void supabase.rpc('refresh_pesquisa_locais_agg').then(() => {}, () => {})
    }
  }, [varredura, tudo])

  async function iniciarTudo() {
    const fontes = (data ?? []).filter((s) => s.ativo)
    if (!fontes.length) return
    tudoStop.current = false
    for (let i = 0; i < fontes.length; i++) {
      if (tudoStop.current) break
      const s = fontes[i]
      // Roda esta fonte em CICLOS até FECHAR a volta (varredura completa); só
      // então passa pra próxima. Tetos: 200 ciclos e 5 min de espera por ciclo.
      let zeros = 0
      for (let ciclo = 1; ciclo <= 200 && !tudoStop.current; ciclo++) {
        setTudo({ idx: i + 1, total: fontes.length, nome: s.nome, ciclo })
        const emAntes = (await fetchSourceProgresso(s.id))?.em ?? ''
        try { await runCrawler(s.slug) } catch { /* segue */ }
        // Espera a run terminar: progresso.em muda (até 5 min de tolerância).
        const t0 = Date.now()
        let prog: Progresso | null = null
        while (Date.now() - t0 < 300_000) {
          await sleep(5000)
          if (tudoStop.current) break
          prog = await fetchSourceProgresso(s.id)
          if (prog && prog.em !== emAntes) break
        }
        qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
        qc.invalidateQueries({ queryKey: ['pesquisa', 'runs'] })
        if (!prog || prog.em === emAntes) break // sem resposta -> próxima fonte
        if (prog.voltou) break // volta completa -> próxima fonte
        zeros = prog.novos === 0 ? zeros + 1 : 0
        if (zeros >= 3) break // sem novos há 3 ciclos -> catálogo coberto
      }
    }
    const parado = tudoStop.current
    setTudo(null)
    if (parado) toast('Execução interrompida', { description: 'Parou após o ciclo atual.' })
    else toast.success('Execução concluída', { description: `Todas as ${fontes.length} fonte(s) varridas.` })
  }
  function pararTudo() {
    tudoStop.current = true
    toast('Parando…', { description: 'Encerra após a fonte atual.' })
  }
  const tudoAtivo = !!tudo

  const batchAtivo = !!batch?.running
  const loopAtivo = batchAtivo || varreduraAtivo || tudoAtivo

  async function executar(slug?: string, reprocessar = false) {
    setRunning((reprocessar ? 'rp:' : '') + (slug ?? '__all__'))
    try {
      await runCrawler(slug, { reprocessar })
      toast.success(reprocessar ? 'Reprocessamento iniciado' : 'Coleta iniciada', {
        description: 'Roda em segundo plano. Acompanhe em Execuções.',
      })
      // Dá um tempo e atualiza as listas (a coleta termina em segundo plano).
      setTimeout(() => qc.invalidateQueries({ queryKey: ['pesquisa'] }), 4000)
    } catch (e) {
      toast.error('Falha ao iniciar', { description: (e as Error).message })
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
    setCidadesTxt(cidadesToText(s))
    const cfg = (s.config ?? {}) as Record<string, unknown>
    setBiletoAlto(s.slug === 'bileto' ? String(cfg.id_alto ?? cfg.id_topo ?? '') : '')
    setBiletoMin(s.slug === 'bileto' ? String(cfg.id_min ?? '') : '')
  }

  async function reiniciarVarredura() {
    if (!edit) return
    try {
      await resetSourceScan(edit)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
      toast.success('Varredura reiniciada', { description: 'Próxima coleta começa do início.' })
      setEdit(null)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  async function salvar() {
    if (!edit) return
    try {
      const patch: Record<string, unknown> = { cidades: parseCidades(cidadesTxt) }
      if (edit.slug === 'bileto') {
        const alto = Math.floor(Number(biletoAlto))
        const min = Math.floor(Number(biletoMin))
        if (biletoAlto.trim() && Number.isFinite(alto) && alto > 0) {
          // "Subir a partir de N": a frente começa em N (id_alto = N-1).
          patch.id_alto = alto - 1
          const topoAtual = Number((edit.config as Record<string, unknown>)?.id_topo ?? 0)
          patch.id_topo = Math.max(alto, topoAtual)
        }
        if (biletoMin.trim() && Number.isFinite(min) && min > 0) patch.id_min = min
      }
      await saveSourceConfig(edit, patch)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'sources'] })
      setEdit(null)
    } catch (e) { toast.error('Erro', { description: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
          <p className="text-sm text-muted-foreground">Plataformas monitoradas pela coleta.</p>
        </div>
        {editable && (
          tudoAtivo ? (
            <Button variant="destructive" onClick={pararTudo}>
              <Square className="size-4" /> Parar ({tudo!.idx}/{tudo!.total})
            </Button>
          ) : (
            <Button onClick={iniciarTudo} disabled={running !== null || batchAtivo || varreduraAtivo}>
              <Play className="size-4" /> Executar tudo
            </Button>
          )
        )}
      </div>

      {batch && (
        <Card><CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-sm">
            {batch.running && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <span className="font-medium">Lote · {batch.nome}</span>
            <span className="text-muted-foreground">
              ciclo {batch.done}/{batch.total}
              {batch.running ? ` · intervalo ${batch.intervalSec}s` : ' · finalizado'}
            </span>
          </div>
          {batch.running ? (
            <Button size="sm" variant="destructive" onClick={pararLote}><Square className="size-4" /> Parar</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setBatch(null)}>Fechar</Button>
          )}
        </CardContent></Card>
      )}

      {varredura && (
        <Card><CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="font-medium">Varredura completa · {varredura.nome}</span>
            <span className="text-muted-foreground">ciclo {varredura.ciclo} · rodando até fechar a volta</span>
          </div>
          <Button size="sm" variant="destructive" onClick={pararVarredura}><Square className="size-4" /> Parar</Button>
        </CardContent></Card>
      )}

      {tudo && (
        <Card><CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="font-medium">Executar tudo · fonte {tudo.idx}/{tudo.total}</span>
            <span className="text-muted-foreground">varrendo {tudo.nome} · ciclo {tudo.ciclo} (até fechar a volta)</span>
          </div>
          <Button size="sm" variant="destructive" onClick={pararTudo}><Square className="size-4" /> Parar</Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Fonte</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Cidades</TableHead>            <TableHead>Última execução</TableHead>
            <TableHead className="text-right">Eventos</TableHead>
            <TableHead className="text-right">Eventos Futuros</TableHead>
            <TableHead className="w-[160px]">Varredura</TableHead>
            <TableHead>Ativa</TableHead>
            {editable && <TableHead className="w-32" />}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : (data ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell><Badge variant="outline">{METODO_LABEL[s.metodo] ?? s.metodo}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{s.config?.cidades?.length ? s.config.cidades.length : 'todas'}</TableCell>                <TableCell className="whitespace-nowrap text-muted-foreground">{s.ultima_execucao ? fmtDate(s.ultima_execucao) : 'nunca'}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(counts.data?.[s.id] ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(futureCounts.data?.[s.id] ?? 0)}</TableCell>
                <TableCell><ProgressoCell p={s.config?.progresso} /></TableCell>
                <TableCell>
                  <Switch checked={s.ativo} disabled={!editable} onCheckedChange={() => toggle(s)} />
                </TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Relatório"
                        onClick={() => setReport(s)}>
                        <BarChart3 className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Executar agora (1 ciclo)"
                        disabled={running !== null || loopAtivo} onClick={() => executar(s.slug)}>
                        {running === s.slug ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2"
                        title="Varredura completa (roda em ciclos até cobrir o site inteiro)"
                        disabled={running !== null || batchAtivo || tudoAtivo || (varreduraAtivo && varredura?.slug !== s.slug)}
                        onClick={() => varredura?.slug === s.slug ? pararVarredura() : iniciarVarredura(s)}>
                        {varredura?.slug === s.slug ? <Loader2 className="size-4 animate-spin" /> : <FastForward className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Rodar em lote (vários ciclos com intervalo)"
                        disabled={running !== null || loopAtivo} onClick={() => { setCiclos('20'); setIntervalo('60'); setLoteCfg(s) }}>
                        <Timer className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Reprocessar (atualiza os já coletados)"
                        disabled={running !== null || loopAtivo} onClick={() => executar(s.slug, true)}>
                        {running === `rp:${s.slug}` ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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
            {!isLoading && (data ?? []).length > 0 && (
              <TableRow className="border-t-2 font-medium">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt((data ?? []).reduce((s, x) => s + (counts.data?.[x.id] ?? 0), 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt((data ?? []).reduce((s, x) => s + (futureCounts.data?.[x.id] ?? 0), 0))}
                </TableCell>
                <TableCell />
                <TableCell />
                {editable && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>

      <div className="flex items-center justify-between gap-2 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Execuções recentes</h2>
        <Button variant="outline" size="sm" disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            try { await qc.refetchQueries({ queryKey: ['pesquisa', 'runs'] }) }
            finally { setRefreshing(false) }
          }}>
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>
      <ExecucoesTabela limit={50} />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.nome} — coleta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cidades (uma por linha: <code>Cidade;UF</code>)</Label>
              <Textarea rows={8} value={cidadesTxt} onChange={(e) => setCidadesTxt(e.target.value)}
                placeholder={'Florianópolis;SC\nSão Paulo;SP'} />
            </div>
            {edit?.slug === 'bileto' && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Faixa de IDs (Bileto)</p>
                <p className="text-xs text-muted-foreground">
                  A coleta normal <b>sobe</b> (descobre novos); o <b>reprocessar desce</b> até o mínimo.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Subir a partir de</Label>
                    <Input type="number" min={1} value={biletoAlto} onChange={(e) => setBiletoAlto(e.target.value)}
                      placeholder="ex.: 121000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descer até (mínimo)</Label>
                    <Input type="number" min={1} value={biletoMin} onChange={(e) => setBiletoMin(e.target.value)}
                      placeholder="ex.: 100000" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Topo atual (cresce sozinho com os novos): {String((edit.config as Record<string, unknown>)?.id_topo ?? '—')}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Reiniciar varredura</p>
                  <p className="text-xs text-muted-foreground">Volta o offset/cursor ao início. Não apaga nada — recoleta do começo (pula os que já existem).</p>
                </div>
                <Button variant="outline" size="sm" onClick={reiniciarVarredura}>Reiniciar</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RelatorioFonteDialog source={report} onOpenChange={(o) => !o && setReport(null)} />

      <Dialog open={!!loteCfg} onOpenChange={(o) => !o && setLoteCfg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{loteCfg?.nome} — rodar em lote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Número de ciclos</Label>
              <Input type="number" min={1} value={ciclos} onChange={(e) => setCiclos(e.target.value)} />
              <p className="text-xs text-muted-foreground">Cada ciclo dispara uma coleta e avança a varredura (Sympla ~150 itens/ciclo; Bileto/Ingresse/Disk conforme o <code>scan</code>).</p>
            </div>
            <div className="space-y-1">
              <Label>Intervalo entre ciclos (segundos)</Label>
              <Input type="number" min={5} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
              <p className="text-xs text-muted-foreground">Espaça as requisições para não sobrecarregar o IP. Mantenha a aba aberta; dá para interromper a qualquer momento.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={reprocLote} onCheckedChange={(v) => setReprocLote(v === true)} className="mt-0.5" />
              <span className="text-sm">
                Reprocessar (atualizar já cadastrados)
                <span className="block text-xs text-muted-foreground">
                  Revisita eventos já capturados e atualiza preço/dados, em vez de só pegar novos.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLoteCfg(null)}>Cancelar</Button>
            <Button onClick={iniciarLote}>Iniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Célula de progresso de varredura: barra (quando há total) ou status textual. */
function ProgressoCell({ p }: { p?: Progresso | null }) {
  if (!p) return <span className="text-xs text-muted-foreground">—</span>
  const { pos, total, passo, voltou, voltas, novos } = p
  // Acabou de fechar uma volta -> mostra "volta completa" (antes da barra, senão
  // a barra reseta pra ~0% e parece que recomeçou).
  if (voltou) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]" title={voltas ? `${voltas} volta(s) completas` : ''}>
        <CheckCircle2 className="size-3.5" /> volta completa
      </span>
    )
  }
  if (total && total > 0 && pos != null) {
    const pct = Math.max(0, Math.min(100, Math.round((pos / total) * 100)))
    const rest = passo && passo > 0 && pos < total ? Math.ceil((total - pos) / passo) : null
    return (
      <div className="min-w-[120px]" title={`posição ${pos}/${total}${voltas ? ` · ${voltas} volta(s) completas` : ''}`}>
        <div className="h-1.5 overflow-hidden rounded bg-muted">
          <div className="h-full rounded bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {voltas ? `${voltas}ª volta · ` : ''}{pct}%{rest != null ? ` · ~${rest} exec.` : ''}
        </div>
      </div>
    )
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {novos > 0 ? `capturando · ${novos} novos` : 'sem novos'}{voltas ? ` · ${voltas}ª volta` : ''}
    </span>
  )
}
