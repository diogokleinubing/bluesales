import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RulesEditor } from '../components/regras/RulesEditor'
import { PopularVenues } from '../components/regras/PopularVenues'
import { BiggestEvents } from '../components/regras/BiggestEvents'

export function RegrasPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras</h1>
        <p className="text-sm text-muted-foreground">
          Classificação de segmentos: ordem de prioridade override por evento →
          mapa de local → palavra no nome → palavra no local → Outros.
        </p>
      </div>

      <Tabs defaultValue="regras">
        <TabsList>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="locais">Locais populares</TabsTrigger>
          <TabsTrigger value="eventos">Maiores eventos</TabsTrigger>
        </TabsList>
        <TabsContent value="regras" className="mt-4">
          <RulesEditor />
        </TabsContent>
        <TabsContent value="locais" className="mt-4">
          <PopularVenues />
        </TabsContent>
        <TabsContent value="eventos" className="mt-4">
          <BiggestEvents />
        </TabsContent>
      </Tabs>
    </div>
  )
}
