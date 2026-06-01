import { deleteSalesYear } from './rpc'

/**
 * Apaga todas as vendas de um ano (e o rollup do ano) de uma org.
 * Roda no servidor, em lotes, para não estourar o timeout em bases grandes.
 */
export async function deleteYearData(
  orgId: string,
  year: number,
): Promise<void> {
  await deleteSalesYear(orgId, year)
}
