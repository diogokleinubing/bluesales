// Exportação para Excel via SheetJS. O xlsx é carregado dinamicamente para
// não entrar no bundle das telas que apenas exibem dados.

export interface SheetSpec {
  name: string
  rows: Record<string, unknown>[]
}

/** Exporta uma ou mais abas para um arquivo .xlsx e dispara o download. */
export async function exportToXlsx(
  fileName: string,
  sheets: SheetSpec[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31) || 'Dados')
  }
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
}
