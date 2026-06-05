import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings,
  LogOut,
  Monitor,
  Moon,
  Sun,
  KeyRound,
  Pencil,
  ChevronsUpDown,
  Check,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useProfile } from '@/modules/crm/hooks/useProfile'
import { setMyNome } from '@/modules/settings/admin-api'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

function initials(email: string | undefined): string {
  if (!email) return '?'
  const name = email.split('@')[0]
  const parts = name.split(/[.\-_]+/).filter(Boolean)
  const chars =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return chars.toUpperCase()
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

export function UserMenu() {
  const { user, isAdmin, signOut } = useAuth()
  const { profile } = useProfile()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [pwOpen, setPwOpen] = useState(false)
  const [nomeOpen, setNomeOpen] = useState(false)
  const displayName = profile?.nome || user?.email?.split('@')[0] || 'Usuário'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials(user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {displayName}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {user?.email}
            </div>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          className="w-56"
        >
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/configuracoes')}>
                <Settings className="size-4" />
                Configurações
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setNomeOpen(true)}>
              <Pencil className="size-4" />
              Editar nome
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
              <KeyRound className="size-4" />
              Trocar senha
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="size-4" />
                Tema
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {THEME_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                  >
                    <opt.icon className="size-4" />
                    {opt.label}
                    <Check
                      className={cn(
                        'ml-auto size-4',
                        theme === opt.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditarNomeDialog open={nomeOpen} onOpenChange={setNomeOpen} nomeAtual={profile?.nome ?? ''} />
      <TrocarSenhaDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  )
}

/** Diálogo para o usuário logado editar o próprio nome. */
function EditarNomeDialog({
  open,
  onOpenChange,
  nomeAtual,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  nomeAtual: string
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(nomeAtual)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setNome(nomeAtual)
  }, [open, nomeAtual])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await setMyNome(nome)
      await qc.invalidateQueries({ queryKey: ['crm', 'profile'] })
      toast.success('Nome atualizado.')
      onOpenChange(false)
    } catch (err) {
      toast.error('Erro ao salvar nome', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setNome(nomeAtual)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar nome</DialogTitle>
          <DialogDescription>Como seu nome aparece na plataforma.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="menu-nome">Nome</Label>
            <Input id="menu-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Diálogo para o usuário logado trocar a própria senha. */
function TrocarSenhaDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 8) return toast.error('A senha deve ter ao menos 8 caracteres.')
    if (senha !== confirma) return toast.error('As senhas não conferem.')
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message)
      toast.success('Senha alterada com sucesso.')
      setSenha('')
      setConfirma('')
      onOpenChange(false)
    } catch (err) {
      toast.error('Erro ao alterar senha', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { setSenha(''); setConfirma('') }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
          <DialogDescription>Defina uma nova senha de acesso. Mínimo de 8 caracteres.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="menu-nova-senha">Nova senha</Label>
            <Input id="menu-nova-senha" type="password" autoComplete="new-password" autoFocus
              value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-confirma-senha">Confirmar senha</Label>
            <Input id="menu-confirma-senha" type="password" autoComplete="new-password"
              value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
