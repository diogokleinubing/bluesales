import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOrganizations, createOrganization } from '../hooks/useOrganizations'
import { useCrmOrgId } from '../hooks/useFunnelStages'
import { ClasseBadge } from '../components/ClasseBadge'
import { fmtDate } from '@/lib/format'

const CLASSES = ['A+', 'A', 'B', 'C']
const ALL = '__all__'

export function Organizacoes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const orgId = useCrmOrgId()
  const [params] = useSearchParams()
  const biOrganizador = params.get('bi_organizador') ?? ''

  const { data, isLoading } = useOrganizations()
  const [search, setSearch] = useState(biOrganizador)
  const [classe, setClasse] = useState<string>(ALL)
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (o) =>
        (!q || o.nome.toLowerCase().includes(q)) &&
        (classe === ALL || o.classificacao === classe),
    )
  }, [data, search, classe])

  async function criar() {
    if (!orgId || !novoNome.trim()) return
    try {
      const id = await createOrganization(orgId, { nome: novoNome.trim() })
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] })
      setNovoOpen(false)
      setNovoNome('')
      navigate(`/comercial/organizacoes/${id}`)
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizações</h1>
          <p className="text-sm text-muted-foreground">
            {data?.length ?? 0} organizações.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="size-4" /> Nova organização
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={classe} onValueChange={setClasse}>
            <SelectTrigger className="h-9 w-40" size="sm">
              <SelectValue placeholder="Classificação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as classes</SelectItem>
              {CLASSES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Estrutura</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead>Última atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhuma organização — adicione a primeira.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/comercial/organizacoes/${o.id}`)}
                  >
                    <TableCell className="font-medium">{o.nome}</TableCell>
                    <TableCell>
                      <ClasseBadge classe={o.classificacao} />
                    </TableCell>
                    <TableCell>
                      {[o.cidade, o.uf].filter(Boolean).join('/') || '—'}
                    </TableCell>
                    <TableCell>{o.estrutura ?? '—'}</TableCell>
                    <TableCell>
                      {o.stageNome ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: o.stageCor ?? 'var(--muted-foreground)' }}
                          />
                          {o.stageNome}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.ultimaAtividade ? fmtDate(new Date(o.ultimaAtividade)) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova organização</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Nome da organização"
            value={novoNome}
            autoFocus
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && criar()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={!novoNome.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
