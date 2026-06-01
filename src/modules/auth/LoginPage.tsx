import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { logLogin } from '@/lib/login-log'

export function LoginPage() {
  const { session, loading, signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from =
    (location.state as { from?: string } | null)?.from ?? '/'

  if (!loading && session) return <Navigate to={from} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithPassword(email, password)
    setSubmitting(false)
    if (error) {
      setError('Falha no login. Verifique email e senha.')
      return
    }
    const { data } = await supabase.auth.getUser()
    if (data.user) await logLogin(data.user.id, data.user.email)
    navigate(from, { replace: true })
  }

  return (
    <div className="flex h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-lg bg-primary">
            <Ticket className="size-6 text-primary-foreground" />
          </div>
          <CardTitle>Blueticket</CardTitle>
          <CardDescription>Acesse com seu email e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
