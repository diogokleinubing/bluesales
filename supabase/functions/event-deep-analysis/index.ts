// Edge Function: análise profunda de um evento capturado (Fase 2/3 do Fit Score).
//
// Fluxo (body JSON { eventId }):
//   1. Carrega o evento capturado (url_evento, nome, …) via service_role.
//   2. Re-scrape da página do evento na plataforma (texto + links externos).
//   3. Descobre o site oficial nos links da descrição e raspa também.
//   4. Chama a API da Anthropic (saída estruturada via tool_use) para extrair
//      sinais + veredito de fit (propensão de venda antecipada).
//   5. Grava em event_deep_analysis (upsert por crawled_event_id).
//
// Segurança: exige JWT de usuário autenticado. A ANTHROPIC_API_KEY e a
// SUPABASE_SERVICE_ROLE_KEY ficam nos Secrets do projeto — nunca no front/git.
//
// Deploy: supabase functions deploy event-deep-analysis

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const MODELO = 'claude-opus-4-8'
const MAX_TXT = 12_000

// Domínios que NÃO são "site oficial" do evento (plataformas/redes/buscadores).
const BLOCK = [
  'instagram.com', 'facebook.com', 'fb.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'tiktok.com', 'linkedin.com', 'wa.me', 'whatsapp.com', 't.me', 'google.com', 'goo.gl',
  'spotify.com', 'maps.app.goo.gl', 'linktr.ee', 'sympla.com.br', 'eventbrite.com', 'ingresse.com',
  'ingressonacional.com.br', 'bileto.sympla.com.br', 'ticketmaster', 'ticket360', 'ticketsports',
  'bilheteria', 'eventim', 'shotgun', 'blueticket',
]

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TXT)
}

function extractLinks(html: string): string[] {
  const out = new Set<string>()
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const u = m[1].trim()
    if (/^https?:\/\//i.test(u)) out.add(u)
  }
  return [...out]
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Escolhe o site oficial mais provável entre os links da página. */
function pickOfficial(links: string[], pageHost: string): string | null {
  const cand = links.filter((u) => {
    const h = hostOf(u)
    if (!h || h === pageHost) return false
    return !BLOCK.some((b) => h.includes(b))
  })
  if (cand.length === 0) return null
  // Conta por domínio; o domínio externo mais citado tende a ser o oficial.
  const freq = new Map<string, { url: string; n: number }>()
  for (const u of cand) {
    const h = hostOf(u)
    const e = freq.get(h) ?? { url: u, n: 0 }
    e.n++
    freq.set(h, e)
  }
  return [...freq.values()].sort((a, b) => b.n - a.n)[0]?.url ?? null
}

async function fetchText(url: string): Promise<{ text: string; html: string } | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15_000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlueSalesBot/1.0)' },
    })
    clearTimeout(t)
    if (!res.ok) return null
    const html = await res.text()
    return { text: stripHtml(html), html }
  } catch { return null }
}

const TOOL = {
  name: 'registrar_analise',
  description: 'Registra a análise de fit do evento para prospecção.',
  input_schema: {
    type: 'object',
    properties: {
      fit_score: { type: 'integer', description: '0–100. Quão bem o evento combina com a tese da Blueticket (forte propensão a venda antecipada).' },
      recomendacao: { type: 'string', enum: ['prospectar', 'avaliar', 'descartar'] },
      veredito: { type: 'string', description: '2 a 4 frases justificando o score e a recomendação.' },
      lineup_forca: { type: 'string', enum: ['alta', 'media', 'baixa', 'desconhecida'], description: 'Relevância das atrações/artistas/palestrantes para puxar venda antecipada.' },
      edicao: { type: 'string', description: 'Edição/ano se houver (ex.: "10ª edição", "2026"); vazio se não souber.' },
      multi_dia: { type: 'boolean', description: 'O evento ocorre em múltiplos dias?' },
      indicios_venda_antecipada: { type: 'string', description: 'Evidências de venda antecipada: lotes/1º lote, esgotado, pré-venda, ingresso nominal, assento marcado, etc. Vazio se nenhuma.' },
      preco_resumo: { type: 'string', description: 'Resumo de preços/categorias observados.' },
      publico_estimado: { type: 'string', description: 'Porte/público estimado, se inferível.' },
      official_url: { type: 'string', description: 'URL do site oficial do evento, se identificado; senão vazio.' },
      resumo: { type: 'string', description: '1 a 2 frases descrevendo o evento.' },
    },
    required: ['fit_score', 'recomendacao', 'veredito'],
  },
}

function buildPrompt(ev: Record<string, unknown>, pageTxt: string, oficialUrl: string | null, oficialTxt: string): string {
  return [
    'Você analisa eventos para a Blueticket, uma bilheteria que SÓ tem interesse em eventos com',
    'GRANDE parte das vendas feitas de forma ANTECIPADA (ingresso comprado antes, com planejamento).',
    'Eventos que vendem principalmente na bilheteria/porta — mesmo com volume — NÃO interessam.',
    '',
    'Sinais de FIT (venda antecipada): ticket mais alto; atração/lineup/palestrantes relevantes que',
    'puxam compra com antecedência; assento marcado; venda por lotes/pré-venda; esgotamento prévio;',
    'festivais/conferências consolidados (edições anuais). Sinais CONTRA: ticket muito baixo, atração',
    'fraca, público de impulso/balada, compra na porta.',
    '',
    `EVENTO CAPTURADO:\n- Nome: ${ev.nome ?? ''}\n- Data: ${ev.data_inicio ?? ''}\n- Local: ${ev.local_raw ?? ''} (${ev.cidade ?? ''}/${ev.uf ?? ''})\n- Organizador: ${ev.organizador_raw ?? ''}\n- Preço capturado: ${ev.preco_min ?? '?'}–${ev.preco_max ?? '?'}\n- URL: ${ev.url_evento ?? ''}`,
    ev.vendidos != null
      ? `\nVENDAS CAPTURADAS (sinal forte!): ${ev.vendidos} ingressos vendidos${ev.capacidade_total != null ? ` de ${ev.capacidade_total} (capacidade)` : ''}. Quanto mais perto da data do evento, mais próximo esse número está da venda final — use-o como evidência direta de demanda/venda antecipada.`
      : '',
    '',
    `CONTEÚDO DA PÁGINA DO EVENTO (texto):\n${pageTxt || '(não foi possível raspar)'}`,
    '',
    oficialUrl
      ? `SITE OFICIAL (${oficialUrl}) — texto:\n${oficialTxt || '(não foi possível raspar)'}`
      : 'SITE OFICIAL: não identificado nos links da página.',
    '',
    'Avalie o fit e chame a ferramenta registrar_analise com os campos preenchidos. Seja criterioso:',
    'baixe o score quando faltarem sinais de venda antecipada; só recomende "prospectar" com fit alto.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY não configurada nos Secrets' }, 500)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1) Autenticação do chamador.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) return json({ error: 'Não autenticado' }, 401)

  let body: { eventId?: string }
  try { body = await req.json() } catch { return json({ error: 'Corpo inválido' }, 400) }
  const eventId = body.eventId
  if (!eventId) return json({ error: 'eventId é obrigatório' }, 400)

  // 2) Carrega o evento.
  const { data: ev, error: evErr } = await admin
    .from('crawled_events')
    .select('id, org_id, url_evento, nome, data_inicio, local_raw, cidade, uf, organizador_raw, preco_min, preco_max, vendidos, capacidade_total')
    .eq('id', eventId)
    .maybeSingle()
  if (evErr || !ev) return json({ error: 'Evento não encontrado' }, 404)

  async function gravarErro(msg: string) {
    await admin.from('event_deep_analysis').upsert({
      org_id: ev!.org_id, crawled_event_id: ev!.id, status: 'erro', erro: msg, modelo: MODELO,
      created_at: new Date().toISOString(),
    }, { onConflict: 'crawled_event_id' })
  }

  try {
    // 3) Re-scrape da página do evento.
    const page = await fetchText(ev.url_evento as string)
    const pageHost = hostOf(ev.url_evento as string)
    let oficialUrl: string | null = null
    let oficialTxt = ''
    if (page) {
      oficialUrl = pickOfficial(extractLinks(page.html), pageHost)
      if (oficialUrl) {
        const of = await fetchText(oficialUrl)
        oficialTxt = of?.text ?? ''
      }
    }

    // 4) Chamada à Anthropic com saída estruturada (tool_use forçado).
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2048,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'registrar_analise' },
        messages: [{ role: 'user', content: buildPrompt(ev, page?.text ?? '', oficialUrl, oficialTxt) }],
      }),
    })
    if (!resp.ok) {
      const t = await resp.text()
      await gravarErro(`IA ${resp.status}: ${t.slice(0, 300)}`)
      return json({ error: `Falha na IA (${resp.status})` }, 502)
    }
    const data = await resp.json()
    const block = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    if (!block) { await gravarErro('IA não retornou tool_use'); return json({ error: 'Sem resultado da IA' }, 502) }
    const out = block.input as Record<string, unknown>

    const { official_url, fit_score, recomendacao, veredito, ...sinais } = out
    const row = {
      org_id: ev.org_id,
      crawled_event_id: ev.id,
      status: 'ok',
      fit_score: typeof fit_score === 'number' ? Math.round(fit_score) : null,
      recomendacao: (recomendacao as string) ?? null,
      veredito: (veredito as string) ?? null,
      sinais,
      official_url: (official_url as string) || oficialUrl || null,
      modelo: MODELO,
      erro: null,
      created_at: new Date().toISOString(),
    }
    const { error: upErr } = await admin.from('event_deep_analysis').upsert(row, { onConflict: 'crawled_event_id' })
    if (upErr) return json({ error: upErr.message }, 500)

    return json({ ok: true, analysis: row })
  } catch (e) {
    await gravarErro((e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
