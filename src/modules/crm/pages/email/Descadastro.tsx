import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-unsubscribe`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Landing pública de descadastro (opt-out) — abre pelo link do rodapé dos emails. */
export function Descadastro() {
  const { rid } = useParams<{ rid: string }>()
  const q = useQuery({
    enabled: !!rid,
    retry: false,
    queryKey: ['descadastro', rid],
    queryFn: async (): Promise<{ email?: string }> => {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ rid }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Erro ao processar')
      return body as { email?: string }
    },
  })

  return (
    <div className="min-h-screen bg-[#edeef2] text-[#1a1c23]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <img src="https://cdn.blueticket.com.br/assets/bt-logo-azul.png" alt="Blueticket" className="h-7 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-16">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm sm:p-10">
          {q.isLoading ? (
            <p className="text-black/60">Processando seu descadastro…</p>
          ) : q.isError ? (
            <>
              <h1 className="text-xl font-semibold">Não foi possível processar</h1>
              <p className="mt-2 text-sm text-black/60">
                Tente novamente pelo link do email. Se o problema continuar, responda ao email que enviamos.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Você foi descadastrado</h1>
              <p className="mt-3 text-base text-black/60">
                {q.data?.email ? (
                  <>
                    <strong className="text-black/80">{q.data.email}</strong> não receberá mais nossos e-mails.
                  </>
                ) : (
                  'Você não receberá mais nossos e-mails.'
                )}
              </p>
              <p className="mt-3 text-sm text-black/45">Mudou de ideia? Fale com o nosso time comercial.</p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
