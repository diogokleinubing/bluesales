// Motor de classificação de eventos (função pura e testável).
//
// Duas dimensões resolvidas INDEPENDENTEMENTE: segmento e gênero. Para cada
// dimensão, aplica a hierarquia na ordem; uma regra pode preencher só uma das
// duas, e o motor continua descendo para a outra até preencher ou cair no
// fallback.
//
// Hierarquia (por dimensão):
//   1. campo manual do evento (segmento_manual / genero_manual)
//   2. venue_segment_map: match exato no `local`
//   3. keyword_rules: keyword no NOME do evento (menor `ordem` vence)
//   4. venue_rules: keyword no `local` (menor `ordem` vence)
//   5. fallback: segmento = "Outros"; gênero = null

export const SEGMENTO_PADRAO = 'Outros'

/** Gênero atribuído quando o nome reúne artistas de estilos diferentes. */
export const GENERO_DIVERSOS = 'Diversos'

export type ClassSource =
  | 'manual'
  | 'venue_map'
  | 'keyword'
  | 'venue_rule'
  | 'fallback'
  | null

export interface KeywordRule {
  keyword: string
  segmento: string | null
  genero: string | null
  ordem?: number
}

export interface VenueMapEntry {
  local: string
  segmento: string | null
  genero: string | null
}

export interface ClassificationRules {
  keywordRules: KeywordRule[]
  venueRules: KeywordRule[]
  venueMap: VenueMapEntry[]
}

export interface ClassifiableEvent {
  nome: string | null
  local: string | null
  segmento_manual?: string | null
  genero_manual?: string | null
}

export interface ClassificationResult {
  segmento: string | null
  segmentoSource: ClassSource
  genero: string | null
  generoSource: ClassSource
}

/** Normaliza texto para comparação (sem acento, minúsculo, espaços). */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_\s]+/g, ' ')
    .trim()
}

/** Alias histórico usado em outros módulos. */
export const norm = normalize

function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

/**
 * Casa a keyword como PALAVRA (não substring): o trecho precisa estar
 * delimitado por início/fim do texto ou por um caractere não alfanumérico
 * (espaço, pontuação, &, |, /, etc.). Evita falsos positivos como
 * "suel" dentro de "consuelo". Ambos já normalizados (sem acento, minúsculos).
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

function sortByOrder(rules: KeywordRule[]): KeywordRule[] {
  return [...rules].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
}

/** Pré-computa o mapa local-normalizado -> entrada (último vence). */
function buildVenueMapIndex(
  venueMap: VenueMapEntry[],
): Map<string, VenueMapEntry> {
  const m = new Map<string, VenueMapEntry>()
  for (const v of venueMap) m.set(normalize(v.local), v)
  return m
}

/**
 * Classifica um evento nas duas dimensões. `rules` pode ser passado já com o
 * índice de venueMap (ClassificationRules) — recalcula o índice a cada chamada,
 * então para muitos eventos prefira reclassifyMany (abaixo).
 */
export function classifyEvent(
  event: ClassifiableEvent,
  rules: ClassificationRules,
): ClassificationResult {
  return classifyWithIndex(event, {
    keywordRules: sortByOrder(rules.keywordRules),
    venueRules: sortByOrder(rules.venueRules),
    venueIndex: buildVenueMapIndex(rules.venueMap),
  })
}

interface IndexedRules {
  keywordRules: KeywordRule[] // já ordenadas
  venueRules: KeywordRule[] // já ordenadas
  venueIndex: Map<string, VenueMapEntry>
}

function classifyWithIndex(
  event: ClassifiableEvent,
  idx: IndexedRules,
): ClassificationResult {
  const nomeNorm = normalize(event.nome)
  const localNorm = normalize(event.local)

  let segmento: string | null = null
  let segmentoSource: ClassSource = null
  let genero: string | null = null
  let generoSource: ClassSource = null

  // 1. Manual (por dimensão).
  if (event.segmento_manual && event.segmento_manual.trim()) {
    segmento = event.segmento_manual.trim()
    segmentoSource = 'manual'
  }
  if (event.genero_manual && event.genero_manual.trim()) {
    genero = event.genero_manual.trim()
    generoSource = 'manual'
  }

  // 2. venue_segment_map (match exato no local).
  if ((segmento == null || genero == null) && localNorm) {
    const entry = idx.venueIndex.get(localNorm)
    if (entry) {
      if (segmento == null && entry.segmento) {
        segmento = entry.segmento
        segmentoSource = 'venue_map'
      }
      if (genero == null && entry.genero) {
        genero = entry.genero
        generoSource = 'venue_map'
      }
    }
  }

  // 3. keyword_rules (no nome).
  //    segmento: a primeira regra que casa (menor ordem) vence.
  //    genero: junta TODOS os gêneros que casam no nome; se houver mais de um
  //    distinto (line-up com artistas de estilos diferentes) -> "Diversos".
  if (segmento == null || genero == null) {
    const generosNome = new Set<string>()
    for (const r of idx.keywordRules) {
      const kw = normalize(r.keyword)
      if (!matchesKeyword(nomeNorm, kw)) continue
      if (segmento == null && r.segmento) {
        segmento = r.segmento
        segmentoSource = 'keyword'
      }
      if (genero == null && r.genero) generosNome.add(r.genero)
    }
    if (genero == null && generosNome.size > 0) {
      genero = generosNome.size === 1 ? [...generosNome][0] : GENERO_DIVERSOS
      generoSource = 'keyword'
    }
  }

  // 4. venue_rules (no local). Mesma lógica de "Diversos" para o gênero.
  if ((segmento == null || genero == null) && localNorm) {
    const generosLocal = new Set<string>()
    for (const r of idx.venueRules) {
      const kw = normalize(r.keyword)
      if (!matchesKeyword(localNorm, kw)) continue
      if (segmento == null && r.segmento) {
        segmento = r.segmento
        segmentoSource = 'venue_rule'
      }
      if (genero == null && r.genero) generosLocal.add(r.genero)
    }
    if (genero == null && generosLocal.size > 0) {
      genero = generosLocal.size === 1 ? [...generosLocal][0] : GENERO_DIVERSOS
      generoSource = 'venue_rule'
    }
  }

  // 5. Fallback (só segmento).
  if (segmento == null) {
    segmento = SEGMENTO_PADRAO
    segmentoSource = 'fallback'
  }

  return { segmento, segmentoSource, genero, generoSource }
}

/** Classifica muitos eventos reutilizando o índice de regras (perf). */
export function classifyMany(
  events: ClassifiableEvent[],
  rules: ClassificationRules,
): ClassificationResult[] {
  const idx: IndexedRules = {
    keywordRules: sortByOrder(rules.keywordRules),
    venueRules: sortByOrder(rules.venueRules),
    venueIndex: buildVenueMapIndex(rules.venueMap),
  }
  return events.map((e) => classifyWithIndex(e, idx))
}
