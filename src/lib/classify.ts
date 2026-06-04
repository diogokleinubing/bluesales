// Ponto de entrada compartilhado de classificação/normalização.
//
// O motor de classificação de segmento/gênero vive em
// `src/modules/bi/lib/classify.ts` (função pura, testada). Aqui reexportamos
// para um caminho neutro (`@/lib/classify`) usado por BI e Pesquisa, e
// adicionamos o filtro `shouldIgnore` (regras de palavra-chave) — a versão
// server-side (Deno) fica em `supabase/functions/_shared/classify.ts`.

export {
  normalize,
  norm,
  hasYear,
  classifyEvent,
  classifyMany,
  SEGMENTO_PADRAO,
  GENERO_DIVERSOS,
} from '@/modules/bi/lib/classify'
export type {
  ClassSource,
  KeywordRule,
  VenueMapEntry,
  ClassificationRules,
  ClassifiableEvent,
  ClassificationResult,
} from '@/modules/bi/lib/classify'

import { normalize } from '@/modules/bi/lib/classify'

export type IgnoreTipo = 'nome_evento' | 'local' | 'organizador'

export interface IgnoreRule {
  tipo: IgnoreTipo
  keyword: string
  ativo?: boolean
}

export interface IgnoreCheckInput {
  nome?: string | null
  local?: string | null
  organizador?: string | null
}

export interface IgnoreResult {
  ignore: boolean
  motivo: string | null
}

function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

/**
 * Casa a keyword como PALAVRA (não substring): delimitada por início/fim ou
 * caractere não alfanumérico. Evita falsos positivos ("live" em "liveset").
 * Ambos já normalizados (sem acento, minúsculos).
 */
function matchesKeyword(textNorm: string, kwNorm: string): boolean {
  if (!kwNorm) return false
  let from = 0
  for (;;) {
    const i = textNorm.indexOf(kwNorm, from)
    if (i < 0) return false
    const before = i === 0 ? '' : textNorm[i - 1]
    const afterIdx = i + kwNorm.length
    const after = afterIdx >= textNorm.length ? '' : textNorm[afterIdx]
    if (
      (before === '' || !isWordChar(before)) &&
      (after === '' || !isWordChar(after))
    ) {
      return true
    }
    from = i + 1
  }
}

const CAMPO_LABEL: Record<IgnoreTipo, string> = {
  nome_evento: 'nome',
  local: 'local',
  organizador: 'organizador',
}

/**
 * Decide se um evento capturado deve ser ignorado por alguma regra de
 * palavra-chave. Retorna o motivo (ex.: "nome contém 'curso'") para auditoria.
 * Online/gratuito são descartados ANTES (no scraper) e não passam por aqui.
 */
export function shouldIgnore(
  ev: IgnoreCheckInput,
  rules: IgnoreRule[],
): IgnoreResult {
  const fields: Record<IgnoreTipo, string> = {
    nome_evento: normalize(ev.nome),
    local: normalize(ev.local),
    organizador: normalize(ev.organizador),
  }
  for (const r of rules) {
    if (r.ativo === false) continue
    const text = fields[r.tipo]
    if (!text) continue
    if (matchesKeyword(text, normalize(r.keyword))) {
      return {
        ignore: true,
        motivo: `${CAMPO_LABEL[r.tipo]} contém "${r.keyword}"`,
      }
    }
  }
  return { ignore: false, motivo: null }
}
