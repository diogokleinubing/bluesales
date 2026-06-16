import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  setArtistClassification,
  setVenueClassification,
  updateKeywordRule,
  type AttractionClassRow,
} from '../../lib/rules-api'
import { ClassSelect } from './ClassSelect'
import type { GeneroRow, KeywordRuleRow, VenueSegmentMapRow } from '@/lib/database.types'

export function RulesEditor() {
  const { rules, orgId } = useRules()
  const qc = useQueryClient()
  const reclassify = useReclassify(orgId)

  const segNames = useMemo(() => rules.segments.map((s) => s.nome), [rules.segments])
  const genNames = useMemo(() => rules.generos.map((g) => g.nome), [rules.generos])
  const refreshRules = () => qc.invalidateQueries({ queryKey: ['rules'] })

  // As regras são salvas na hora, mas a RECLASSIFICAÇÃO dos eventos só roda ao
  // clicar no botão flutuante (evita reprocessar a base a cada alteração).
  const [dirty, setDirty] = useState(false)
  const markDirty = () => {
    refreshRules()
    setDirty(true)
  }
  function aplicar() {
    reclassify.mutate('all', { onSuccess: () => setDirty(false) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A classificação automática segue a ordem <strong>Termos → Atrações →
        Local</strong> (o primeiro que casar vence). As alterações são salvas na
        hora; clique em <strong>Reclassificar eventos</strong> para aplicá-las à
        base (definições manuais são preservadas).
      </p>

      <Tabs defaultValue="atracoes">
        <TabsList>
          <TabsTrigger value="atracoes">Atrações</TabsTrigger>
          <TabsTrigger value="termos">Termos</TabsTrigger>
          <TabsTrigger value="locais">Locais</TabsTrigger>
        </TabsList>

        <TabsContent value="atracoes" className="mt-4">
          <AttractionsCard
            rows={rules.attractions}
            segNames={segNames}
            generos={rules.generos}
            afterChange={markDirty}
          />
        </TabsContent>

        <TabsContent value="termos" className="mt-4">
          <KeywordRuleCard
            title="Termos no nome do evento"
            hint='Aplicados ao nome do evento (ex.: artista). "Segmento só sem ano": o segmento não é aplicado quando o nome tem ano (festival); o gênero continua valendo.'
            table="keyword_rules"
            rows={rules.keywordRules}
            segNames={segNames}
            genNames={genNames}
            orgId={orgId}
            afterChange={markDirty}
          />
        </TabsContent>

        <TabsContent value="locais" className="mt-4">
          <VenueMapCard
            rows={rules.venueMap}
            segNames={segNames}
            genNames={genNames}
            orgId={orgId}
            onReclassifyLocal={markDirty}
            refreshRules={refreshRules}
          />
        </TabsContent>
      </Tabs>

      {/* Barra flutuante: aplicar (reclassificar) as alterações de regras */}
      {(dirty || reclassify.isPending) && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm text-muted-foreground">
            Alterações de regras não aplicadas
          </span>
          <Button onClick={aplicar} disabled={reclassify.isPending}>
            <RefreshCw
              className={`size-4 ${reclassify.isPending ? 'animate-spin' : ''}`}
            />
            {reclassify.isPending ? 'Reclassificando…' : 'Reclassificar eventos'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atrações (artists.segmento / genero_id / classificar)
// ---------------------------------------------------------------------------
function AttractionsCard({
  rows,
  segNames,
  generos,
  afterChange,
}: {
  rows: AttractionClassRow[]
  segNames: string[]
  generos: GeneroRow[]
  afterChange: () => void
}) {
  const [search, setSearch] = useState('')
  const genNames = useMemo(() => generos.map((g) => g.nome), [generos])
  const idByGenero = useMemo(
    () => new Map(generos.map((g) => [g.nome, g.id])),
    [generos],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (a) =>
        a.nome.toLowerCase().includes(q) ||
        (a.aliases ?? '').toLowerCase().includes(q),
    )
  }, [rows, search])

  async function save(id: string, patch: Parameters<typeof setArtistClassification>[1]) {
    try {
      await setArtistClassification(id, patch)
      afterChange()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Atrações</CardTitle>
        <p className="text-xs text-muted-foreground">
          Base de atrações do Comercial. Ative para usar na classificação
          automática e defina segmento e gênero — aplicados quando o nome (ou
          alias) da atração aparece no nome do evento.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar atração…"
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-center">Ativo</TableHead>
                <TableHead>Atração</TableHead>
                <TableHead className="w-48">Segmento</TableHead>
                <TableHead className="w-48">Gênero musical</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
                    Nenhuma atração.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((a) => (
                <TableRow key={a.id} className={a.classificar ? '' : 'opacity-60'}>
                  <TableCell className="text-center">
                    <Switch
                      checked={a.classificar}
                      onCheckedChange={(v) => save(a.id, { classificar: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{a.nome}</div>
                    {a.aliases && (
                      <div className="text-xs text-muted-foreground">{a.aliases}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <ClassSelect
                      value={a.segmento}
                      options={segNames}
                      onChange={(v) => save(a.id, { segmento: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <ClassSelect
                      value={a.genero_nome}
                      options={genNames}
                      onChange={(v) => save(a.id, { genero_id: v ? (idByGenero.get(v) ?? null) : null })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
  const [ignorarComAno, setIgnorarComAno] = useState(false)

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
        ignorar_com_ano: ignorarComAno,
      })
      setKeyword('')
      setSegmento(null)
      setGenero(null)
      setIgnorarComAno(false)
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
              <TableHead className="w-32 text-center">
                <Tooltip>
                  <TooltipTrigger className="cursor-help leading-tight">
                    Segmento
                    <br />
                    só sem ano
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Quando marcado, o <strong>segmento</strong> desta regra só é
                    aplicado se o nome do evento <strong>não</strong> tiver um ano
                    (20XX) — provável festival/edição. O <strong>gênero</strong>{' '}
                    continua sendo aplicado normalmente.
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-4 text-center text-muted-foreground">
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
                <TableCell className="text-center">
                  <Checkbox
                    checked={r.ignorar_com_ano}
                    onCheckedChange={(v) =>
                      patch(r.id, { ignorar_com_ano: v === true })
                    }
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
              <TableCell className="text-center">
                <Checkbox
                  checked={ignorarComAno}
                  onCheckedChange={(v) => setIgnorarComAno(v === true)}
                />
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
