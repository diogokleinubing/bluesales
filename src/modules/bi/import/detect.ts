// Detecção do tipo de uma planilha pelos CABEÇALHOS (não pelo nome da aba).
// Função pura e testável.

export type SheetType = 'eventos' | 'vendas' | 'desconhecido'

/** Quebra um cabeçalho em tokens normalizados (sem acento, minúsculo). */
export function tokenize(header: string): string[] {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

interface SignatureField {
  /** Listas de aliases; cada alias é um conjunto de tokens que deve estar presente. */
  aliases: string[][]
  distinctive: boolean
}

function a(...aliases: string[]): string[][] {
  return aliases.map((s) => tokenize(s))
}

const EVENTOS_SIGNATURE: SignatureField[] = [
  { aliases: a('codigo organizador', 'cod organizador', 'id organizador'), distinctive: true },
  { aliases: a('data evento', 'data do evento', 'mes evento', 'competencia'), distinctive: true },
  { aliases: a('cidade evento', 'cidade', 'municipio'), distinctive: true },
  { aliases: a('uf evento', 'uf', 'estado'), distinctive: true },
  { aliases: a('evento', 'nome evento', 'nome do evento'), distinctive: false },
  { aliases: a('local', 'casa', 'espaco', 'venue'), distinctive: false },
  { aliases: a('codigo evento', 'codigo do evento', 'cod evento', 'id evento'), distinctive: false },
]

const VENDAS_SIGNATURE: SignatureField[] = [
  { aliases: a('valor ingressos', 'valor ingresso', 'ingressos', 'face'), distinctive: true },
  { aliases: a('data venda', 'data da venda', 'data hora'), distinctive: true },
  { aliases: a('tipo pdv', 'pdv', 'canal'), distinctive: true },
  { aliases: a('mdr'), distinctive: true },
  { aliases: a('receita intermediacao', 'intermediacao'), distinctive: true },
  { aliases: a('valor conveniencia', 'conveniencia', 'taxa conveniencia'), distinctive: false },
  { aliases: a('comissao site', 'comissao'), distinctive: false },
  { aliases: a('valor juros', 'juros'), distinctive: false },
  { aliases: a('rebate'), distinctive: false },
  { aliases: a('codigo evento', 'codigo do evento', 'cod evento', 'id evento'), distinctive: false },
]

const W_DISTINCTIVE = 2
const W_NORMAL = 1
const THRESHOLD = 0.25
const DOMINANCE = 1.4

/** Um conjunto de tokens (alias) casa se todos os seus tokens estão no cabeçalho. */
function aliasMatches(headerTokens: string[][], alias: string[]): boolean {
  if (alias.length === 0) return false
  return headerTokens.some((ht) => alias.every((t) => ht.includes(t)))
}

function fieldMatches(headerTokens: string[][], field: SignatureField): boolean {
  return field.aliases.some((alias) => aliasMatches(headerTokens, alias))
}

interface Score {
  score: number
  distinctive: number
}

function scoreType(headerTokens: string[][], sig: SignatureField[]): Score {
  let total = 0
  let matched = 0
  let distinctive = 0
  for (const f of sig) {
    const w = f.distinctive ? W_DISTINCTIVE : W_NORMAL
    total += w
    if (fieldMatches(headerTokens, f)) {
      matched += w
      if (f.distinctive) distinctive++
    }
  }
  return { score: total > 0 ? matched / total : 0, distinctive }
}

export interface DetectionDebug {
  eventos: Score
  vendas: Score
}

/** Detecta o tipo da planilha pelos cabeçalhos. */
export function detectSheetType(headers: string[]): SheetType {
  return detectSheetTypeDebug(headers).type
}

export function detectSheetTypeDebug(headers: string[]): {
  type: SheetType
  debug: DetectionDebug
} {
  const headerTokens = headers.map(tokenize).filter((t) => t.length > 0)
  const eventos = scoreType(headerTokens, EVENTOS_SIGNATURE)
  const vendas = scoreType(headerTokens, VENDAS_SIGNATURE)
  const debug = { eventos, vendas }

  const winner = eventos.score >= vendas.score ? 'eventos' : 'vendas'
  const wScore = Math.max(eventos.score, vendas.score)
  const lScore = Math.min(eventos.score, vendas.score)
  const wDist = winner === 'eventos' ? eventos.distinctive : vendas.distinctive

  if (wScore < THRESHOLD) return { type: 'desconhecido', debug }
  if (wScore >= lScore * DOMINANCE || wDist >= 2)
    return { type: winner, debug }
  return { type: 'desconhecido', debug }
}
