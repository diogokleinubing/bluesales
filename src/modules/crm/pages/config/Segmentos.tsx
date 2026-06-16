import { TaxonomyPanel } from '@/modules/bi/components/regras/TaxonomyPanel'

export function SegmentosConfig() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segmentos</h1>
        <p className="text-sm text-muted-foreground">
          Segmentos usados na classificação de eventos e no cadastro de atrações.
        </p>
      </div>
      <TaxonomyPanel kind="segmento" />
    </div>
  )
}
