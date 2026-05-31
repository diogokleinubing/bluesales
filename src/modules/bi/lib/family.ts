// Associação de eventos recorrentes entre anos ("famílias").
//
// Híbrido: a família é SUGERIDA automaticamente a partir do nome do evento
// (removendo o ano e marcadores de edição), e pode ser AJUSTADA manualmente
// por um override por evento.
//
// Ex.: "Prime Rock Brasil BH 2025" e "Prime Rock Brasil BH 2026"
//      -> ambos viram a família "Prime Rock Brasil BH".

export interface FamilyRules {
  /** codigo_evento -> família (override manual). */
  overrides: Map<string, string>
}

export interface FamiliableEvent {
  codigo_evento: string
  nome: string | null
}

/** Sugere a família a partir do nome: remove ano e marcadores de edição. */
export function familiaFromName(nome: string | null): string | null {
  if (!nome) return null
  let s = nome
  // remove anos 19xx / 20xx
  s = s.replace(/\b(19|20)\d{2}\b/g, ' ')
  // remove marcadores de edição (ex.: "3ª edição", "2 ed", "edicao")
  s = s.replace(/\b\d+\s*[ªºao]?\s*(edicoes|edicao|edição|edicões|ed)\b/gi, ' ')
  s = s.replace(/\b(edicao|edição)\b/gi, ' ')
  // colapsa separadores e espaços
  s = s.replace(/[\s\-–—_|]+/g, ' ').trim()
  // remove pontuação solta nas pontas
  s = s.replace(/^[\s.,;:/-]+|[\s.,;:/-]+$/g, '').trim()
  return s.length ? s : null
}

/** Família final de um evento: override manual tem prioridade sobre a sugestão. */
export function classifyFamilia(
  event: FamiliableEvent,
  rules: FamilyRules,
): string | null {
  const override = rules.overrides.get(event.codigo_evento)
  if (override && override.trim()) return override.trim()
  return familiaFromName(event.nome)
}
