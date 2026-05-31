import { supabase } from '@/lib/supabase'

/** Apaga todas as vendas de um ano (pela data_venda) de uma org. */
export async function deleteYearData(
  orgId: string,
  year: number,
): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('org_id', orgId)
    .gte('data_venda', `${year}-01-01T00:00:00Z`)
    .lt('data_venda', `${year + 1}-01-01T00:00:00Z`)
  if (error) throw new Error(error.message)
}
