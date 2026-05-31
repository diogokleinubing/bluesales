import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDefaultOrg } from '@/lib/org'
import { fmtInt } from '@/lib/format'
import {
  autoMapEvents,
  autoMapSales,
  columnsFingerprint,
  readWorkbook,
} from './parse'
import { detectSheetType, type SheetType } from './detect'
import {
  buildRecords,
  runImport,
  type EventSheetInput,
  type SaleSheetInput,
} from './import'
import { reclassifyEvents } from '../lib/rules-api'
import { loadMapping, loadType, saveMapping, saveType } from './mapping-cache'
import {
  EVENT_FIELDS,
  SALE_FIELDS,
  type ColumnMap,
  type EventField,
  type ImportMode,
  type ImportProgress,
  type SaleField,
  type SheetData,
} from './types'

type Step = 'upload' | 'configure' | 'running' | 'done'
type Choice = 'eventos' | 'vendas' | 'ignorar'

interface SheetEntry {
  id: string
  fileName: string
  sheet: SheetData
  detected: SheetType
  choice: Choice
  eventsMap: ColumnMap<EventField>
  salesMap: ColumnMap<SaleField>
}

const NONE = '__none__'

function initialChoice(detected: SheetType, cached: SheetType | null): Choice {
  const t = cached ?? detected
  return t === 'desconhecido' ? 'ignorar' : t
}

function makeEntry(fileName: string, sheet: SheetData, index: number): SheetEntry {
  const detected = detectSheetType(sheet.headers)
  const fp = columnsFingerprint(sheet.headers)
  const cachedType = loadType(fp)
  return {
    id: `${fileName}::${sheet.name}::${index}`,
    fileName,
    sheet,
    detected,
    choice: initialChoice(detected, cachedType),
    eventsMap:
      (loadMapping(fp, 'events') as ColumnMap<EventField>) ??
      autoMapEvents(sheet.headers),
    salesMap:
      (loadMapping(fp, 'sales') as ColumnMap<SaleField>) ??
      autoMapSales(sheet.headers),
  }
}

export function ImportWizard() {
  const org = useDefaultOrg()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [entries, setEntries] = useState<SheetEntry[]>([])
  const [fileNames, setFileNames] = useState<string[]>([])
  const [mode, setMode] = useState<ImportMode>('merge')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<{
    events: number
    sales: number
    skipped: number
    years: number[]
    orphanSales: number
    backfilled: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    try {
      const arr = Array.from(files)
      const newEntries: SheetEntry[] = []
      for (const file of arr) {
        const parsed = await readWorkbook(file)
        parsed.sheets.forEach((sheet, i) => {
          if (sheet.headers.length === 0 || sheet.rows.length === 0) return
          newEntries.push(makeEntry(parsed.fileName, sheet, i))
        })
      }
      if (newEntries.length === 0) {
        setError('Nenhuma planilha com dados encontrada nos arquivos.')
        return
      }
      setEntries((prev) => [...prev, ...newEntries])
      setFileNames((prev) => [...new Set([...prev, ...arr.map((f) => f.name)])])
      setStep('configure')
    } catch (e) {
      setError(`Não foi possível ler o arquivo: ${(e as Error).message}`)
    }
  }

  function setChoice(id: string, choice: Choice) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, choice } : e)),
    )
  }

  function setEntryMap(id: string, choice: Choice, field: string, idx: number) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        if (choice === 'eventos')
          return { ...e, eventsMap: { ...e.eventsMap, [field]: idx } as ColumnMap<EventField> }
        return { ...e, salesMap: { ...e.salesMap, [field]: idx } as ColumnMap<SaleField> }
      }),
    )
  }

  const active = entries.filter((e) => e.choice !== 'ignorar')

  const missingRequired = useMemo(() => {
    const miss: string[] = []
    for (const e of active) {
      const map = e.choice === 'eventos' ? e.eventsMap : e.salesMap
      if ((map.codigo_evento ?? -1) < 0)
        miss.push(`${e.sheet.name}: Código do evento`)
    }
    return miss
  }, [active])

  async function handleRun() {
    if (!org.data) {
      setError('Organização não carregada.')
      return
    }
    if (active.length === 0) {
      setError('Selecione ao menos uma planilha (Eventos ou Vendas).')
      return
    }
    setStep('running')
    setError(null)
    setProgress({ phase: 'Lendo planilhas', current: 0, total: 1 })
    try {
      const eventSheets: EventSheetInput[] = []
      const saleSheets: SaleSheetInput[] = []
      for (const e of active) {
        const fp = columnsFingerprint(e.sheet.headers)
        if (e.choice === 'eventos') {
          saveMapping(fp, 'events', e.eventsMap)
          saveType(fp, 'eventos')
          eventSheets.push({ sheet: e.sheet, map: e.eventsMap })
        } else {
          saveMapping(fp, 'sales', e.salesMap)
          saveType(fp, 'vendas')
          saleSheets.push({ sheet: e.sheet, map: e.salesMap })
        }
      }

      const build = buildRecords(org.data.id, eventSheets, saleSheets)
      const res = await runImport({
        orgId: org.data.id,
        fileName: fileNames.join(', '),
        build,
        mode,
        onProgress: setProgress,
      })

      // O consolidador (rollup) já é atualizado de forma incremental dentro
      // do runImport. Reclassifica só se vieram eventos.
      if (res.hadEvents) {
        setProgress({ phase: 'Classificando segmentos', current: 0, total: 1 })
        await reclassifyEvents(org.data.id)
      }

      setResult({
        events: res.eventsUpserted,
        sales: res.salesInserted,
        skipped: build.skippedSales,
        years: build.years,
        orphanSales: res.orphanSales,
        backfilled: res.backfilled,
      })
      await queryClient.invalidateQueries()
      setStep('done')
      toast.success('Importação concluída', {
        description: `${fmtInt(res.salesInserted)} vendas e ${fmtInt(
          res.eventsUpserted,
        )} eventos.`,
      })
    } catch (e) {
      setError((e as Error).message)
      setStep('configure')
      toast.error('Falha na importação', { description: (e as Error).message })
    }
  }

  function reset() {
    setEntries([])
    setFileNames([])
    setResult(null)
    setError(null)
    setProgress(null)
    setStep('upload')
  }

  // --- UPLOAD ---------------------------------------------------------------
  if (step === 'upload') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova base</CardTitle>
          <CardDescription>
            Envie um ou mais arquivos Excel (.xlsx) ou CSV (.csv). Cada arquivo
            pode conter só eventos, só vendas, ou as duas — o tipo é detectado
            pelas colunas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
            }}
            className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 py-12 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Upload className="size-8" />
            <span className="text-sm">
              Clique ou arraste arquivos <strong>.xlsx</strong> ou{' '}
              <strong>.csv</strong> aqui
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
            }}
          />
          {error && (
            <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // --- RUNNING --------------------------------------------------------------
  if (step === 'running') {
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importando…</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{progress?.phase}</span>
            <span>
              {fmtInt(progress?.current)} / {fmtInt(progress?.total)}
            </span>
          </div>
          <ProgressBar pct={pct} />
        </CardContent>
      </Card>
    )
  }

  // --- DONE -----------------------------------------------------------------
  if (step === 'done' && result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-5 text-[var(--success)]" />
            Importação concluída
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Eventos" value={result.events} />
            <Stat label="Vendas" value={result.sales} />
            <Stat label="Ignoradas" value={result.skipped} />
            <Stat label="Anos" value={result.years.join(', ') || '—'} />
          </div>
          {result.orphanSales > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]">
              <Info className="mt-0.5 size-4 shrink-0" />
              {fmtInt(result.orphanSales)} vendas referenciam eventos ainda não
              importados. Elas foram gravadas e serão vinculadas automaticamente
              quando você importar os eventos correspondentes.
            </p>
          )}
          {result.backfilled > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 text-sm text-[var(--success)]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {fmtInt(result.backfilled)} vendas que estavam sem evento foram
              reconectadas pelos eventos desta importação.
            </p>
          )}
          <Button onClick={reset}>Importar outro arquivo</Button>
        </CardContent>
      </Card>
    )
  }

  // --- CONFIGURE ------------------------------------------------------------
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4" />
            {entries.length} planilha(s) de {fileNames.length} arquivo(s)
          </CardTitle>
          <CardDescription>
            Confirme o tipo detectado de cada planilha e o mapeamento das
            colunas. Use “Ignorar” para pular uma planilha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {entries.map((e) => (
            <div key={e.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{e.sheet.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.fileName} · {fmtInt(e.sheet.rows.length)} linhas
                  </span>
                  <DetectedBadge type={e.detected} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select
                    value={e.choice}
                    onValueChange={(v) => setChoice(e.id, v as Choice)}
                  >
                    <SelectTrigger className="h-8 w-32" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eventos">Eventos</SelectItem>
                      <SelectItem value="vendas">Vendas</SelectItem>
                      <SelectItem value="ignorar">Ignorar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {e.choice === 'eventos' && (
                <FieldMapper
                  title="Colunas — Eventos"
                  headers={e.sheet.headers}
                  fields={EVENT_FIELDS}
                  map={e.eventsMap}
                  onChange={(f, idx) => setEntryMap(e.id, 'eventos', f, idx)}
                />
              )}
              {e.choice === 'vendas' && (
                <FieldMapper
                  title="Colunas — Vendas"
                  headers={e.sheet.headers}
                  fields={SALE_FIELDS}
                  map={e.salesMap}
                  onChange={(f, idx) => setEntryMap(e.id, 'vendas', f, idx)}
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            + Adicionar mais arquivos
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
            }}
          />
        </CardContent>
      </Card>

      {/* Modo + ação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modo de importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <ModeButton
              active={mode === 'merge'}
              onClick={() => setMode('merge')}
              title="Mesclar"
              desc="Substitui os anos presentes nos dados, mantém os demais"
            />
            <ModeButton
              active={mode === 'replace'}
              onClick={() => setMode('replace')}
              title="Substituir tudo"
              desc="Apaga toda a base antes de importar"
            />
          </div>

          {missingRequired.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-[var(--warning)]">
              <AlertCircle className="size-4" />
              Campos obrigatórios não mapeados: {missingRequired.join('; ')}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleRun}
              disabled={
                missingRequired.length > 0 ||
                active.length === 0 ||
                org.isLoading
              }
            >
              Importar
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Subcomponentes
// ----------------------------------------------------------------------------

function DetectedBadge({ type }: { type: SheetType }) {
  if (type === 'eventos')
    return <Badge className="bg-[var(--info)]/15 text-[var(--info)]" variant="secondary">Detectado: Eventos</Badge>
  if (type === 'vendas')
    return <Badge className="bg-primary/15 text-primary" variant="secondary">Detectado: Vendas</Badge>
  return (
    <Badge className="bg-[var(--warning)]/15 text-[var(--warning)]" variant="secondary">
      Desconhecido
    </Badge>
  )
}

function FieldMapper<F extends string>({
  title,
  headers,
  fields,
  map,
  onChange,
}: {
  title: string
  headers: string[]
  fields: { field: F; label: string; required: boolean }[]
  map: ColumnMap<F>
  onChange: (field: F, idx: number) => void
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => {
          const idx = map[f.field] ?? -1
          return (
            <div key={f.field} className="flex items-center gap-2">
              <Label className="w-40 shrink-0 text-xs text-muted-foreground">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={idx >= 0 ? String(idx) : NONE}
                onValueChange={(v) =>
                  onChange(f.field, v === NONE ? -1 : Number(v))
                }
              >
                <SelectTrigger className="h-8 flex-1" size="sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— não mapear —</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {h || `Coluna ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">
        {typeof value === 'number' ? fmtInt(value) : value}
      </div>
    </div>
  )
}
