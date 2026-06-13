import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, ListOrdered, ListTodo, Pencil,
  Users, Phone, Mail, MessageCircle, StickyNote, CheckSquare, CircleDot, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useProfile } from '../hooks/useProfile'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ActivityDialog } from '../components/ActivityDialog'
import {
  useActivities, createActivity, setActivityRealizada,
  type ActivityFilter, type ActivityRow, type ActivityTipo,
} from '../hooks/useActivities'

// Cor do card por status: realizada (verde) x pendente (âmbar).
const CARD_REALIZADA = 'border-[var(--success)]/40 bg-[var(--success)]/5'
const CARD_PENDENTE = 'border-[var(--warning)]/50 bg-[var(--warning)]/5'

const ICON: Record<ActivityTipo, LucideIcon> = {
  Reunião: Users, Ligação: Phone, Email: Mail, WhatsApp: MessageCircle,
  Nota: StickyNote, Tarefa: CheckSquare, Outro: CircleDot,
}

const pad = (n: number) => String(n).padStart(2, '0')
const localStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function mondayOf(ref: Date) {
  const d = new Date(ref); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const ddmm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** Nome da entidade vinculada (org > evento > local > artista). */
function entityLabel(a: ActivityRow): string | null {
  return a.organization?.nome ?? a.event?.nome ?? a.local?.nome ?? a.artist?.nome ?? null
}

export function Atividades() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const isGestor = profile?.role === 'gestor'

  const [open, setOpen] = useState(false)
  const [editAct, setEditAct] = useState<ActivityRow | null>(null)
  const [view, setView] = useState<'agenda' | 'recentes'>('agenda')
  const [pessoa, setPessoa] = useState<string>('todos') // 'todos' | 'minhas' | <profileId>
  const [weekRef, setWeekRef] = useState<string>(localStr(new Date()))

  // Perfis (só gestor pode filtrar por outra pessoa).
  const profiles = useQuery({
    enabled: isGestor,
    staleTime: 5 * 60 * 1000,
    queryKey: ['crm', 'profiles-all'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome').order('nome')
      return (data ?? []) as { id: string; nome: string | null }[]
    },
  })

  const authorId = pessoa === 'todos' ? undefined : pessoa === 'minhas' ? (profile?.id ?? undefined) : pessoa

  // Semana selecionada.
  const monday = useMemo(() => mondayOf(parseLocal(weekRef)), [weekRef])
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const from = monday.toISOString()
  const to = addDays(monday, 7).toISOString()
  const hojeKey = localStr(new Date())

  const baseFilter: ActivityFilter = { ...(authorId ? { authorId } : {}) }

  function abrirVinculo(a: ActivityRow) {
    if (a.opportunity_id) navigate(`/comercial/oportunidades/${a.opportunity_id}`)
    else if (a.organization_id) navigate(`/comercial/organizacoes/${a.organization_id}`)
  }

  const pessoaSelect = (
    <Select value={pessoa} onValueChange={setPessoa}>
      <SelectTrigger className="h-9 w-48" size="sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos</SelectItem>
        <SelectItem value="minhas">Minhas atividades</SelectItem>
        {isGestor && (profiles.data ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.nome ?? p.id}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {([['agenda', 'Agenda', CalendarDays], ['recentes', 'Recentes', ListOrdered]] as const).map(([v, label, Icon]) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
            view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atividades</h1>
          <p className="text-sm text-muted-foreground">Agenda da semana e atividades recentes.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Registrar atividade</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {viewToggle}
        {pessoaSelect}
        {view === 'agenda' && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-9" onClick={() => setWeekRef(localStr(addDays(monday, -7)))}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setWeekRef(localStr(new Date()))}>Hoje</Button>
            <Button variant="outline" size="icon" className="size-9" onClick={() => setWeekRef(localStr(addDays(monday, 7)))}><ChevronRight className="size-4" /></Button>
            <span className="ml-1 text-sm text-muted-foreground">{ddmm(monday)} – {ddmm(addDays(monday, 6))} · {monday.getFullYear()}</span>
            <Input type="date" value={weekRef} onChange={(e) => e.target.value && setWeekRef(e.target.value)} className="ml-1 h-9 w-[150px]" />
          </div>
        )}
      </div>

      {view === 'agenda' ? (
        <div className="flex flex-col gap-3 lg:flex-row">
          <aside className="lg:w-72 lg:shrink-0">
            <TodoPanel filter={baseFilter} onOpen={abrirVinculo} onEdit={setEditAct} />
          </aside>
          <div className="min-w-0 flex-1">
            <WeekAgenda
              dias={dias}
              hojeKey={hojeKey}
              filter={{ ...baseFilter, from, to, orderBy: 'data_hora' }}
              showAuthor={pessoa === 'todos'}
              onOpen={abrirVinculo}
              onEdit={setEditAct}
            />
          </div>
        </div>
      ) : (
        <Card><CardContent className="p-4">
          <ActivityTimeline filter={{ ...baseFilter, orderBy: 'created_at' }} showOrg />
        </CardContent></Card>
      )}

      <ActivityDialog
        open={open || !!editAct}
        activity={editAct ?? undefined}
        onOpenChange={(o) => { if (!o) { setOpen(false); setEditAct(null) } }}
      />
    </div>
  )
}

/** Backlog de tarefas sem data (To-Do), ao lado do calendário. */
function TodoPanel({ filter, onOpen, onEdit }: { filter: ActivityFilter; onOpen: (a: ActivityRow) => void; onEdit: (a: ActivityRow) => void }) {
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const { profile } = useProfile()
  const { data, isLoading } = useActivities({ ...filter, semData: true, orderBy: 'created_at' })
  const [novo, setNovo] = useState('')

  const pendentes = (data ?? []).filter((a) => !a.realizada)
  const feitas = (data ?? []).filter((a) => a.realizada)

  function refresh() { qc.invalidateQueries({ queryKey: ['crm', 'activities'] }) }

  async function adicionar() {
    if (!orgId || !profile?.id || !novo.trim()) return
    try {
      await createActivity(orgId, profile.id, { tipo: 'Tarefa', data_hora: null, titulo: novo.trim(), participantIds: [] })
      setNovo(''); refresh()
    } catch { /* silencioso */ }
  }
  async function toggle(id: string, v: boolean) { await setActivityRealizada(id, v); refresh() }

  function Item({ a }: { a: ActivityRow }) {
    const sub = entityLabel(a)
    return (
      <div className={cn('group relative rounded-md border p-2', a.realizada ? CARD_REALIZADA : CARD_PENDENTE)}>
        <div className="flex items-start gap-2">
          <Checkbox checked={a.realizada} onCheckedChange={(v) => toggle(a.id, v === true)} className="mt-0.5 size-3.5 shrink-0" />
          <button onClick={() => onOpen(a)} className="min-w-0 flex-1 text-left">
            <div className={cn('truncate text-sm font-medium', a.realizada && 'line-through opacity-70')} title={a.titulo}>{a.titulo}</div>
            {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(a) }} title="Editar"
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <Card className="lg:sticky lg:top-4">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ListTodo className="size-4" /> A fazer {pendentes.length > 0 && <span className="text-muted-foreground">({pendentes.length})</span>}
        </div>
        <div className="flex gap-1.5">
          <Input value={novo} placeholder="Nova tarefa…" onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()} className="h-8" />
          <Button size="icon" className="size-8 shrink-0" onClick={adicionar} disabled={!novo.trim()}><Plus className="size-4" /></Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="max-h-[60vh] space-y-1.5 overflow-auto">
            {pendentes.length === 0 && feitas.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Sem tarefas pendentes.</p>
            )}
            {pendentes.map((a) => <Item key={a.id} a={a} />)}
            {feitas.length > 0 && (
              <>
                <p className="pt-2 text-xs text-muted-foreground">Concluídas</p>
                {feitas.map((a) => <Item key={a.id} a={a} />)}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WeekAgenda({
  dias, hojeKey, filter, showAuthor, onOpen, onEdit,
}: {
  dias: Date[]
  hojeKey: string
  filter: ActivityFilter
  showAuthor: boolean
  onOpen: (a: ActivityRow) => void
  onEdit: (a: ActivityRow) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useActivities(filter)

  async function toggleRealizada(id: string, v: boolean) {
    await setActivityRealizada(id, v)
    qc.invalidateQueries({ queryKey: ['crm', 'activities'] })
  }

  const porDia = useMemo(() => {
    const m = new Map<string, ActivityRow[]>()
    for (const a of data ?? []) {
      if (!a.data_hora) continue
      const k = localStr(new Date(a.data_hora))
      const arr = m.get(k) ?? []
      arr.push(a)
      m.set(k, arr)
    }
    for (const arr of m.values()) arr.sort((x, y) => ((x.data_hora ?? '') < (y.data_hora ?? '') ? -1 : 1))
    return m
  }, [data])

  if (isLoading) return <Skeleton className="h-72 w-full" />

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
      {dias.map((d, i) => {
        const key = localStr(d)
        const acts = porDia.get(key) ?? []
        const hoje = key === hojeKey
        return (
          <div key={key} className="flex min-h-28 min-w-0 flex-col rounded-lg border border-border bg-card">
            <div className={cn('border-b border-border px-2 py-1.5 text-center', hoje && 'bg-primary/10')}>
              <div className="text-[11px] uppercase text-muted-foreground">{WEEKDAYS[i]}</div>
              <div className={cn('text-sm font-semibold', hoje && 'text-primary')}>{pad(d.getDate())}</div>
            </div>
            <div className="flex-1 space-y-1 p-1.5">
              {acts.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">—</p>
              ) : acts.map((a) => {
                const Icon = a.tipo ? ICON[a.tipo] : CircleDot
                const hhmm = a.data_hora ? new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
                return (
                  <div
                    key={a.id}
                    onClick={() => onOpen(a)}
                    className={cn('group cursor-pointer rounded-md border p-1.5 transition-colors hover:border-primary',
                      a.realizada ? CARD_REALIZADA : CARD_PENDENTE)}
                  >
                    <div className="flex items-center justify-between gap-1 text-xs">
                      <div className="flex min-w-0 items-center gap-1">
                        <Icon className="size-3 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums text-muted-foreground">{hhmm}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(a) }} title="Editar"
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                          <Pencil className="size-3" />
                        </button>
                        <Checkbox
                          checked={a.realizada}
                          title={a.realizada ? 'Realizada' : 'Pendente'}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(v) => toggleRealizada(a.id, v === true)}
                          className="size-3.5 shrink-0"
                        />
                      </div>
                    </div>
                    <div className={cn('truncate text-xs font-medium', a.realizada && 'line-through opacity-70')} title={a.titulo}>{a.titulo}</div>
                    {entityLabel(a) && <div className="truncate text-[10px] text-muted-foreground">{entityLabel(a)}</div>}
                    {showAuthor && a.author && <div className="truncate text-[10px] text-muted-foreground">{a.author}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
