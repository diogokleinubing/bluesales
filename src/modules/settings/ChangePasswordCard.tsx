import { useState } from 'react'
import { toast } from 'sonner'
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

/** Permite ao usuário logado trocar a própria senha. */
export function ChangePasswordCard() {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 8) {
      toast.error('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (senha !== confirma) {
      toast.error('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message)
      toast.success('Senha alterada com sucesso.')
      setSenha('')
      setConfirma('')
    } catch (err) {
      toast.error('Erro ao alterar senha', {
        description: (err as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar senha</CardTitle>
        <CardDescription>
          Defina uma nova senha de acesso. Mínimo de 8 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conta-nova-senha">Nova senha</Label>
            <Input
              id="conta-nova-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conta-confirma-senha">Confirmar senha</Label>
            <Input
              id="conta-confirma-senha"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
