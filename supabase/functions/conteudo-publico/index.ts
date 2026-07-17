// Edge Function pública: retorna UMA matéria de crm_conteudos pelo código, para
// a landing pública /conteudo/:codigo. Usa service_role para ler a tabela (que
// segue sob RLS is_member()). Abre qualquer status (inclusive rascunho) — o
// código é aleatório/não-enumerável, então só acessa quem tem o link. Exclui só
// as deletadas (deleted_at).
//
// Deploy (público, sem exigir JWT):
//   supabase functions deploy conteudo-publico --no-verify-jwt
//   (ou config.toml: [functions.conteudo-publico] verify_jwt = false)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    let codigo = url.searchParams.get('c') || url.searchParams.get('codigo') || ''
    if (!codigo && req.method === 'POST') {
      const b = await req.json().catch(() => ({}))
      codigo = (b?.codigo || b?.c || '') as string
    }
    codigo = codigo.trim()
    if (!codigo) return json({ error: 'missing_code' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data, error } = await supabase
      .from('crm_conteudos')
      .select('codigo, titulo, resumo, corpo, cover_url, created_at')
      .eq('codigo', codigo)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) return json({ error: error.message }, 500)
    if (!data) return json({ error: 'not_found' }, 404)
    return json({ conteudo: data })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
