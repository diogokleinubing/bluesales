import { useNavigate } from 'react-router-dom'
import {
  Settings,
  LogOut,
  Monitor,
  Moon,
  Sun,
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
import { useAuth } from '@/lib/auth'
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
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

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
              {user?.email?.split('@')[0] ?? 'Usuário'}
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
    </div>
  )
}
