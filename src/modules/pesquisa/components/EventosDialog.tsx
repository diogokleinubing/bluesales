import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtDate } from '@/lib/format'
import { norm } from '@/modules/bi/lib/classify'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { CopyUrlButton } from './CopyUrlButton'
import { ImportCrmButton } from './ImportCrmButton'
import { faixaPreco } from '../lib/preco'
import { AtracaoDialog } from '@/modules/crm/components/AtracaoDialog'
import {
  useCrmNomes, usePromocoes, useCrmOrgId, promoverOrganizador,
  type CrawledEventRow,
} from '../hooks/usePesquisa'

/** Limpa o nome do evento p/ sugerir o nome da atração (remove o ano). */
function suggestAttr(nome: string | null): string {
  return (nome ?? '')
    .replace(/\b20(2\d|30)\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s|\-–—/]+$/, '')
    .trim()
}

/** Lista os eventos de um local/organizador num dialog (com Copiar URL). */
export function EventosDialog({
  open,
  onOpenChange,
  titulo,
  subtitulo,
  eventos,
  loading = false,
  showOrganizador = true,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  subtitulo?: string
  eventos: CrawledEventRow[]
  /** Enquanto a chamada da API está em andamento, exibe "Carregando…". */
  loading?: boolean
  /** Exibe a coluna Organizador (redundante no diálogo de um organizador). */
  showOrganizador?: boolean
}) {
  const ordenados = [...eventos].sort((a, b) =>
    (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''),
  )
  const [addNome, setAddNome] = useState<string | null>(null)

  // Organizador → CRM: chip verde se já existe (promovido/cadastrado), + p/ importar.
  const qc = useQueryClient()
  const { profile } = useProfile()
  const orgId = useCrmOrgId()
  const crmNomes = useCrmNomes('organizador').data
  const promos = usePromocoes('organizador').data
  const [busyOrg, setBusyOrg] = useState<string | null>(null)

  async function onImportOrg(e: CrawledEventRow) {
    const nome = (e.organizador_raw ?? '').trim()
    if (!nome || !orgId) return
    const chave = nome.toLowerCase()
    setBusyOrg(chave)
    try {
      await promoverOrganizador(orgId, {
        chave, nome,
        cidade: e.cidade ?? null, uf: e.uf ?? null,
        precoMin: e.preco_min, precoMax: e.preco_max, taxaMediaPct: e.taxa_pct,
        eventos: 1, cidades: e.cidade ? [e.cidade] : [], fontes: e.source_nome ? [e.source_nome] : [],
      }, profile?.id ?? null)
      qc.invalidateQueries({ queryKey: ['pesquisa', 'crm-nomes'] })
      qc.invalidateQueries({ queryKey: ['pesquisa', 'promocoes'] })
      toast.success('Organizador copiado para o CRM', { description: nome })
    } catch (err) {
      toast.error('Erro ao copiar', { description: (err as Error).message })
    } finally { setBusyOrg(null) }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[97vw] max-w-[1280px] sm:max-w-[1280px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <Table className="w-full table-fixed">
            <TableHeader><TableRow>
              <TableHead>Evento</TableHead>
              <TableHead className="w-[200px]">Atrações</TableHead>
              {showOrganizador && <TableHead className="w-[200px]">Organizador</TableHead>}
              <TableHead className="w-[110px]">Data</TableHead>
              <TableHead className="w-[150px] text-right">Valor</TableHead>
              <TableHead className="w-[150px]">Fonte</TableHead>
              <TableHead className="w-12" />
            </TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={showOrganizador ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell></TableRow>
              ) : ordenados.length === 0 ? (
                <TableRow><TableCell colSpan={showOrganizador ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  Nenhum evento.
                </TableCell></TableRow>
              ) : ordenados.map((e) => {
                const atr = (e.artistas ?? []).map((a) => a.nome).filter(Boolean)
                return (
                <TableRow key={e.id}>
                  <TableCell className="truncate font-medium" title={e.nome}>{e.nome}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={atr.join(', ') || undefined}>
                    {atr.length > 0 ? atr.join(', ') : (
                      <button
                        type="button"
                        onClick={() => setAddNome(suggestAttr(e.nome))}
                        title="Cadastrar atração"
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
                      >
                        <Plus className="size-4" />
                      </button>
                    )}
                  </TableCell>
                  {showOrganizador && (
                    <TableCell className="text-muted-foreground">
                      {e.organizador_raw ? (() => {
                        const chave = e.organizador_raw.trim().toLowerCase()
                        const promo = !!promos?.has(chave)
                        const noCrm = !promo && !!crmNomes?.has(norm(e.organizador_raw))
                        const href = `/pesquisa/eventos?${new URLSearchParams({ organizador: e.organizador_raw }).toString()}`
                        return (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={href} target="_blank" rel="noreferrer"
                              className="min-w-0 truncate hover:text-primary hover:underline"
                              title={`Ver eventos de ${e.organizador_raw} em Pesquisa`}
                            >
                              {e.organizador_raw}
                            </a>
                            <ImportCrmButton
                              imported={promo} inCrm={noCrm}
                              disabled={busyOrg === chave || !orgId}
                              onImport={() => onImportOrg(e)} className="shrink-0"
                            />
                          </div>
                        )
                      })() : '—'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-muted-foreground">{e.data_inicio ? fmtDate(e.data_inicio) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {e.gratuito ? 'Grátis' : faixaPreco(e.preco_min, e.preco_max)}
                  </TableCell>
                  <TableCell className="truncate">
                    <Badge variant="outline" className="max-w-full truncate">{e.source_nome ?? e.source_slug ?? '—'}</Badge>
                  </TableCell>
                  <TableCell><CopyUrlButton url={e.url_evento} /></TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>

    <AtracaoDialog
      open={addNome != null}
      onOpenChange={(o) => !o && setAddNome(null)}
      initial={{ nome: addNome ?? '' }}
      onSaved={() => setAddNome(null)}
    />
    </>
  )
}
