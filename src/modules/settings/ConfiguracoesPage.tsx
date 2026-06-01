import { useNavigate } from 'react-router-dom'
import { Monitor, Moon, Sun, LogOut } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { UsersPanel } from './UsersPanel'
import { LoginLogPanel } from './LoginLogPanel'
import { ChangePasswordCard } from './ChangePasswordCard'

const THEME_OPTIONS: {
  value: Theme
  label: string
  icon: typeof Sun
  hint: string
}[] = [
  { value: 'light', label: 'Claro', icon: Sun, hint: 'Sempre claro' },
  { value: 'dark', label: 'Escuro', icon: Moon, hint: 'Sempre escuro' },
  {
    value: 'system',
    label: 'Sistema',
    icon: Monitor,
    hint: 'Segue o sistema operacional',
  },
]

export function ConfiguracoesPage() {
  const { theme, setTheme } = useTheme()
  const { user, isAdmin, hasMfa, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Preferências do seu ambiente.
        </p>
      </div>

      <Tabs defaultValue="aparencia">
        <TabsList>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="conta">Conta</TabsTrigger>
          {isAdmin && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
          {isAdmin && <TabsTrigger value="logs">Acessos</TabsTrigger>}
        </TabsList>

        {/* Aparência */}
        <TabsContent value="aparencia" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tema</CardTitle>
              <CardDescription>Escolha o tema da interface.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={theme}
                onValueChange={(v) => setTheme(v as Theme)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                {THEME_OPTIONS.map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`theme-${opt.value}`}
                    className={cn(
                      'flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-4 transition-colors',
                      theme === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <opt.icon className="size-5" />
                      <RadioGroupItem
                        id={`theme-${opt.value}`}
                        value={opt.value}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.hint}
                      </div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conta */}
        <TabsContent value="conta" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta</CardTitle>
              <CardDescription>Dados da sua sessão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="text-sm">{user?.email ?? '—'}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Perfil</Label>
                <div className="flex items-center gap-2">
                  <Badge variant={isAdmin ? 'default' : 'secondary'}>
                    {isAdmin ? 'Administrador' : 'Usuário'}
                  </Badge>
                  <Badge variant={hasMfa ? 'secondary' : 'outline'}>
                    {hasMfa ? '2FA ativo' : '2FA pendente'}
                  </Badge>
                </div>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </CardContent>
          </Card>

          <div className="mt-4">
            <ChangePasswordCard />
          </div>
        </TabsContent>

        {/* Usuários (admin) */}
        {isAdmin && (
          <TabsContent value="usuarios" className="mt-4">
            <UsersPanel />
          </TabsContent>
        )}

        {/* Acessos (admin) */}
        {isAdmin && (
          <TabsContent value="logs" className="mt-4">
            <LoginLogPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
