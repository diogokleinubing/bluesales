import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { readWorkbook } from '@/modules/bi/import/parse'
import type { ParsedWorkbook, SheetData, ColumnMap, ImportProgress } from '@/modules/bi/import/types'
import { useCrmOrgId, useFunnel } from '@/modules/crm/hooks/useFunnelStages'
import { ORG_FIELDS, type OrgField } from './orgTypes'
import { autoMapOrgs, buildOrgRows, runOrgImport, type OrgImportResult } from './orgImport'

const NONE = -1
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function OrgImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const rel = useFunnel('relacionamento')
  const inativo = useMemo(
    () => (rel.stages ?? []).find((s) => norm(s.nome) === 'inativo') ?? null,
    [rel.stages],
  )

  const [wb, setWb] = useState<ParsedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>('')
  const [map, setMap] = useState<ColumnMap<OrgField>>({} as ColumnMap<OrgField>)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<OrgImportResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const sheet: SheetData | null = useMemo(
    () => wb?.sheets.find((s) => s.name === sheetName) ?? null,
    [wb, sheetName],
  )

  function reset() {
    setWb(null); setSheetName(''); setMap({} as ColumnMap<OrgField>)
    setRunning(false); setProgress(null); setResult(null); setErro(null)
  }

  function aplicarSheet(w: ParsedWorkbook, nome: string) {
    const s = w.sheets.find((x) => x.name === nome)
    setSheetName(nome)
    setMap(s ? autoMapOrgs(s.headers) : ({} as ColumnMap<OrgField>))
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null); setResult(null)
    try {
      const parsed = await readWorkbook(file)
      setWb(parsed)
      aplicarSheet(parsed, parsed.sheets[0]?.name ?? '')
    } catch (err) {
      setErro(`Não foi possível ler o arquivo: ${(err as Error).message}`)
    }
  }

  const headers = sheet?.headers ?? []
  const podeImportar = !!orgId && !!sheet && !!inativo
    && map.blueticket_code >= 0 && map.nome >= 0 && !running

  async function importar() {
    if (!orgId || !sheet || !inativo) return
    setRunning(true); setErro(null); setProgress(null)
    try {
      const { rows, ignoradas } = buildOrgRows(sheet, map)
      if (rows.length === 0) { setErro('Nenhuma linha válida (verifique Código e Nome).'); setRunning(false); return }
      const r = await runOrgImport(orgId, rows, inativo.id, setProgress)
      setResult(r)
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      toast.success('Importação concluída', {
        description: `${r.inseridos} novas, ${r.atualizados} atualizadas${ignoradas ? `, ${ignoradas} ignoradas` : ''}.`,
      })
    } catch (err) {
      setErro((err as Error).message)
    } finally { setRunning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="w-[95vw] max-w-[760px] sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Importar organizações</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Planilha (.xlsx/.csv) da base Blueticket. Casa por <strong>Código</strong>; novas entram no estágio <strong>Inativo</strong>.
          </p>
        </DialogHeader>

        {!inativo && rel.stages && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Não encontrei o estágio <strong>"Inativo"</strong> no funil de relacionamento. Crie-o antes de importar.
          </div>
        )}

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="size-5" /> Importação concluída.</div>
            <ul className="text-sm text-muted-foreground">
              <li>Novas organizações: <strong className="text-foreground">{result.inseridos}</strong></li>
              <li>Atualizadas: <strong className="text-foreground">{result.atualizados}</strong></li>
              <li>Sub-organizações vinculadas à principal: <strong className="text-foreground">{result.vinculadas}</strong></li>
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { reset() }}>Importar outra</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <input id="org-file" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
              <label htmlFor="org-file"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                <Upload className="size-4" /> {wb ? wb.fileName : 'Selecionar arquivo .xlsx ou .csv'}
              </label>
            </div>

            {wb && wb.sheets.length > 1 && (
              <div className="space-y-1">
                <Label>Planilha</Label>
                <Select value={sheetName} onValueChange={(v) => aplicarSheet(wb, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {wb.sheets.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {sheet && (
              <div className="space-y-2">
                <Label>Mapeamento de colunas</Label>
                <div className="grid max-h-[40vh] grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
                  {ORG_FIELDS.map((f) => (
                    <div key={f.field} className="flex items-center gap-2">
                      <span className="w-44 shrink-0 text-sm">
                        {f.label}{f.required && <span className="text-destructive"> *</span>}
                      </span>
                      <Select
                        value={String(map[f.field] ?? NONE)}
                        onValueChange={(v) => setMap((m) => ({ ...m, [f.field]: Number(v) }))}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">—</SelectItem>
                          {headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>{h || `(coluna ${i + 1})`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{sheet.rows.length} linhas no arquivo.</p>
              </div>
            )}

            {erro && <p className="text-sm text-destructive">{erro}</p>}
            {progress && (
              <p className="text-sm text-muted-foreground">{progress.phase}… {progress.current}/{progress.total}</p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Cancelar</Button>
              <Button onClick={importar} disabled={!podeImportar}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
