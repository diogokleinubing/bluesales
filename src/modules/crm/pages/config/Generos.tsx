import { TaxonomyPanel } from '@/modules/bi/components/regras/TaxonomyPanel'

export function GenerosConfig() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gêneros</h1>
        <p className="text-sm text-muted-foreground">
          Gêneros musicais usados na classificação de eventos e no cadastro de atrações.
        </p>
      </div>
      <TaxonomyPanel kind="genero" />
    </div>
  )
}
