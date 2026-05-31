import { supabase } from '@/lib/supabase'
import type { ProvisioningRow, Status } from '@/lib/database.types'

export async function fetchProvisioning(
  orgId: string,
  baseYear: number,
  targetYear: number,
): Promise<ProvisioningRow[]> {
  const { data, error } = await supabase
    .from('provisioning')
    .select('*')
    .eq('org_id', orgId)
    .eq('base_year', baseYear)
    .eq('target_year', targetYear)
  if (error) throw new Error(error.message)
  return (data ?? []) as ProvisioningRow[]
}

export async function upsertProvisioning(input: {
  orgId: string
  baseYear: number
  targetYear: number
  itemKey: string
  nome?: string | null
  status?: Status
  forecast?: number
}) {
  const { error } = await supabase.from('provisioning').upsert(
    {
      org_id: input.orgId,
      base_year: input.baseYear,
      target_year: input.targetYear,
      item_key: input.itemKey,
      nome: input.nome ?? null,
      status: input.status ?? 'Ativo',
      forecast: input.forecast ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,base_year,target_year,item_key' },
  )
  if (error) throw new Error(error.message)
}

export async function deleteProvisioning(id: string) {
  const { error } = await supabase.from('provisioning').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
