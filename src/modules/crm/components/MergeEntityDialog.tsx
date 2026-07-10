import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeftRight, ArrowRight } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useFunnel } from '../hooks/useFunnelStages'
import { useRelacionamento, mergeEntity, updateEntityFields, type RelTipo } from '../hooks/useRelacionamento'
import { EntityAutocomplete, type Lookup } from './EntityAutocomplete'

const TABLE: Record<RelTipo, string> = { org: 'organizations', local: 'crm_locals', evento: 'crm_events' }
const ACT_COL: Record<RelTipo, string> = { org: 'organization_id', local: 'local_id', evento: 'crm_event_id' }
const POLY_USER: Record<RelTipo, string> = { org: 'organization', local: 'local', evento: 'evento' }
const LABEL: Record<RelTipo, string> = { org: 'organização', local: 'local', evento: 'evento' }
const HREF: Record<RelTipo, string> = { org: '/comercial/organizacoes', local: '/comercial/locais', evento: '/comercial/eventos' }

// kind ausente = enum/valor fixo (escolha A|B). 'text'/'textarea' = valor final editável.
type Field = { key: string; label: string; kind?: 'stage' | 'num' | 'text' | 'textarea' }

const FIELDS: Record<RelTipo, Field[]> = {
  org: [
    { key: 'nome', label: 'Nome', kind: 'text' },
    { key: 'classificacao', label: 'Classe' },
    { key: 'funil_stage_id', label: 'Estágio', kind: 'stage' },
    { key: 'status_comercial', label: 'Status comercial' },
    { key: 'cidade', label: 'Cidade', kind: 'text' }, { key: 'uf', label: 'UF' },
    { key: 'gmv_anual', label: 'GMV anual', kind: 'num' },
    { key: 'cliente_desde', label: 'Cliente desde' },
    { key: 'origem_lead', label: 'Origem do lead' },
    { key: 'sociedade', label: 'Sociedade' }, { key: 'estrutura', label: 'Estrutura' },
    { key: 'site', label: 'Site', kind: 'text' }, { key: 'instagram', label: 'Instagram', kind: 'text' },
    { key: 'observacoes', label: 'Observações', kind: 'textarea' },
  ],
  local: [
    { key: 'nome', label: 'Nome', kind: 'text' },
    { key: 'classificacao', label: 'Classe' },
    { key: 'funil_stage_id', label: 'Estágio', kind: 'stage' },
    { key: 'cidade', label: 'Cidade', kind: 'text' }, { key: 'uf', label: 'UF' },
    { key: 'capacidade', label: 'Capacidade', kind: 'num' },
    { key: 'site', label: 'Site', kind: 'text' }, { key: 'instagram', label: 'Instagram', kind: 'text' },
    { key: 'observacoes', label: 'Observações', kind: 'textarea' },
  ],
  evento: [
    { key: 'nome', label: 'Nome', kind: 'text' },
    { key: 'classificacao', label: 'Classe' },
    { key: 'funil_stage_id', label: 'Estágio', kind: 'stage' },
    { key: 'gmv_estimado', label: 'GMV estimado', kind: 'num' },
    { key: 'site', label: 'Site', kind: 'text' }, { key: 'instagram', label: 'Instagram', kind: 'text' },
    { key: 'observacoes', label: 'Observações', kind: 'textarea' },
  ],
}

type Row = Record<string, unknown>

function mergeAliases(surv: Row, dup: Row): string {
  const parts = [String(surv.aliases ?? ''), String(dup.nome ?? ''), String(dup.aliases ?? '')]
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of parts) {
    for (const tok of chunk.split(/[,\n;]+/).map((t) => t.trim()).filter(Boolean)) {
      const k = tok.toLowerCase()
      if (!seen.has(k)) { seen.add(k); out.push(tok) }
    }
  }
  return out.join(', ')
}

export function MergeEntityDialog({
  tipo, entityId, entityNome, open, onOpenChange,
}: {
  tipo: RelTipo
  entityId: string
  entityNome: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const rel = useRelacionamento()
  const { stages } = useFunnel('relacionamento')
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s.nome])), [stages])

  const [pick, setPick] = useState<Lookup | null>(null)
  const [swap, setSwap] = useState(false)
  const [chosen, setChosen] = useState<Record<string, unknown>>({}) // valor final por campo (editado/escolhido)
  const [saving, setSaving] = useState(false)

  function handleOpenChange(o: boolean) {
    if (!o) { setPick(null); setSwap(false); setChosen({}); setSaving(false) }
    onOpenChange(o)
  }

  const options: Lookup[] = useMemo(() => {
    const t = tipo
    return (rel.data ?? [])
      .filter((it) => it.tipo === t && it.id !== entityId)
      .map((it) => ({ id: it.id, nome: it.cidade ? `${it.nome} · ${[it.cidade, it.uf].filter(Boolean).join('/')}` : it.nome }))
  }, [rel.data, tipo, entityId])

  const survivorId = swap ? pick?.id ?? null : entityId
  const duplicateId = swap ? entityId : pick?.id ?? null
  const survivorNome = swap ? pick?.nome ?? '' : entityNome
  const duplicateNome = swap ? entityNome : pick?.nome ?? ''

  // Linhas completas dos dois registros.
  const rowsQ = useQuery({
    enabled: open && !!survivorId && !!duplicateId,
    queryKey: ['crm', 'merge-rows', tipo, survivorId, duplicateId],
    queryFn: async (): Promise<{ surv: Row; dup: Row }> => {
      const [s, d] = await Promise.all([
        supabase.from(TABLE[tipo]).select('*').eq('id', survivorId!).maybeSingle(),
        supabase.from(TABLE[tipo]).select('*').eq('id', duplicateId!).maybeSingle(),
      ])
      if (s.error) throw new Error(s.error.message)
      if (d.error) throw new Error(d.error.message)
      return { surv: (s.data ?? {}) as Row, dup: (d.data ?? {}) as Row }
    },
  })

  // Contagem do que será movido do descartado.
  const countsQ = useQuery({
    enabled: open && !!duplicateId,
    queryKey: ['crm', 'merge-counts', tipo, duplicateId],
    queryFn: async () => {
      const [ativ, cont] = await Promise.all([
        supabase.from('activities').select('id', { count: 'exact', head: true }).eq(ACT_COL[tipo], duplicateId!).is('deleted_at', null),
        supabase.from('person_entities').select('id', { count: 'exact', head: true }).eq('entity_type', POLY_USER[tipo]).eq('entity_id', duplicateId!).eq('ativo', true),
      ])
      return { ativ: ativ.count ?? 0, cont: cont.count ?? 0 }
    },
  })

  const diffs = useMemo(() => {
    if (!rowsQ.data) return [] as Field[]
    const { surv, dup } = rowsQ.data
    return FIELDS[tipo].filter((f) => String(surv[f.key] ?? '') !== String(dup[f.key] ?? ''))
  }, [rowsQ.data, tipo])

  // Padrão do campo: mantém o do sobrevivente; usa o do descartado só se o
  // sobrevivente estiver vazio.
  function finalDefault(f: Field): unknown {
    if (!rowsQ.data) return ''
    const s = rowsQ.data.surv[f.key]
    return String(s ?? '') !== '' ? s : rowsQ.data.dup[f.key]
  }
  // Valor final: override (editado/escolhido) do usuário, senão o padrão.
  function finalValue(f: Field): unknown {
    return f.key in chosen ? chosen[f.key] : finalDefault(f)
  }
  function setFinal(key: string, value: unknown) {
    setChosen((c) => ({ ...c, [key]: value }))
  }

  function show(row: Row, f: Field): string {
    const v = row[f.key]
    if (f.kind === 'stage') return v ? stageMap.get(String(v)) ?? '—' : '—'
    return v != null && v !== '' ? String(v) : '—'
  }

  async function confirmar() {
    if (!survivorId || !duplicateId || !rowsQ.data) return
    setSaving(true)
    try {
      const { surv, dup } = rowsQ.data
      const patch: Record<string, unknown> = {}
      for (const f of diffs) {
        const fin = finalValue(f)
        if (String(fin ?? '') !== String(surv[f.key] ?? '')) patch[f.key] = fin
      }
      if (tipo !== 'evento') patch.aliases = mergeAliases(surv, dup) // evento não tem aliases
      await updateEntityFields(tipo, survivorId, patch)
      await mergeEntity(tipo, survivorId, duplicateId)
      qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success('Registros unificados')
      handleOpenChange(false)
      navigate(`${HREF[tipo]}/${survivorId}`)
    } catch (e) {
      toast.error('Não foi possível unificar', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Unificar {LABEL[tipo]} duplicado</DialogTitle>
        </DialogHeader>

        {!pick ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Busque o registro duplicado que será unificado a <span className="font-medium text-foreground">{entityNome}</span>.
            </p>
            <EntityAutocomplete value={pick} onPick={setPick} options={options} placeholder="Buscar duplicado…" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quem fica / quem é descartado */}
            <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Fica (sobrevivente)</div>
                <div className="truncate font-medium">{survivorNome}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Descartado</div>
                <div className="truncate font-medium text-muted-foreground line-through">{duplicateNome}</div>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 gap-1" onClick={() => setSwap((s) => !s)} title="Inverter">
                <ArrowLeftRight className="size-4" /> Inverter
              </Button>
            </div>

            {/* O que será movido */}
            <p className="text-xs text-muted-foreground">
              Do descartado serão movidos ao que fica:{' '}
              {countsQ.isLoading ? '…' : <span className="font-medium text-foreground">{countsQ.data?.ativ ?? 0} atividades · {countsQ.data?.cont ?? 0} contatos</span>}
              {' '}+ oportunidades, objeções, vínculos e histórico. O descartado é arquivado (recuperável em Logs).
            </p>

            {/* Comparação campo a campo */}
            {rowsQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : diffs.length === 0 ? (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Os campos coincidem — nada a escolher.</p>
            ) : (
              <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                <div className="text-xs font-medium text-muted-foreground">Campos diferentes — confirme/edite o que fica:</div>
                {rowsQ.data && diffs.map((f) => {
                  const editable = f.kind === 'text' || f.kind === 'textarea'
                  const survRaw = rowsQ.data!.surv[f.key]
                  const dupRaw = rowsQ.data!.dup[f.key]
                  return (
                    <div key={f.key} className="rounded-md border border-border p-2">
                      <div className="mb-1 text-xs font-medium">{f.label}</div>
                      {editable ? (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setFinal(f.key, String(survRaw ?? ''))}
                              className="rounded-md border border-border px-2 py-1 text-left text-xs transition-colors hover:border-primary">
                              <div className="text-[10px] uppercase text-muted-foreground">Usar do que fica</div>
                              <div className="line-clamp-3 whitespace-pre-wrap">{show(rowsQ.data!.surv, f)}</div>
                            </button>
                            <button type="button" onClick={() => setFinal(f.key, String(dupRaw ?? ''))}
                              className="rounded-md border border-border px-2 py-1 text-left text-xs transition-colors hover:border-primary">
                              <div className="text-[10px] uppercase text-muted-foreground">Usar do descartado</div>
                              <div className="line-clamp-3 whitespace-pre-wrap">{show(rowsQ.data!.dup, f)}</div>
                            </button>
                          </div>
                          {f.kind === 'textarea' ? (
                            <Textarea value={String(finalValue(f) ?? '')} onChange={(e) => setFinal(f.key, e.target.value)} className="min-h-[72px]" />
                          ) : (
                            <Input value={String(finalValue(f) ?? '')} onChange={(e) => setFinal(f.key, e.target.value)} />
                          )}
                          <div className="text-[10px] text-muted-foreground">Valor final — editável (combine ou cole o que quiser).</div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {([false, true] as const).map((fromDup) => {
                            const sideRaw = fromDup ? dupRaw : survRaw
                            const selected = String(finalValue(f) ?? '') === String(sideRaw ?? '')
                            return (
                              <button key={String(fromDup)} type="button"
                                onClick={() => setFinal(f.key, sideRaw)}
                                className={cn('rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                                  selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50')}>
                                <div className="text-[10px] uppercase text-muted-foreground">{fromDup ? 'Descartado' : 'Fica'}</div>
                                <div className="truncate">{show(fromDup ? rowsQ.data!.dup : rowsQ.data!.surv, f)}</div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {tipo !== 'evento' && (
              <p className="text-xs text-muted-foreground">O nome do descartado vira alias do que fica (a busca continua encontrando).</p>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {pick ? (
            <Button variant="ghost" size="sm" onClick={() => setPick(null)} disabled={saving}>Trocar duplicado</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!pick || saving || rowsQ.isLoading || !survivorId || !duplicateId}>
              {saving ? 'Unificando…' : 'Unificar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
