import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PagePlaceholder({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            Em construção
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta tela será implementada nas próximas fases.
        </CardContent>
      </Card>
    </div>
  )
}
