import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy: o xlsx (SheetJS) é pesado e só é necessário nesta tela.
const ImportWizard = lazy(() =>
  import('@/modules/bi/import/ImportWizard').then((m) => ({
    default: m.ImportWizard,
  })),
)

export function ImportacaoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importação</h1>
        <p className="text-sm text-muted-foreground">
          Upload e importação de planilhas Excel (abas Eventos e Vendas).
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ImportWizard />
      </Suspense>
    </div>
  )
}
