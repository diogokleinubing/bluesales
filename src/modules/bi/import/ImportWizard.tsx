import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  detectSheet,
  readWorkbook,
} from './parse'
import { buildRecords, runImport } from './import'
import { reclassifyEvents } from '../lib/rules-api'
import { loadMapping, saveMapping } from './mapping-cache'
import {
  EVENT_FIELDS,
  SALE_FIELDS,
  type ColumnMap,
  type EventField,
  type ImportMode,
  type ImportProgress,
  type ParsedWorkbook,
  type SaleField,
} from './types'

type Step = 'upload' | 'configure' | 'running' | 'done'

const NONE = '__none__'

export function ImportWizard() {
  const org = useDefaultOrg()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [wb, setWb] = useState<ParsedWorkbook | null>(null)
  const [eventsSheet, setEventsSheet] = useState<string>('')
  const [salesSheet, setSalesSheet] = useState<string>('')
  const [eventsMap, setEventsMap] = useState<ColumnMap<EventField> | null>(null)
  const [salesMap, setSalesMap] = useState<ColumnMap<SaleField> | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<{
    events: number
    sales: number
    skipped: number
    years: number[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sheetByName = useCallback(
    (name: string) => wb?.sheets.find((s) => s.name === name) ?? null,
    [wb],
  )

  async function handleFile(file: File) {
    setError(null)
    try {
      const parsed = await readWorkbook(file)
      const evName = detectSheet(parsed.sheets, 'eventos') ?? parsed.sheets[0]?.name ?? ''
      const saName =
        detectSheet(parsed.sheets, 'vendas') ??
        parsed.sheets.find((s) => s.name !== evName)?.name ??
        ''
      setWb(parsed)
      applySheetSelection(parsed, evName, saName)
      setStep('configure')
    } catch (e) {
      setError(`Não foi possível ler o arquivo: ${(e as Error).message}`)
    }
  }

  function applySheetSelection(
    parsed: ParsedWorkbook,
    evName: string,
    saName: string,
  ) {
    setEventsSheet(evName)
    setSalesSheet(saName)
    const ev = parsed.sheets.find((s) => s.name === evName)
    const sa = parsed.sheets.find((s) => s.name === saName)
    if (ev) {
      const fp = columnsFingerprint(ev.headers)
      setEventsMap(
        (loadMapping(fp, 'events') as ColumnMap<EventField>) ??
          autoMapEvents(ev.headers),
      )
    }
    if (sa) {
      const fp = columnsFingerprint(sa.headers)
      setSalesMap(
        (loadMapping(fp, 'sales') as ColumnMap<SaleField>) ??
          autoMapSales(sa.headers),
      )
    }
  }

  const eventsData = sheetByName(eventsSheet)
  const salesData = sheetByName(salesSheet)

  const missingRequired = useMemo(() => {
    const miss: string[] = []
    if (!eventsMap || (eventsMap.codigo_evento ?? -1) < 0)
      miss.push('Eventos: Código do evento')
    if (!salesMap || (salesMap.codigo_evento ?? -1) < 0)
      miss.push('Vendas: Código do evento')
    return miss
  }, [eventsMap, salesMap])

  async function handleRun() {
    if (!wb || !eventsData || !salesData || !eventsMap || !salesMap) return
    if (!org.data) {
      setError('Organização não carregada.')
      return
    }
    setStep('running')
    setError(null)
    setProgress({ phase: 'Lendo planilha', current: 0, total: 1 })
    try {
      // Persiste o mapeamento para reuso futuro.
      saveMapping(columnsFingerprint(eventsData.headers), 'events', eventsMap)
      saveMapping(columnsFingerprint(salesData.headers), 'sales', salesMap)

      const build = buildRecords(
        org.data.id,
        eventsData,
        eventsMap,
        salesData,
        salesMap,
      )
      const res = await runImport({
        orgId: org.data.id,
        fileName: wb.fileName,
        build,
        mode,
        onProgress: setProgress,
      })
      // Classifica os segmentos com as regras atuais.
      setProgress({ phase: 'Classificando segmentos', current: 0, total: 1 })
      await reclassifyEvents(org.data.id)
      setResult({
        events: res.eventsUpserted,
        sales: res.salesInserted,
        skipped: build.skippedSales,
        years: build.years,
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
    setWb(null)
    setEventsMap(null)
    setSalesMap(null)
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
            Envie um arquivo Excel (.xlsx) com as abas de Eventos e Vendas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 py-12 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Upload className="size-8" />
            <span className="text-sm">
              Clique ou arraste o arquivo <strong>.xlsx</strong> aqui
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
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
            {wb?.fileName}
          </CardTitle>
          <CardDescription>
            Confirme as abas e o mapeamento das colunas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seleção de abas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Aba de Eventos</Label>
              <SheetSelect
                value={eventsSheet}
                sheets={wb?.sheets.map((s) => s.name) ?? []}
                onChange={(v) => wb && applySheetSelection(wb, v, salesSheet)}
              />
              <span className="text-xs text-muted-foreground">
                {fmtInt(eventsData?.rows.length)} linhas
              </span>
            </div>
            <div className="space-y-2">
              <Label>Aba de Vendas</Label>
              <SheetSelect
                value={salesSheet}
                sheets={wb?.sheets.map((s) => s.name) ?? []}
                onChange={(v) => wb && applySheetSelection(wb, eventsSheet, v)}
              />
              <span className="text-xs text-muted-foreground">
                {fmtInt(salesData?.rows.length)} linhas
              </span>
            </div>
          </div>

          {/* Mapeamento de colunas */}
          {eventsData && eventsMap && (
            <FieldMapper
              title="Colunas — Eventos"
              headers={eventsData.headers}
              fields={EVENT_FIELDS}
              map={eventsMap}
              onChange={(f, idx) =>
                setEventsMap({ ...eventsMap, [f]: idx } as ColumnMap<EventField>)
              }
            />
          )}
          {salesData && salesMap && (
            <FieldMapper
              title="Colunas — Vendas"
              headers={salesData.headers}
              fields={SALE_FIELDS}
              map={salesMap}
              onChange={(f, idx) =>
                setSalesMap({ ...salesMap, [f]: idx } as ColumnMap<SaleField>)
              }
            />
          )}
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
              desc="Substitui os anos do arquivo, mantém os demais"
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
              disabled={missingRequired.length > 0 || org.isLoading}
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

function SheetSelect({
  value,
  sheets,
  onChange,
}: {
  value: string
  sheets: string[]
  onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione a aba" />
      </SelectTrigger>
      <SelectContent>
        {sheets.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
