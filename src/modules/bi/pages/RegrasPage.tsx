import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RulesEditor } from '../components/regras/RulesEditor'
import { PopularVenues } from '../components/regras/PopularVenues'
import { BiggestEvents } from '../components/regras/BiggestEvents'
import { RecurringEvents } from '../components/regras/RecurringEvents'

const TABS = ['classificacao', 'locais', 'eventos', 'recorrentes']

export function RegrasPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : 'classificacao'

  function onTabChange(v: string) {
    const next = new URLSearchParams(params)
    next.set('tab', v)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras</h1>
        <p className="text-sm text-muted-foreground">
          Classificação de eventos por segmento e gênero musical. Prioridade:
          definição manual → termos → atrações → local → padrão.
        </p>
      </div>

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="locais">Locais populares</TabsTrigger>
          <TabsTrigger value="eventos">Maiores eventos</TabsTrigger>
          <TabsTrigger value="recorrentes">Eventos recorrentes</TabsTrigger>
        </TabsList>
        <TabsContent value="classificacao" className="mt-4">
          <RulesEditor />
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
