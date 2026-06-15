import { supabase } from '@/lib/supabase'
import { autoMap } from '@/modules/bi/import/parse'
import type { ColumnMap, SheetData, ImportProgress } from '@/modules/bi/import/types'
import { ORG_FIELDS, type OrgField } from './orgTypes'

export function autoMapOrgs(headers: string[]): ColumnMap<OrgField> {
  return autoMap(headers, ORG_FIELDS)
}

function cell(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : null
}
function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}
/** Código inteiro positivo; 0/negativo/vazio -> null. */
function intOrNull(v: unknown): number | null {
  if (v == null) return null
  const digits = String(v).trim().replace(/[^\d-]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}
/** Extrai o ano (19xx/20xx) de "2019", "01/03/2019", "2019-05-01"… senão null. */
function yearOrNull(v: unknown): number | null {
  if (v == null) return null
  const m = String(v).match(/(19|20)\d{2}/)
  if (!m) return null
  const n = Number(m[0])
  return n >= 1990 && n <= 2100 ? n : null
}

export interface OrgRow {
  blueticket_code: number
  nome: string
  blueticket_parent_code: number | null
  razao_social: string | null
  documento: string | null
  telefone: string | null
  relationship_user_code: number | null
  categoria_comercial: string | null
  cliente_desde: number | null
  cidade: string | null
  uf: string | null
}

export interface OrgBuildResult {
  rows: OrgRow[]
  ignoradas: number // linhas sem código ou sem nome
}

/** Lê as linhas válidas (dedup por blueticket_code, último vence). */
export function buildOrgRows(sheet: SheetData, map: ColumnMap<OrgField>): OrgBuildResult {
  const byCode = new Map<number, OrgRow>()
  let ignoradas = 0
  for (const row of sheet.rows) {
    const code = intOrNull(cell(row, map.blueticket_code))
    const nome = strOrNull(cell(row, map.nome))
    if (code == null || !nome) { ignoradas++; continue }
    const uf = strOrNull(cell(row, map.uf))
    byCode.set(code, {
      blueticket_code: code,
      nome,
      blueticket_parent_code: intOrNull(cell(row, map.blueticket_parent_code)),
      razao_social: strOrNull(cell(row, map.razao_social)),
      documento: strOrNull(cell(row, map.documento)),
      telefone: strOrNull(cell(row, map.telefone)),
      relationship_user_code: intOrNull(cell(row, map.relationship_user_code)),
      categoria_comercial: strOrNull(cell(row, map.categoria_comercial)),
      cliente_desde: yearOrNull(cell(row, map.cliente_desde)),
      cidade: strOrNull(cell(row, map.cidade)),
      uf: uf ? uf.toUpperCase().slice(0, 2) : null,
    })
  }
  return { rows: [...byCode.values()], ignoradas }
}

export interface OrgImportResult {
  inseridos: number
  atualizados: number
  vinculadas: number // sub-orgs com parent_id resolvido
  ativadas: number // marcadas Ativo por venda 2024+
  classes: number // classes atualizadas via categoria_comercial
}

const CHUNK = 400
const ATIVO_DESDE = 2024

/**
 * Importa as organizações: upsert por (org_id, blueticket_code). Depois resolve
 * parent_id (sub -> principal), atualiza a classe a partir de categoria_comercial
 * e marca Ativo quem teve venda no BI de ATIVO_DESDE em diante.
 */
export async function runOrgImport(
  orgId: string,
  rows: OrgRow[],
  onProgress?: (p: ImportProgress) => void,
  opts?: { setClienteDesde?: boolean },
): Promise<OrgImportResult> {
  // 1) Quais codes já existem (para contagem novas x atualizadas).
  const codes = rows.map((r) => r.blueticket_code)
  const existentes = new Set<number>()
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('organizations').select('blueticket_code')
      .eq('org_id', orgId).in('blueticket_code', slice)
    if (error) throw new Error(error.message)
    for (const d of data ?? []) existentes.add(d.blueticket_code as number)
  }
  const novos = codes.filter((c) => !existentes.has(c)).length

  // 2) Upsert de TODOS (sem mexer em estágio/status — preserva dados do CRM).
  let processados = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const payload = slice.map((r) => ({
      org_id: orgId,
      blueticket_code: r.blueticket_code,
      nome: r.nome,
      blueticket_parent_code: r.blueticket_parent_code,
      razao_social: r.razao_social,
      documento: r.documento,
      telefone: r.telefone,
      relationship_user_code: r.relationship_user_code,
      // Só grava cliente_desde quando a coluna foi mapeada (evita zerar valores
      // já existentes ao reimportar um arquivo sem essa coluna).
      ...(opts?.setClienteDesde ? { cliente_desde: r.cliente_desde } : {}),
      cidade: r.cidade,
      uf: r.uf,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('organizations').upsert(payload, { onConflict: 'org_id,blueticket_code' })
    if (error) throw new Error(error.message)
    processados += slice.length
    onProgress?.({ phase: 'Importando organizações', current: processados, total: rows.length })
  }

  // 3) Resolve parent_id (sub -> principal) a partir do blueticket_parent_code.
  onProgress?.({ phase: 'Vinculando sub-organizações', current: rows.length, total: rows.length })
  const { data: vinc, error: vErr } = await supabase.rpc('resolve_org_parents', { p_org: orgId })
  if (vErr) throw new Error(vErr.message)

  // 4) Atualiza a classe (categoria_comercial), apenas onde veio valor.
  const comClasse = rows.filter((r) => r.categoria_comercial)
  let classes = 0
  if (comClasse.length > 0) {
    const { data: nClasse, error: cErr } = await supabase.rpc('set_org_classificacao', {
      p_org: orgId,
      p_codes: comClasse.map((r) => r.blueticket_code),
      p_classes: comClasse.map((r) => r.categoria_comercial as string),
    })
    if (cErr) throw new Error(cErr.message)
    classes = (nClasse as number) ?? 0
  }

  // 5) Marca Ativo quem teve venda 2024+ (só quem está sem status).
  const { data: nAtivo, error: aErr } = await supabase.rpc('mark_orgs_active_by_sales', {
    p_org: orgId, p_min_year: ATIVO_DESDE,
  })
  if (aErr) throw new Error(aErr.message)

  return {
    inseridos: novos,
    atualizados: rows.length - novos,
    vinculadas: (vinc as number) ?? 0,
    ativadas: (nAtivo as number) ?? 0,
    classes,
  }
}
