import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
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
import { trustDevice } from '@/lib/trusted-device'

/**
 * Portão de 2FA. Renderizado dentro da área protegida quando:
 * - needsMfaEnroll: usuário sem fator -> obrigatório cadastrar (1º login)
 * - needsMfaChallenge: tem fator, sessão em aal1 -> pedir o código
 *
 * Ao concluir (enroll ou challenge), marca este navegador como confiável para
 * pular o desafio nos próximos logins (apenas neste navegador).
 */
export function MfaGate() {
  const { needsMfaEnroll, user, signOut, refreshMfa } = useAuth()

  function handleDone() {
    trustDevice(user?.id)
    refreshMfa()
  }

  return needsMfaEnroll ? (
    <Shell title="Configurar verificação em duas etapas">
      <EnrollFlow onDone={handleDone} onCancel={signOut} />
    </Shell>
  ) : (
    <Shell title="Verificação em duas etapas">
      <ChallengeFlow onDone={handleDone} onCancel={signOut} />
    </Shell>
  )
}

function Shell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-lg bg-primary">
            <ShieldCheck className="size-6 text-primary-foreground" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Use um app autenticador (Google Authenticator, Authy, 1Password).
          </CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

function EnrollFlow({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      // Remove fatores não verificados pendentes (evita "already exists").
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      })
      if (error) {
        setError(error.message)
        return
      }
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
    })()
  }, [])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data: challenge, error: chErr } =
      await supabase.auth.mfa.challenge({ factorId })
    if (chErr || !challenge) {
      setError(chErr?.message ?? 'Falha ao iniciar verificação.')
      setBusy(false)
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    setBusy(false)
    if (vErr) {
      setError('Código inválido. Tente novamente.')
      return
    }
    onDone()
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {qr ? (
        <div className="flex flex-col items-center gap-2">
          <img
            src={qr}
            alt="QR code 2FA"
            className="size-44 rounded bg-white p-2"
          />
          <p className="text-center text-xs text-muted-foreground">
            Escaneie o QR ou use a chave:
            <br />
            <code className="break-all">{secret}</code>
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Gerando…</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">Código de 6 dígitos</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || !factorId}>
        {busy ? 'Verificando…' : 'Ativar 2FA'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={onCancel}
      >
        Sair
      </Button>
    </form>
  )
}

function ChallengeFlow({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data: list } = await supabase.auth.mfa.listFactors()
    const factor = (list?.totp ?? []).find((f) => f.status === 'verified')
    if (!factor) {
      setError('Nenhum fator 2FA encontrado.')
      setBusy(false)
      return
    }
    const { data: challenge, error: chErr } =
      await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (chErr || !challenge) {
      setError(chErr?.message ?? 'Falha ao iniciar verificação.')
      setBusy(false)
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: code.trim(),
    })
    setBusy(false)
    if (vErr) {
      setError('Código inválido. Tente novamente.')
      return
    }
    onDone()
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Código de 6 dígitos</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Verificando…' : 'Verificar'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={onCancel}
      >
        Sair
      </Button>
    </form>
  )
}
