import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

/**
 * Portão exibido quando o admin resetou a senha (must_change_password=true).
 * O usuário define uma nova senha antes de acessar o app; ao concluir, limpa o
 * flag via RPC e recarrega o perfil.
 */
export function ForcePasswordChange() {
  const { signOut, refreshProfile } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) {
      setErro('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message)
      const { error: rpcErr } = await supabase.rpc('clear_must_change_password')
      if (rpcErr) throw new Error(rpcErr.message)
      await refreshProfile()
    } catch (err) {
      setErro((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <CardTitle>Defina uma nova senha</CardTitle>
          <CardDescription>
            Sua senha foi redefinida por um administrador. Crie uma nova senha
            para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Ao menos 8 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirma-senha">Confirmar senha</Label>
              <Input
                id="confirma-senha"
                type="password"
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? 'Salvando…' : 'Salvar nova senha'}
              </Button>
              <Button type="button" variant="ghost" onClick={signOut}>
                Sair
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
