import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Info,
  KeyRound,
  ShieldOff,
  Copy,
  MoreHorizontal,
  LayoutGrid,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import {
  fetchProfiles,
  setAdmin,
  setGestor,
  setUserMenus,
  setUserNome,
  resetUserPassword,
  disableUserMfa,
} from './admin-api'
import { MODULES } from '@/modules/shared/nav'
import type { ProfileRow } from '@/lib/database.types'
import { fmtDate } from '@/lib/format'

export function UsersPanel() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: fetchProfiles,
  })

  const [busyId, setBusyId] = useState<string | null>(null)
  const [tempInfo, setTempInfo] = useState<{ email: string; senha: string } | null>(
    null,
  )

  async function toggleAdmin(id: string, value: boolean) {
    try {
      await setAdmin(id, value)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      toast.success(value ? 'Usuário promovido a admin' : 'Admin removido')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function toggleGestor(id: string, value: boolean) {
    try {
      await setGestor(id, value)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      toast.success(value ? 'Usuário definido como gestor' : 'Gestor removido')
    } catch (e) {
      toast.error('Erro', { description: (e as Error).message })
    }
  }

  async function handleReset(u: ProfileRow) {
    setBusyId(u.id)
    try {
      const senha = await resetUserPassword(u.id)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      setTempInfo({ email: u.email ?? u.id, senha })
    } catch (e) {
      toast.error('Falha ao resetar senha', { description: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDisableMfa(u: ProfileRow) {
    setBusyId(u.id)
    try {
      const removed = await disableUserMfa(u.id)
      toast.success(
        removed > 0
          ? `2FA desligado — o usuário recriará no próximo login.`
          : 'Este usuário não tinha 2FA configurado.',
      )
    } catch (e) {
      toast.error('Falha ao desligar 2FA', { description: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  const users = query.data ?? []

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        A criação e remoção de usuários é feita no painel do Supabase
        (Authentication → Users). Aqui você gerencia o papel, a senha e o 2FA de
        cada usuário.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-center">Admin</TableHead>
                <TableHead className="text-center">Gestor</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum usuário.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === user?.id
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email ?? '—'}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2">
                            você
                          </Badge>
                        )}
                        {u.must_change_password && (
                          <Badge variant="secondary" className="ml-2">
                            troca pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <NomeCell user={u} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={u.is_admin}
                          disabled={isSelf}
                          onCheckedChange={(v) => toggleAdmin(u.id, v)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={u.is_gestor}
                          onCheckedChange={(v) => toggleGestor(u.id, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <AccessCell user={u} />
                      </TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={busyId === u.id}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleReset(u)}>
                                <KeyRound className="size-4" />
                                Resetar senha
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDisableMfa(u)}
                              >
                                <ShieldOff className="size-4" />
                                Desligar 2FA
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TempPasswordDialog info={tempInfo} onClose={() => setTempInfo(null)} />
    </div>
  )
}

/** Edição inline do nome de um usuário (admin). */
function NomeCell({ user }: { user: ProfileRow }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(user.nome ?? '')
  const [busy, setBusy] = useState(false)

  async function salvar() {
    setBusy(true)
    try {
      await setUserNome(user.id, valor)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      setEditing(false)
    } catch (e) {
      toast.error('Erro ao salvar nome', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          className="h-8 max-w-44"
          value={valor}
          autoFocus
          disabled={busy}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvar()
            if (e.key === 'Escape') { setValor(user.nome ?? ''); setEditing(false) }
          }}
        />
        <button onClick={salvar} className="text-muted-foreground hover:text-foreground" title="Salvar">
          <Check className="size-4" />
        </button>
        <button onClick={() => { setValor(user.nome ?? ''); setEditing(false) }} className="text-muted-foreground hover:text-foreground" title="Cancelar">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 text-left hover:text-foreground"
      title="Editar nome"
    >
      <span className={user.nome ? '' : 'text-muted-foreground'}>{user.nome || '—'}</span>
      <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

/**
 * Botão de acesso do usuário. Abre a árvore Módulo ▸ Menus. `menus` NULL =
 * "Todos" (sem restrição de menu). Uma lista = só esses menus.
 */
function AccessCell({ user }: { user: ProfileRow }) {
  const [open, setOpen] = useState(false)
  const restricted = user.menus != null
  const count = restricted ? user.menus!.length : 0
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 max-w-[180px] gap-1.5 font-normal"
        onClick={() => setOpen(true)}
      >
        <LayoutGrid className="size-3.5 shrink-0" />
        <span className="truncate">{restricted ? `${count} ${count === 1 ? 'menu' : 'menus'}` : 'Todos'}</span>
      </Button>
      {open && <AccessDialog user={user} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Árvore de módulos e menus para marcar o que o usuário pode acessar. */
function AccessDialog({ user, onClose }: { user: ProfileRow; onClose: () => void }) {
  const qc = useQueryClient()
  const allItems = useMemo(
    () => MODULES.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.to))),
    [],
  )
  const [sel, setSel] = useState<Set<string>>(() => new Set(user.menus ?? allItems))
  const [busy, setBusy] = useState(false)

  function toggleItem(to: string) {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(to)) n.delete(to)
      else n.add(to)
      return n
    })
  }
  function toggleModule(tos: string[], on: boolean) {
    setSel((prev) => {
      const n = new Set(prev)
      for (const to of tos) if (on) n.add(to); else n.delete(to)
      return n
    })
  }

  async function salvar() {
    setBusy(true)
    try {
      // Todos marcados = sem restrição (NULL).
      const value = sel.size >= allItems.length ? null : Array.from(sel)
      await setUserMenus(user.id, value)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      onClose()
    } catch (e) {
      toast.error('Erro ao salvar acesso', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acesso — {user.email ?? user.nome ?? 'usuário'}</DialogTitle>
          <DialogDescription>
            Marque os módulos e menus que este usuário pode acessar. Tudo marcado = sem restrição.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-muted-foreground">
            {sel.size} de {allItems.length} menus
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSel(new Set(allItems))}>
              Marcar todos
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSel(new Set())}>
              Limpar
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {MODULES.map((m) => {
            const tos = m.groups.flatMap((g) => g.items.map((i) => i.to))
            const selCount = tos.filter((to) => sel.has(to)).length
            const allOn = selCount === tos.length
            const someOn = selCount > 0 && !allOn
            return (
              <div key={m.id} className="overflow-hidden rounded-md border border-border">
                <label className="flex cursor-pointer items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <Checkbox
                    checked={allOn ? true : someOn ? 'indeterminate' : false}
                    onCheckedChange={(c) => toggleModule(tos, c !== false)}
                  />
                  <m.icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{selCount}/{tos.length}</span>
                </label>
                <div className="grid grid-cols-1 gap-0.5 p-2 sm:grid-cols-2">
                  {m.groups.flatMap((g) => g.items).map((it) => (
                    <label key={it.to} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/40">
                      <Checkbox checked={sel.has(it.to)} onCheckedChange={() => toggleItem(it.to)} />
                      <it.icon className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-sm">{it.label}</span>
                      {it.requires && (
                        <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {it.requires}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter className="pt-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Mostra a senha temporária gerada (exibida uma única vez). */
function TempPasswordDialog({
  info,
  onClose,
}: {
  info: { email: string; senha: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Senha temporária gerada</DialogTitle>
          <DialogDescription>
            Repasse esta senha para <strong>{info?.email}</strong>. No próximo
            login o usuário será obrigado a definir uma nova senha. Esta senha
            não será exibida novamente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <code className="flex-1 select-all font-mono text-base">
            {info?.senha}
          </code>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (info?.senha) {
                navigator.clipboard.writeText(info.senha)
                toast.success('Senha copiada')
              }
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Concluído</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
