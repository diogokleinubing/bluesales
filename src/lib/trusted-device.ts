// "Lembrar deste navegador" para o 2FA: depois que o usuário passa pelo
// desafio TOTP uma vez neste navegador, marcamos o device como confiável e
// pulamos o desafio nos próximos logins (apenas neste navegador).
//
// Nota de segurança: isso vale só para o DESAFIO recorrente. O cadastro
// inicial do 2FA continua obrigatório, e outros navegadores/dispositivos
// seguem exigindo o código.

const KEY = 'bt-trusted-devices'

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<
      string,
      boolean
    >
  } catch {
    return {}
  }
}

export function isTrustedDevice(userId: string | undefined): boolean {
  if (!userId) return false
  return read()[userId] === true
}

export function trustDevice(userId: string | undefined): void {
  if (!userId) return
  try {
    const all = read()
    all[userId] = true
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

export function untrustDevice(userId: string | undefined): void {
  if (!userId) return
  try {
    const all = read()
    delete all[userId]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}
