import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRules } from '../../hooks/useRules'
import { useReclassify } from '../../hooks/useReclassify'
import {
  addKeywordRule,
  addSegment,
  deleteEventOverride,
  deleteKeywordRule,
  deleteSegment,
  deleteVenueSegment,
} from '../../lib/rules-api'
import type { KeywordRuleRow } from '@/lib/database.types'

export function RulesEditor() {
  const { rules, orgId, isLoading } = useRules()
  const qc = useQueryClient()
  const reclassify = useReclassify(orgId)

  const segNames = rules.segments.map((s) => s.nome)
  const refresh = () => qc.invalidateQueries({ queryKey: ['rules'] })

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      refresh()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edite as regras e clique em reclassificar para aplicar aos eventos.
        </p>
        <Button
          onClick={() => reclassify.mutate()}
          disabled={reclassify.isPending || isLoading}
        >
          <RefreshCw
            className={`size-4 ${reclassify.isPending ? 'animate-spin' : ''}`}
          />
          Salvar e reclassificar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Segmentos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Segmentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {rules.segments.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  Nenhum segmento cadastrado.
                </span>
              )}
              {rules.segments.map((s) => (
                <Badge key={s.id} variant="secondary" className="gap-1">
                  {s.nome}
                  <button onClick={() => run(() => deleteSegment(s.id))}>
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <AddInline
              placeholder="Novo segmento"
              onAdd={(nome) => orgId && run(() => addSegment(orgId, nome))}
            />
          </CardContent>
        </Card>

        {/* Overrides + mapa de locais (somente leitura/remoção aqui) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overrides ativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs uppercase text-muted-foreground">
                Por evento ({rules.overrides.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {rules.overrides.slice(0, 30).map((o) => (
                  <Badge key={o.id} variant="outline" className="gap-1">
                    {o.codigo_evento}: {o.segmento}
                    <button onClick={() => run(() => deleteEventOverride(o.id))}>
                      <Trash2 className="size-3" />
                    </button>
                  </Badge>
                ))}
                {rules.overrides.length === 0 && (
                  <span className="text-muted-foreground">Nenhum</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase text-muted-foreground">
                Por local ({rules.venueMap.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {rules.venueMap.slice(0, 30).map((v) => (
                  <Badge key={v.id} variant="outline" className="gap-1">
                    {v.local}: {v.segmento}
                    <button onClick={() => run(() => deleteVenueSegment(v.id))}>
                      <Trash2 className="size-3" />
                    </button>
                  </Badge>
                ))}
                {rules.venueMap.length === 0 && (
                  <span className="text-muted-foreground">Nenhum</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regras por nome do evento */}
        <KeywordRuleCard
          title="Regras por palavra no NOME do evento"
          table="keyword_rules"
          rows={rules.keywordRules}
          segNames={segNames}
          orgId={orgId}
          onChanged={refresh}
        />

        {/* Regras por nome do local */}
        <KeywordRuleCard
          title="Regras por palavra no LOCAL"
          table="venue_rules"
          rows={rules.venueRules}
          segNames={segNames}
          orgId={orgId}
          onChanged={refresh}
        />
      </div>
    </div>
  )
}

function KeywordRuleCard({
  title,
  table,
  rows,
  segNames,
  orgId,
  onChanged,
}: {
  title: string
  table: 'keyword_rules' | 'venue_rules'
  rows: KeywordRuleRow[]
  segNames: string[]
  orgId: string | undefined
  onChanged: () => void
}) {
  const [keyword, setKeyword] = useState('')
  const [segmento, setSegmento] = useState('')

  async function add() {
    if (!orgId || !keyword.trim() || !segmento.trim()) return
    try {
      await addKeywordRule(table, orgId, {
        keyword: keyword.trim(),
        segmento: segmento.trim(),
        ordem: rows.length,
      })
      setKeyword('')
      setSegmento('')
      onChanged()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function remove(id: string) {
    try {
      await deleteKeywordRule(table, id)
      onChanged()
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {rows.length === 0 && (
            <span className="text-sm text-muted-foreground">Nenhuma regra.</span>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm"
            >
              <span>
                <span className="font-mono">{r.keyword}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">{r.segmento}</span>
              </span>
              <button onClick={() => remove(r.id)}>
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="palavra-chave"
            className="h-8"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Input
            placeholder="segmento"
            className="h-8"
            list="seg-names"
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={add}>
            <Plus className="size-4" />
          </Button>
        </div>
        <datalist id="seg-names">
          {segNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </CardContent>
    </Card>
  )
}

function AddInline({
  placeholder,
  onAdd,
}: {
  placeholder: string
  onAdd: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        className="h-8"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim())
            setValue('')
          }
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim())
            setValue('')
          }
        }}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
