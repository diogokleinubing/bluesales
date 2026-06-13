import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCrmOrgId } from '../../hooks/useFunnelStages'
import { useLocalTipos } from '../../hooks/useConfigCadastros'
import {
  useFitRules, saveFitRule, deleteFitRule, defaultConfig,
  type FitConfig, type FitEscopo, type FitRule,
} from '../../hooks/useFitScore'
import { DeleteEntityButton } from '../../components/DeleteEntityButton'

/** Funde a config salva com a lista canônica de critérios (ordem/rótulos). */
function mergeCfg(cfg: FitConfig | undefined, escopo: FitEscopo): FitConfig {
  const canon = defaultConfig(escopo).criterios
  const byId = new Map((cfg?.criterios ?? []).map((c) => [c.id, c]))
  return {
    janela_meses: cfg?.janela_meses ?? 6,
    criterios: canon.map((c) => ({ ...c, ...(byId.get(c.id) ?? {}), id: c.id, label: c.label })),
  }
}

export function FitScoreConfig() {
  const qc = useQueryClient()
  const rules = useFitRules()
  const tipos = useLocalTipos()
  const [addTipo, setAddTipo] = useState('')
  const [copyFrom, setCopyFrom] = useState('__padrao__')
  const [novoTipoId, setNovoTipoId] = useState<string | null>(null)
  const [novoSeed, setNovoSeed] = useState<FitConfig | undefined>(undefined)

  const localRules = (rules.data ?? []).filter((r) => r.escopo === 'local')
  const padrao = localRules.find((r) => r.tipo_local_id == null) ?? null
  const porTipo = localRules.filter((r) => r.tipo_local_id != null)
  const orgRule = (rules.data ?? []).find((r) => r.escopo === 'organizador' && r.tipo_local_id == null) ?? null
  const tipoNome = useMemo(() => new Map((tipos.data ?? []).map((t) => [t.id, t.nome])), [tipos.data])
  const tiposComRegra = new Set(porTipo.map((r) => r.tipo_local_id))
  const disponiveis = (tipos.data ?? []).filter((t) => !tiposComRegra.has(t.id) && t.id !== novoTipoId)

  function refresh() { qc.invalidateQueries({ queryKey: ['crm', 'fit-rules'] }) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fit Score</h1>
        <p className="text-sm text-muted-foreground">Regras de pontuação (0–100) para priorizar a prospecção de locais e organizadores. A pontuação de cada critério sobe de 0 (no valor “bom”) a 100 (no “ótimo”); o “corte” é um mínimo eliminatório.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Locais — regra padrão</h2>
        <RuleCard escopo="local" tipoLocalId={null} rule={padrao} titulo="Padrão (todos os tipos)" onSaved={refresh} onDeleted={refresh} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Locais — por tipo</h2>
        {porTipo.map((r) => (
          <RuleCard key={r.id} escopo="local" tipoLocalId={r.tipo_local_id} rule={r}
            titulo={tipoNome.get(r.tipo_local_id ?? '') ?? 'Tipo'} onSaved={refresh} onDeleted={refresh} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={addTipo} onValueChange={setAddTipo}>
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Adicionar regra por tipo…" /></SelectTrigger>
            <SelectContent>
              {disponiveis.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={copyFrom} onValueChange={setCopyFrom}>
            <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Copiar de…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__padrao__">Copiar da regra padrão</SelectItem>
              <SelectItem value="__zero__">Começar do zero</SelectItem>
              {porTipo.map((r) => <SelectItem key={r.id} value={r.id}>Copiar de {tipoNome.get(r.tipo_local_id ?? '') ?? 'tipo'}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!addTipo} onClick={() => {
            if (!addTipo) return
            const seed = copyFrom === '__zero__' ? defaultConfig('local')
              : copyFrom === '__padrao__' ? (padrao?.config ?? defaultConfig('local'))
                : (porTipo.find((r) => r.id === copyFrom)?.config ?? defaultConfig('local'))
            setNovoSeed(seed); setNovoTipoId(addTipo); setAddTipo('')
          }}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
        {novoTipoId && (
          <RuleCard escopo="local" tipoLocalId={novoTipoId} rule={null} seedConfig={novoSeed}
            titulo={tipoNome.get(novoTipoId) ?? 'Tipo'} onSaved={() => { setNovoTipoId(null); setNovoSeed(undefined); refresh() }} onDeleted={() => { setNovoTipoId(null); setNovoSeed(undefined) }} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Organizadores</h2>
        <RuleCard escopo="organizador" tipoLocalId={null} rule={orgRule} titulo="Padrão (todos)" onSaved={refresh} onDeleted={refresh} />
      </section>
    </div>
  )
}

function RuleCard({
  escopo, tipoLocalId, rule, titulo, seedConfig, onSaved, onDeleted,
}: {
  escopo: FitEscopo
  tipoLocalId: string | null
  rule: FitRule | null
  titulo: string
  seedConfig?: FitConfig
  onSaved: () => void
  onDeleted?: () => void
}) {
  const orgId = useCrmOrgId()
  const [cfg, setCfg] = useState<FitConfig>(() => mergeCfg(rule?.config ?? seedConfig, escopo))
  const [saving, setSaving] = useState(false)

  function setCrit(id: string, field: 'peso' | 'bom' | 'otimo', value: string) {
    setCfg((c) => ({ ...c, criterios: c.criterios.map((x) => x.id === id ? { ...x, [field]: Number(value) || 0 } : x) }))
  }
  function setCorte(id: string, value: string) {
    setCfg((c) => ({ ...c, criterios: c.criterios.map((x) => x.id === id ? { ...x, corte: value.trim() === '' ? null : Number(value) } : x) }))
  }

  async function salvar() {
    if (!orgId) return
    setSaving(true)
    try { await saveFitRule(orgId, { escopo, tipo_local_id: tipoLocalId, config: cfg }, rule?.id); toast.success('Regra salva'); onSaved() }
    catch (e) { toast.error('Erro', { description: (e as Error).message }) }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{titulo}</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Janela (meses)
            <Input type="number" min={1} className="h-8 w-20"
              value={cfg.janela_meses}
              onChange={(e) => setCfg((c) => ({ ...c, janela_meses: Number(e.target.value) || 1 }))} />
          </label>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Critério</TableHead>
            <TableHead className="w-24">Peso</TableHead>
            <TableHead className="w-24">Bom</TableHead>
            <TableHead className="w-24">Ótimo</TableHead>
            <TableHead className="w-28">Corte (mín.)</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {cfg.criterios.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell><Input type="number" className="h-8" value={c.peso} onChange={(e) => setCrit(c.id, 'peso', e.target.value)} /></TableCell>
                <TableCell><Input type="number" className="h-8" value={c.bom} onChange={(e) => setCrit(c.id, 'bom', e.target.value)} /></TableCell>
                <TableCell><Input type="number" className="h-8" value={c.otimo} onChange={(e) => setCrit(c.id, 'otimo', e.target.value)} /></TableCell>
                <TableCell><Input type="number" className="h-8" placeholder="—" value={c.corte ?? ''} onChange={(e) => setCorte(c.id, e.target.value)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-2">
          {rule ? (
            <DeleteEntityButton title="Remover esta regra?"
              description={tipoLocalId ? 'Este tipo voltará a usar a regra padrão.' : 'Voltará a usar os pesos padrão do sistema.'}
              onDelete={() => deleteFitRule(rule.id)} onDeleted={() => onDeleted?.()} label="Remover regra" />
          ) : <span />}
          <Button size="sm" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
