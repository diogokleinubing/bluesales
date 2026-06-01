import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RulesEditor } from '../components/regras/RulesEditor'
import { PopularVenues } from '../components/regras/PopularVenues'
import { BiggestEvents } from '../components/regras/BiggestEvents'
import { RecurringEvents } from '../components/regras/RecurringEvents'
import { TaxonomyPanel } from '../components/regras/TaxonomyPanel'

export function RegrasPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras</h1>
        <p className="text-sm text-muted-foreground">
          Classificação de eventos por segmento e gênero musical. Prioridade:
          definição manual → local → termo no nome → termo no local → padrão.
        </p>
      </div>

      <Tabs defaultValue="classificacao">
        <TabsList>
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="generos">Gêneros</TabsTrigger>
          <TabsTrigger value="locais">Locais populares</TabsTrigger>
          <TabsTrigger value="eventos">Maiores eventos</TabsTrigger>
          <TabsTrigger value="recorrentes">Eventos recorrentes</TabsTrigger>
        </TabsList>
        <TabsContent value="classificacao" className="mt-4">
          <RulesEditor />
        </TabsContent>
        <TabsContent value="segmentos" className="mt-4">
          <TaxonomyPanel kind="segmento" />
        </TabsContent>
        <TabsContent value="generos" className="mt-4">
          <TaxonomyPanel kind="genero" />
        </TabsContent>
        <TabsContent value="locais" className="mt-4">
          <PopularVenues />
        </TabsContent>
        <TabsContent value="eventos" className="mt-4">
          <BiggestEvents />
        </TabsContent>
        <TabsContent value="recorrentes" className="mt-4">
          <RecurringEvents />
        </TabsContent>
      </Tabs>
    </div>
  )
}
