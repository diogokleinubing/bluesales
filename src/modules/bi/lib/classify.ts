// Motor de classificação de segmentos (função pura e testável).
//
// Ordem de prioridade:
//   1. override manual por evento (codigo_evento)
//   2. mapa local -> segmento (local exato)
//   3. regra de palavra-chave no NOME do evento
//   4. regra de palavra-chave no LOCAL
//   5. "Outros"

export const SEGMENTO_PADRAO = 'Outros'

export interface KeywordRule {
  keyword: string
  segmento: string
  ordem?: number
}

export interface ClassifyRules {
  /** codigo_evento -> segmento */
  eventOverrides: Map<string, string>
  /** local (normalizado) -> segmento */
  venueMap: Map<string, string>
  /** regras por palavra no nome do evento */
  keywordRules: KeywordRule[]
  /** regras por palavra no nome do local */
  venueRules: KeywordRule[]
}

export interface ClassifiableEvent {
  codigo_evento: string
  nome: string | null
  local: string | null
}

/** Normaliza texto para comparação (sem acento, minúsculo, trim). */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function sortByOrder(rules: KeywordRule[]): KeywordRule[] {
  return [...rules].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
}

function matchKeyword(text: string, rules: KeywordRule[]): string | null {
  for (const r of sortByOrder(rules)) {
    const kw = norm(r.keyword)
    if (kw && text.includes(kw)) return r.segmento
  }
  return null
}

/** Classifica um evento conforme as regras, na ordem de prioridade. */
export function classifyEvent(
  event: ClassifiableEvent,
  rules: ClassifyRules,
): string {
  // 1. Override manual por evento
  const override = rules.eventOverrides.get(event.codigo_evento)
  if (override) return override

  // 2. Mapa local -> segmento
  const localNorm = norm(event.local)
  if (localNorm) {
    const mapped = rules.venueMap.get(localNorm)
    if (mapped) return mapped
  }

  // 3. Palavra-chave no nome do evento
  const byName = matchKeyword(norm(event.nome), rules.keywordRules)
  if (byName) return byName

  // 4. Palavra-chave no local
  const byVenue = matchKeyword(localNorm, rules.venueRules)
  if (byVenue) return byVenue

  // 5. Padrão
  return SEGMENTO_PADRAO
}

/** Constrói o objeto de regras a partir das linhas das tabelas. */
export function buildRules(input: {
  overrides: { codigo_evento: string; segmento: string }[]
  venueMap: { local: string; segmento: string }[]
  keywordRules: KeywordRule[]
  venueRules: KeywordRule[]
}): ClassifyRules {
  return {
    eventOverrides: new Map(
      input.overrides.map((o) => [o.codigo_evento, o.segmento]),
    ),
    venueMap: new Map(input.venueMap.map((v) => [norm(v.local), v.segmento])),
    keywordRules: input.keywordRules,
    venueRules: input.venueRules,
  }
}
