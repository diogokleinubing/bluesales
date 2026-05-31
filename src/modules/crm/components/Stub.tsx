import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/** Card centralizado de "em construção" para as telas do módulo Comercial. */
export function Stub({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Construction className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {description ?? 'Esta tela do módulo Comercial está em construção.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
