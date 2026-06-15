import { Globe } from 'lucide-react'
import { InstagramIcon } from './SocialIcons'
import { instagramUrl, siteUrl } from '@/lib/links'

/** Ícones-link para Instagram e Site (só renderiza os que existem). */
export function SocialLinks({ site, instagram }: { site?: string | null; instagram?: string | null }) {
  const ig = instagramUrl(instagram)
  const st = siteUrl(site)
  if (!ig && !st) return null
  return (
    <span className="flex items-center gap-1.5">
      {ig && (
        <a href={ig} target="_blank" rel="noreferrer" title="Instagram"
          className="text-muted-foreground hover:text-primary">
          <InstagramIcon className="size-4" />
        </a>
      )}
      {st && (
        <a href={st} target="_blank" rel="noreferrer" title="Site"
          className="text-muted-foreground hover:text-primary">
          <Globe className="size-4" />
        </a>
      )}
    </span>
  )
}
