import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Info,
  KeyRound,
  ShieldOff,
  Copy,
  MoreHorizontal,
  LayoutGrid,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  setUserModules,
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
                <TableHead>Desde</TableHead>
                <TableHead className="text-center">Admin</TableHead>
                <TableHead className="text-center">Gestor</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
                        <ModulesCell user={u} />
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

/**
 * Seletor dos módulos visíveis de um usuário. Sem restrição (todos marcados ou
 * nenhum) é salvo como NULL = "Todos". Marcar um subconjunto restringe a visão.
 */
function ModulesCell({ user }: { user: ProfileRow }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const allIds = MODULES.map((m) => m.id as string)
  const restricted =
    !!user.modules && user.modules.length > 0 && user.modules.length < allIds.length
  const selected = restricted ? user.modules! : allIds
  const label = restricted
    ? MODULES.filter((m) => selected.includes(m.id))
        .map((m) => m.label)
        .join(', ')
    : 'Todos'

  async function toggle(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...selected, id])]
      : selected.filter((m) => m !== id)
    setBusy(true)
    try {
      // Vazio ou todos = sem restrição (NULL).
      await setUserModules(user.id, next.length === allIds.length ? null : next)
      await qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
    } catch (e) {
      toast.error('Erro ao salvar módulos', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="h-8 max-w-[180px] gap-1.5 font-normal"
        >
          <LayoutGrid className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Módulos visíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODULES.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.id}
            checked={selected.includes(m.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => toggle(m.id, !!c)}
            className="gap-2"
          >
            <m.icon className="size-4" />
            {m.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
