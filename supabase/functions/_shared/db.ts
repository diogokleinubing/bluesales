import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { RawEvent } from './types.ts'

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

export interface UpsertResult {
  novo: boolean
  mudancas: number
}

/**
 * Insere ou atualiza um crawled_event deduplicando por (org_id, url_evento).
 * Em update, detecta mudanças relevantes (preço/data/local) e registra em
 * crawled_event_changes. Atualiza ultima_vez_visto sempre.
 */
export async function upsertCrawledEvent(
  db: SupabaseClient,
  orgId: string,
  sourceId: string,
  ev: RawEvent,
  ignorado: { ignore: boolean; motivo: string | null },
): Promise<UpsertResult> {
  const nowIso = new Date().toISOString()

  const { data: existing } = await db
    .from('crawled_events')
    .select('id, preco_min, preco_max, data_inicio, local_raw')
    .eq('org_id', orgId)
    .eq('url_evento', ev.url_evento)
    .maybeSingle()

  const base = {
    nome: ev.nome,
    data_inicio: ev.data_inicio ?? null,
    data_fim: ev.data_fim ?? null,
    organizador_raw: ev.organizador_raw ?? null,
    organizador_url: ev.organizador_url ?? null,
    local_raw: ev.local_raw ?? null,
    cidade: ev.cidade ?? null,
    uf: ev.uf ?? null,
    preco_min: ev.preco_min ?? null,
    preco_max: ev.preco_max ?? null,
    gratuito: ev.gratuito ?? false,
    online: ev.online ?? false,
    imagem_url: ev.imagem_url ?? null,
    descricao: ev.descricao ?? null,
    raw: ev.raw ?? null,
    ignorado: ignorado.ignore,
    ignorado_motivo: ignorado.motivo,
    ultima_vez_visto: nowIso,
  }

  if (!existing) {
    await db.from('crawled_events').insert({
      org_id: orgId,
      source_id: sourceId,
      url_evento: ev.url_evento,
      primeira_vez_visto: nowIso,
      ...base,
    })
    return { novo: true, mudancas: 0 }
  }

  // Detecta mudanças relevantes.
  const changes: { campo: string; antigo: string | null; novo: string | null }[] = []
  const cmp = (campo: string, antigo: unknown, novo: unknown) => {
    const a = antigo == null ? null : String(antigo)
    const n = novo == null ? null : String(novo)
    if (a !== n) changes.push({ campo, antigo: a, novo: n })
  }
  cmp('preco_min', existing.preco_min, base.preco_min)
  cmp('preco_max', existing.preco_max, base.preco_max)
  cmp('data_inicio', existing.data_inicio, base.data_inicio)
  cmp('local_raw', existing.local_raw, base.local_raw)

  await db.from('crawled_events').update(base).eq('id', existing.id)

  if (changes.length) {
    await db.from('crawled_event_changes').insert(
      changes.map((c) => ({
        crawled_event_id: existing.id,
        campo: c.campo,
        valor_antigo: c.antigo,
        valor_novo: c.novo,
      })),
    )
  }
  return { novo: false, mudancas: changes.length }
}
