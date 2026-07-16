import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { renderMarkdown } from '@/lib/markdown'

interface ConteudoPub {
  codigo: string
  titulo: string
  resumo: string | null
  corpo: string | null
  cover_url: string | null
  created_at: string
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conteudo-publico`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Landing pública de uma matéria (novidade/dica) — sem índice/navegação. */
export function ConteudoPublico() {
  const { codigo } = useParams<{ codigo: string }>()
  const q = useQuery({
    enabled: !!codigo,
    retry: false,
    queryKey: ['conteudo-publico', codigo],
    queryFn: async (): Promise<ConteudoPub | null> => {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ codigo }),
      })
      if (res.status === 404) return null
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Erro ao carregar')
      return (body.conteudo ?? null) as ConteudoPub | null
    },
  })

  const c = q.data

  return (
    <div className="min-h-screen bg-[#edeef2] text-[#1a1c23]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4 text-lg font-bold" style={{ color: '#2f6df6' }}>Blueticket</div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">
        {q.isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-2/3 animate-pulse rounded bg-black/10" />
            <div className="h-48 w-full animate-pulse rounded-lg bg-black/10" />
            <div className="h-4 w-full animate-pulse rounded bg-black/10" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-black/10" />
          </div>
        ) : !c ? (
          <div className="py-20 text-center">
            <h1 className="text-xl font-semibold">Conteúdo não encontrado</h1>
            <p className="mt-2 text-sm text-black/60">Este conteúdo não existe ou não está mais disponível.</p>
          </div>
        ) : (
          <article className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            {c.cover_url && (
              <img src={c.cover_url} alt="" className="mb-6 w-full rounded-xl object-cover" />
            )}
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{c.titulo || 'Sem título'}</h1>
            {c.resumo && <p className="mt-3 text-base text-black/60">{c.resumo}</p>}
            <div className="prose-conteudo mt-6" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.corpo) }} />
          </article>
        )}
      </main>
    </div>
  )
}
