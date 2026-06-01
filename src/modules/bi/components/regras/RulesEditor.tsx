import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import {
  addKeywordRule,
  deleteKeywordRule,
  deleteVenueClassification,
  setVenueClassification,
  updateKeywordRule,
} from '../../lib/rules-api'
import { ClassSelect } from './ClassSelect'
import type { KeywordRuleRow, VenueSegmentMapRow } from '@/lib/database.types'

export function RulesEditor() {
  const { rules, orgId } = useRules()
  const qc = useQueryClient()
  const reclassify = useReclassify(orgId)

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])
  const refreshRules = () => qc.invalidateQueries({ queryKey: ['rules'] })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cada termo ou local pode classificar segmento, gênero, ou os dois. Ao
        salvar, os eventos são reclassificados automaticamente (definições
        manuais são preservadas).
      </p>

      {/* Termos no NOME do evento */}
      <KeywordRuleCard
        title="Termos no nome do evento"
        hint="Aplicados ao nome do evento (ex.: artista). Salvar reclassifica todos os eventos."
        table="keyword_rules"
        rows={rules.keywordRules}
        segNames={segNames}
        genNames={genNames}
        orgId={orgId}
        afterChange={() => {
          refreshRules()
          reclassify.mutate('all')
        }}
      />

      {/* Locais (venue_segment_map) */}
      <VenueMapCard
        rows={rules.venueMap}
        segNames={segNames}
        genNames={genNames}
        orgId={orgId}
        onReclassifyLocal={(local) => reclassify.mutate({ local })}
        refreshRules={refreshRules}
      />

      {/* Termos no LOCAL */}
      <KeywordRuleCard
        title="Termos no local"
        hint="Aplicados ao nome do local do evento. Salvar reclassifica todos os eventos."
        table="venue_rules"
        rows={rules.venueRules}
        segNames={segNames}
        genNames={genNames}
        orgId={orgId}
        afterChange={() => {
          refreshRules()
          reclassify.mutate('all')
        }}
      />

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => reclassify.mutate('all')}
          disabled={reclassify.isPending}
        >
          <RefreshCw
            className={`size-4 ${reclassify.isPending ? 'animate-spin' : ''}`}
          />
          Reclassificar todos
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Termos (keyword_rules / venue_rules)
// ---------------------------------------------------------------------------
function KeywordRuleCard({
  title,
  hint,
  table,
  rows,
  segNames,
  genNames,
  orgId,
  afterChange,
}: {
  title: string
  hint: string
  table: 'keyword_rules' | 'venue_rules'
  rows: KeywordRuleRow[]
  segNames: string[]
  genNames: string[]
  orgId: string | undefined
  afterChange: () => void
}) {
  const [keyword, setKeyword] = useState('')
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)

  async function add() {
    if (!orgId || !keyword.trim() || (!segmento && !genero)) {
      toast.error('Informe o termo e ao menos segmento ou gênero.')
      return
    }
    try {
      await addKeywordRule(table, orgId, {
        keyword: keyword.trim(),
        segmento,
        genero,
        ordem: rows.length * 10 + 10,
      })
      setKeyword('')
      setSegmento(null)
      setGenero(null)
      afterChange()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function patch(id: string, p: Partial<KeywordRuleRow>) {
    try {
      await updateKeywordRule(table, id, p)
      afterChange()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function remove(id: string) {
    try {
      await deleteKeywordRule(table, id)
      afterChange()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Termo</TableHead>
              <TableHead className="w-48">Segmento</TableHead>
              <TableHead className="w-48">Gênero musical</TableHead>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
                  Nenhum termo.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.keyword}</TableCell>
                <TableCell>
                  <ClassSelect
                    value={r.segmento}
                    options={segNames}
                    onChange={(v) => patch(r.id, { segmento: v })}
                  />
                </TableCell>
                <TableCell>
                  <ClassSelect
                    value={r.genero}
                    options={genNames}
                    onChange={(v) => patch(r.id, { genero: v })}
                  />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.ordem}
                </TableCell>
                <TableCell>
                  <button onClick={() => remove(r.id)}>
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {/* Linha de adição */}
            <TableRow>
              <TableCell>
                <Input
                  placeholder="novo termo"
                  className="h-8"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                />
              </TableCell>
              <TableCell>
                <ClassSelect value={segmento} options={segNames} onChange={setSegmento} />
              </TableCell>
              <TableCell>
                <ClassSelect value={genero} options={genNames} onChange={setGenero} />
              </TableCell>
              <TableCell colSpan={2}>
                <Button size="sm" variant="secondary" onClick={add}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Locais (venue_segment_map)
// ---------------------------------------------------------------------------
function VenueMapCard({
  rows,
  segNames,
  genNames,
  orgId,
  onReclassifyLocal,
  refreshRules,
}: {
  rows: VenueSegmentMapRow[]
  segNames: string[]
  genNames: string[]
  orgId: string | undefined
  onReclassifyLocal: (local: string) => void
  refreshRules: () => void
}) {
  const [local, setLocal] = useState('')
  const [segmento, setSegmento] = useState<string | null>(null)
  const [genero, setGenero] = useState<string | null>(null)

  async function save(
    targetLocal: string,
    seg: string | null,
    gen: string | null,
  ) {
    if (!orgId || !targetLocal.trim()) return
    try {
      await setVenueClassification(orgId, targetLocal.trim(), seg, gen)
      refreshRules()
      onReclassifyLocal(targetLocal.trim())
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function remove(id: string) {
    try {
      await deleteVenueClassification(id)
      refreshRules()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Locais</CardTitle>
        <p className="text-xs text-muted-foreground">
          Classificação por local exato. Salvar reclassifica só os eventos
          daquele local.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Local</TableHead>
              <TableHead className="w-48">Segmento</TableHead>
              <TableHead className="w-48">Gênero musical</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
                  Nenhum local classificado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="max-w-64 truncate font-medium">
                  {v.local}
                </TableCell>
                <TableCell>
                  <ClassSelect
                    value={v.segmento}
                    options={segNames}
                    onChange={(val) => save(v.local, val, v.genero)}
                  />
                </TableCell>
                <TableCell>
                  <ClassSelect
                    value={v.genero}
                    options={genNames}
                    onChange={(val) => save(v.local, v.segmento, val)}
                  />
                </TableCell>
                <TableCell>
                  <button onClick={() => remove(v.id)}>
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {/* Linha de adição */}
            <TableRow>
              <TableCell>
                <Input
                  placeholder="nome do local"
                  className="h-8"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                />
              </TableCell>
              <TableCell>
                <ClassSelect value={segmento} options={segNames} onChange={setSegmento} />
              </TableCell>
              <TableCell>
                <ClassSelect value={genero} options={genNames} onChange={setGenero} />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!local.trim() || (!segmento && !genero)) {
                      toast.error('Informe o local e ao menos segmento ou gênero.')
                      return
                    }
                    save(local, segmento, genero)
                    setLocal('')
                    setSegmento(null)
                    setGenero(null)
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
