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

/** Tamanho máximo da família (cabe no índice B-tree e é suficiente p/ agrupar). */
export const FAMILIA_MAX = 200

function cap(s: string): string {
  return s.length > FAMILIA_MAX ? s.slice(0, FAMILIA_MAX).trim() : s
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
  return s.length ? cap(s) : null
}

/** Maior prefixo de PALAVRAS em comum entre os nomes. */
export function commonWordPrefix(names: string[]): string {
  const lists = names
    .filter(Boolean)
    .map((n) => n.trim().split(/\s+/).filter(Boolean))
  if (lists.length === 0) return ''
  const first = lists[0]
  let i = 0
  for (; i < first.length; i++) {
    const tok = first[i].toLowerCase()
    if (!lists.every((l) => (l[i] ?? '').toLowerCase() === tok)) break
  }
  return first.slice(0, i).join(' ')
}

/** Sugere a família a partir do trecho em comum dos nomes (sem o ano). */
export function suggestFamily(names: string[]): string {
  const valid = names.filter(Boolean)
  if (valid.length === 0) return ''
  // Um único evento: sugere a família dele. Vários: só o trecho em comum
  // (se não houver nada em comum, não sugere nada).
  if (valid.length === 1) return familiaFromName(valid[0]) ?? ''
  const prefix = commonWordPrefix(valid)
  return prefix ? (familiaFromName(prefix) ?? '') : ''
}

/** Família final de um evento: override manual tem prioridade sobre a sugestão. */
export function classifyFamilia(
  event: FamiliableEvent,
  rules: FamilyRules,
): string | null {
  const override = rules.overrides.get(event.codigo_evento)
  if (override && override.trim()) return cap(override.trim())
  return familiaFromName(event.nome)
}
