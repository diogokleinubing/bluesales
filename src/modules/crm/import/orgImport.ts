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

export interface OrgRow {
  blueticket_code: number
  nome: string
  blueticket_parent_code: number | null
  razao_social: string | null
  documento: string | null
  telefone: string | null
  relationship_user_code: number | null
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
}

const CHUNK = 400

/**
 * Importa as organizações: upsert por (org_id, blueticket_code). Em organizações
 * NOVAS define funil_stage_id = estágio "Inativo"; nas existentes NÃO mexe no
 * estágio (não regride o que já foi promovido). Depois resolve parent_id.
 */
export async function runOrgImport(
  orgId: string,
  rows: OrgRow[],
  inativoStageId: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<OrgImportResult> {
  // 1) Descobre quais codes já existem (para saber quem é novo -> estágio Inativo).
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
  const novosCodes = codes.filter((c) => !existentes.has(c))

  // 2) Upsert de TODOS (sem funil_stage_id — preserva o estágio dos existentes).
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

  // 3) Estágio "Inativo" só nas NOVAS (e que ainda estão sem estágio).
  for (let i = 0; i < novosCodes.length; i += CHUNK) {
    const slice = novosCodes.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('organizations')
      .update({ funil_stage_id: inativoStageId })
      .eq('org_id', orgId).is('funil_stage_id', null).in('blueticket_code', slice)
    if (error) throw new Error(error.message)
  }

  // 4) Resolve parent_id (sub -> principal) a partir do blueticket_parent_code.
  onProgress?.({ phase: 'Vinculando sub-organizações', current: rows.length, total: rows.length })
  const { data: vinc, error: vErr } = await supabase.rpc('resolve_org_parents', { p_org: orgId })
  if (vErr) throw new Error(vErr.message)

  return {
    inseridos: novosCodes.length,
    atualizados: rows.length - novosCodes.length,
    vinculadas: (vinc as number) ?? 0,
  }
}
