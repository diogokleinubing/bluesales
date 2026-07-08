import { useMemo, useState } from 'react'
import { List, Kanban, Plus, PieChart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useViewPref, usePersistedState } from '@/modules/crm/hooks/useViewPref'
import { useProjetos } from '../store'
import { filtrarAcoes, contarTarefas, pessoaNome, trilhaDaAcao } from '../lib/compute'
import { STATUS_ORDER, STATUS } from '../types'
import type { Acao } from '../types'
import { PageShell, Segmented, ToolbarSearch, MultiSelect } from '../components/Shell'
import { PessoaAvatar, StatusBadge, TrilhaBadge } from '../components/bits'
import { DivisaoTrabalho } from '../components/DivisaoTrabalho'
import { ProjetosKanban, type Agrupamento } from '../components/ProjetosKanban'
import { AcaoDialog } from '../components/AcaoDialog'

export function Acoes() {
  const store = useProjetos()
  const { areas, objetivos, pessoas, tarefas } = store

  const [view, setView] = useViewPref('projetos-acoes-view', 'kanban')
  const [agrupamento, setAgrupamento] = usePersistedState<Agrupamento>('projetos-acoes-group', 'objetivo')
  const [areaSel, setAreaSel] = usePersistedState<string[]>('projetos-acoes-area', [])
  const [statusSel, setStatusSel] = usePersistedState<string[]>('projetos-acoes-status', [])
  // Visão padrão já filtrada por "você" (usuário logado), quando definido.
  const [respSel, setRespSel] = useState<string[]>(() => (store.currentPessoaId ? [store.currentPessoaId] : []))
  const [mixOn, setMixOn] = usePersistedState<boolean>('projetos-mix-on', false)
  const [colOrderObjetivo, setColOrderObjetivo] = usePersistedState<string[]>('projetos-acoes-colorder-obj', [])
  const [colOrderArea, setColOrderArea] = usePersistedState<string[]>('projetos-acoes-colorder-area', [])

  const [editor, setEditor] = useState<{ acaoId: string | null; preset?: Partial<Acao> } | null>(null)

  // No quadro agrupado por área, o filtro de área é redundante — some e é ignorado.
  const areaFilterHidden = view === 'kanban' && agrupamento === 'area'

  const acoesFiltradas = useMemo(
    () =>
      filtrarAcoes(
        store.acoes,
        { busca: store.busca, areaIds: areaFilterHidden ? [] : areaSel, status: statusSel, responsavelIds: respSel },
        { tarefas, pessoas },
      ),
    [store.acoes, store.busca, areaFilterHidden, areaSel, statusSel, respSel, tarefas, pessoas],
  )

  const temFiltro =
    store.busca.trim() !== '' || (!areaFilterHidden && areaSel.length > 0) || statusSel.length > 0 || respSel.length > 0
  function limpar() {
    store.setBusca('')
    setAreaSel([])
    setStatusSel([])
    setRespSel([])
  }

  const toolbar = (
    <>
      <ToolbarSearch value={store.busca} onChange={store.setBusca} placeholder="Buscar ação, tarefa ou pessoa…" />
      {!areaFilterHidden && (
        <MultiSelect
          label="Área"
          options={areas.map((a) => ({ value: a.id, label: a.nome }))}
          selected={areaSel}
          onChange={setAreaSel}
        />
      )}
      <MultiSelect
        label="Status"
        options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label, color: STATUS[s].cor }))}
        selected={statusSel}
        onChange={setStatusSel}
      />
      <MultiSelect
        label="Responsável"
        options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        selected={respSel}
        onChange={setRespSel}
      />
      {temFiltro && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={limpar}>
          <X className="size-3.5" /> Limpar
        </Button>
      )}
    </>
  )

  const actions = (
    <>
      <Segmented value={view} onChange={setView} options={[
        { v: 'list', label: 'Lista', icon: List },
        { v: 'kanban', label: 'Quadro', icon: Kanban },
      ]} />
      {view === 'kanban' && (
        <Segmented value={agrupamento} onChange={setAgrupamento} options={[
          { v: 'objetivo', label: 'Por objetivo' },
          { v: 'area', label: 'Por área' },
        ]} />
      )}
      <Button
        variant={mixOn ? 'secondary' : 'outline'}
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setMixOn(!mixOn)}
        title="Mostrar a divisão do trabalho por trilha"
      >
        <PieChart className="size-4" /> Divisão do trabalho
      </Button>
      <Button size="sm" className="h-8 gap-1.5" onClick={() => setEditor({ acaoId: null })}>
        <Plus className="size-4" /> Nova ação
      </Button>
    </>
  )

  return (
    <>
      <PageShell
        title="Ações"
        count={`${acoesFiltradas.length} de ${store.acoes.length}`}
        actions={actions}
        toolbar={toolbar}
        banner={mixOn && <DivisaoTrabalho acoes={acoesFiltradas} objetivos={objetivos} />}
      >
        {view === 'kanban' ? (
          <ProjetosKanban
            acoes={acoesFiltradas}
            agrupamento={agrupamento}
            columnOrder={agrupamento === 'objetivo' ? colOrderObjetivo : colOrderArea}
            onColumnOrderChange={agrupamento === 'objetivo' ? setColOrderObjetivo : setColOrderArea}
            onOpen={(id) => setEditor({ acaoId: id })}
            onAdd={(preset) => setEditor({ acaoId: null, preset })}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tarefas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acoesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhuma ação {temFiltro ? 'com esses filtros.' : '— crie a primeira.'}
                  </TableCell>
                </TableRow>
              ) : (
                acoesFiltradas.map((a) => {
                  const trilha = trilhaDaAcao(a, objetivos)
                  const objNome = a.objetivoId ? objetivos.find((o) => o.id === a.objetivoId)?.nome : null
                  const { feitas, total } = contarTarefas(a.id, tarefas)
                  const areaNome = areas.find((ar) => ar.id === a.areaId)?.nome
                  const resp = pessoaNome(a.responsavelId, pessoas)
                  return (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => setEditor({ acaoId: a.id })}>
                      <TableCell className="font-medium">
                        <div className="max-w-[360px] truncate" title={a.titulo}>{a.titulo}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <TrilhaBadge trilha={trilha} />
                          {objNome && <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={objNome}>{objNome}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{areaNome ?? '—'}</TableCell>
                      <TableCell>
                        {resp ? (
                          <span className="inline-flex items-center gap-1.5"><PessoaAvatar nome={resp} /><span className="text-sm">{resp}</span></span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{total > 0 ? `${feitas}/${total}` : '—'}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </PageShell>

      {editor && (
        <AcaoDialog
          open
          onOpenChange={(v) => !v && setEditor(null)}
          acaoId={editor.acaoId}
          preset={editor.preset}
        />
      )}
    </>
  )
}
