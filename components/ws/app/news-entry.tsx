import { Badge } from '@/components/ui/badge'
import { NEWS_TAG_LABELS, type NewsTag } from '@/lib/ws/news-format'

export type NewsEntryData = {
  title: string
  body: string
  link: string | null
  tag: NewsTag
  /** Cesta na vlastní doméně (CSP aplikace), v náhledu adminu i blob: adresa. */
  image: string | null
  at: string
}

/** Jedna novinka v „Co je nového“ (zvonek, S15/S17). Stejná komponenta dělá náhled v adminu. */
export function NewsEntry({ item }: { item: NewsEntryData }) {
  return (
    <div className="rounded-chip px-2 py-2">
      <Badge variant={item.tag === 'new' ? 'confirmed' : 'neutral'}>{NEWS_TAG_LABELS[item.tag]}</Badge>
      <span className="mt-1.5 block text-[15px] font-semibold text-ink">{item.title}</span>
      {item.image && (
        <img src={item.image} alt="" loading="lazy" className="mt-2 block h-auto w-full rounded-chip border border-navy-100 dark:border-navy-700" />
      )}
      <span className="mt-1 block whitespace-pre-line text-sm text-quiet">{item.body}</span>
      <span className="mt-1 flex items-center gap-3">
        <span className="font-num text-xs text-quiet">{item.at}</span>
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
            Více
          </a>
        )}
      </span>
    </div>
  )
}
