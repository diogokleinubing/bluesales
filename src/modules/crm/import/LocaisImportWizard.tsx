import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, Loader2, CheckCircle2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { readWorkbook } from '@/modules/bi/import/parse'
import type { ParsedWorkbook, SheetData } from '@/modules/bi/import/types'
import { useCrmOrgId } from '@/modules/crm/hooks/useFunnelStages'
import { useLocais, saveLocal } from '@/modules/crm/hooks/useCadastros'
import { usePlatforms, useLocalTipos } from '@/modules/crm/hooks/useConfigCadastros'

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Detecta as colunas pelos cabeçalhos da planilha (aba "Casas"). */
function mapearColunas(headers: string[]) {
  const find = (pred: (h: string) => boolean) => headers.findIndex((h) => pred(norm(h)))
  return {
    nome: find((h) => h.includes('nome')),
    cidade: find((h) => h.includes('cidade') || h.includes('munic')),
    uf: find((h) => h === 'uf' || h.includes('estado')),
    tipo: find((h) => h === 'tipo'),
    capacidade: find((h) => h.includes('assento') || h.includes('capacid') || h.includes('lota')),
    proprietario: find((h) => h.includes('propriet') || h.includes('gest')),
    site: find((h) => h.includes('site')),
    plataforma: find((h) => h.includes('situa') || h.includes('parceria')),
    observacoes: find((h) => h.includes('observ') || h === 'obs'),
  }
}

interface LinhaImport {
  idx: number
  nome: string
  cidade: string | null
  uf: string | null
  tipo_id: string | null
  tipo_nome: string | null
  capacidade: number | null
  site: string | null
  plataformaNome: string | null
  observacoes: string | null
  jaExiste: boolean
}

const cell = (row: unknown[], i: number): string => (i >= 0 && row[i] != null ? String(row[i]).trim() : '')

export function LocaisImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const existentes = useLocais()
  const platforms = usePlatforms()
  const tipos = useLocalTipos()

  const [wb, setWb] = useState<ParsedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [running, setRunning] = useState(false)
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null)
  const [feito, setFeito] = useState<{ inseridos: number; vinculadas: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const sheet: SheetData | null = useMemo(
    () => wb?.sheets.find((s) => s.name === sheetName) ?? null,
    [wb, sheetName],
  )

  // Nomes já cadastrados (para sinalizar duplicatas).
  const existentesByNome = useMemo(
    () => new Set((existentes.data ?? []).map((l) => norm(l.nome))),
    [existentes.data],
  )

  const tipoByNorm = useMemo(
    () => new Map((tipos.data ?? []).map((t) => [norm(t.nome), t])),
    [tipos.data],
  )

  const linhas: LinhaImport[] = useMemo(() => {
    if (!sheet) return []
    const m = mapearColunas(sheet.headers)
    const out: LinhaImport[] = []
    sheet.rows.forEach((row, idx) => {
      const nome = cell(row, m.nome)
      if (!nome) return
      const tm = tipoByNorm.get(norm(cell(row, m.tipo)))
      const capRaw = cell(row, m.capacidade).replace(/[^\d]/g, '')
      const prop = cell(row, m.proprietario)
      const obs = cell(row, m.observacoes)
      const observacoes = [prop ? `Proprietário/Gestão: ${prop}` : null, obs || null].filter(Boolean).join('\n') || null
      out.push({
        idx,
        nome,
        cidade: cell(row, m.cidade) || null,
        uf: (cell(row, m.uf) || null)?.toUpperCase().slice(0, 2) || null,
        tipo_id: tm?.id ?? null,
        tipo_nome: tm?.nome ?? null,
        capacidade: capRaw ? Number(capRaw) : null,
        site: cell(row, m.site) || null,
        plataformaNome: cell(row, m.plataforma) || null,
        observacoes,
        jaExiste: existentesByNome.has(norm(nome)),
      })
    })
    return out
  }, [sheet, existentesByNome, tipoByNorm])

  function aplicarSheet(w: ParsedWorkbook, nome: string) {
    setSheetName(nome)
    const s = w.sheets.find((x) => x.name === nome)
    if (!s) { setSel(new Set()); return }
    // Pré-seleciona linhas com nome e que ainda não existem.
    const m = mapearColunas(s.headers)
    const next = new Set<number>()
    s.rows.forEach((row, idx) => {
      const nm = cell(row, m.nome)
      if (nm && !existentesByNome.has(norm(nm))) next.add(idx)
    })
    setSel(next)
  }

  /** Escolhe automaticamente a aba que melhor casa com locais (nome + assentos/cidade). */
  function melhorSheet(w: ParsedWorkbook): string {
    let best = w.sheets[0]?.name ?? ''
    let bestScore = -1
    for (const s of w.sheets) {
      const m = mapearColunas(s.headers)
      const score = [m.nome, m.cidade, m.capacidade, m.plataforma].filter((i) => i >= 0).length
      if (score > bestScore) { bestScore = score; best = s.name }
    }
    return best
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null); setFeito(null)
    try {
      const parsed = await readWorkbook(file)
      setWb(parsed)
      aplicarSheet(parsed, melhorSheet(parsed))
    } catch (err) {
      setErro(`Não foi possível ler o arquivo: ${(err as Error).message}`)
    }
  }

  function toggle(idx: number) {
    setSel((s) => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }
  const todasMarcadas = linhas.length > 0 && linhas.every((l) => sel.has(l.idx))
  function toggleTodas() {
    setSel(todasMarcadas ? new Set() : new Set(linhas.map((l) => l.idx)))
  }

  function reset() {
    setWb(null); setSheetName(''); setSel(new Set()); setRunning(false)
    setProg(null); setFeito(null); setErro(null)
  }

  const platByNorm = useMemo(
    () => new Map((platforms.data ?? []).map((p) => [norm(p.nome), p.id])),
    [platforms.data],
  )

  async function importar() {
    if (!orgId) return
    const escolhidas = linhas.filter((l) => sel.has(l.idx))
    if (escolhidas.length === 0) { setErro('Selecione ao menos uma linha.'); return }
    setRunning(true); setErro(null); setProg({ n: 0, total: escolhidas.length })
    let inseridos = 0, vinculadas = 0
    try {
      for (let i = 0; i < escolhidas.length; i++) {
        const l = escolhidas[i]
        const id = await saveLocal(orgId, {
          nome: l.nome, cidade: l.cidade, uf: l.uf, capacidade: l.capacidade,
          tipo_id: l.tipo_id, observacoes: l.observacoes, site: l.site,
        })
        inseridos++
        const platId = l.plataformaNome ? platByNorm.get(norm(l.plataformaNome)) : undefined
        if (platId) {
          const { error } = await supabase.from('local_platforms')
            .insert({ org_id: orgId, local_id: id, platform_id: platId, tipo_relacao: null })
          if (!error) vinculadas++
        }
        setProg({ n: i + 1, total: escolhidas.length })
      }
      setFeito({ inseridos, vinculadas })
      qc.invalidateQueries({ queryKey: ['crm', 'locais'] })
      qc.invalidateQueries({ queryKey: ['crm', 'lookup', 'locais'] })
      toast.success('Importação concluída', { description: `${inseridos} locais, ${vinculadas} com plataforma.` })
    } catch (err) {
      setErro((err as Error).message)
    } finally { setRunning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="w-[95vw] max-w-[900px] sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Importar locais</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Planilha (.xlsx/.csv) com as casas. Marque as linhas a importar. Assentos = capacidade,
            Situação/Parceria = plataforma, Proprietário + Observações vão para Observações.
          </p>
        </DialogHeader>

        {feito ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="size-5" /> Importação concluída.</div>
            <ul className="text-sm text-muted-foreground">
              <li>Locais inseridos: <strong className="text-foreground">{feito.inseridos}</strong></li>
              <li>Com plataforma vinculada: <strong className="text-foreground">{feito.vinculadas}</strong></li>
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Importar outra</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <div>
              <input id="locais-file" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
              <label htmlFor="locais-file"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                <Upload className="size-4" /> {wb ? wb.fileName : 'Selecionar arquivo .xlsx ou .csv'}
              </label>
            </div>

            {wb && wb.sheets.length > 1 && (
              <div className="space-y-1">
                <Label>Planilha</Label>
                <Select value={sheetName} onValueChange={(v) => aplicarSheet(wb, v)}>
                  <SelectTrigger className="h-8 w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {wb.sheets.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {sheet && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{linhas.length} linha(s) válida(s) · {sel.size} selecionada(s)</span>
                </div>
                <div className="max-h-[50vh] min-w-0 overflow-auto rounded-md border border-border">
                  <Table className="w-full table-fixed">
                    <TableHeader><TableRow>
                      <TableHead className="w-9"><Checkbox checked={todasMarcadas} onCheckedChange={toggleTodas} /></TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-32">Cidade/UF</TableHead>
                      <TableHead className="w-20 text-right">Assentos</TableHead>
                      <TableHead className="w-24">Tipo</TableHead>
                      <TableHead className="w-36">Plataforma</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {linhas.map((l) => (
                        <TableRow key={l.idx} className="cursor-pointer" onClick={() => toggle(l.idx)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={sel.has(l.idx)} onCheckedChange={() => toggle(l.idx)} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="truncate" title={l.nome}>{l.nome}</span>
                              {l.jaExiste && <Badge variant="outline" className="shrink-0 text-xs text-amber-600">já existe</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="truncate text-muted-foreground">{[l.cidade, l.uf].filter(Boolean).join('/') || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.capacidade ?? '—'}</TableCell>
                          <TableCell className="truncate text-muted-foreground">{l.tipo_nome ?? '—'}</TableCell>
                          <TableCell className="truncate text-muted-foreground" title={l.plataformaNome ?? undefined}>{l.plataformaNome ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {erro && <p className="text-sm text-destructive">{erro}</p>}
            {prog && <p className="text-sm text-muted-foreground">Importando… {prog.n}/{prog.total}</p>}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Cancelar</Button>
              <Button onClick={importar} disabled={running || !orgId || sel.size === 0}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importar {sel.size > 0 ? `(${sel.size})` : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
