import { NEWS_TAG_LABELS, type NewsTag } from '../news-format'
import { renderEmail, type EmailBlock, type RenderedEmail } from './layout'

// E-mail s novinkou ZakazIQ (S17). Jedna funkce pro náhled v adminu
// (/dashboard/novinky), odeslání z adminu i denní cron (scheduled.ts).

export type NewsEmailInput = {
  title: string
  body: string
  tag: NewsTag
  link: string | null
  /** Absolutní adresa obrázku (veřejná), nebo null. */
  imageUrl: string | null
}

export const NEWS_EMAIL_FOOTER = 'Novinky ZakazIQ posíláme jednou za čas. Upozornění na platby a bezpečnost chodí vždy.'

export function newsSubject(input: Pick<NewsEmailInput, 'title' | 'tag'>): string {
  return `${NEWS_TAG_LABELS[input.tag]} v ZakazIQ: ${input.title}`
}

export function renderNewsEmail(input: NewsEmailInput, unsubscribeUrl: string | null): RenderedEmail {
  const intro: EmailBlock[] = [{ kind: 'headline', eyebrow: NEWS_TAG_LABELS[input.tag], text: input.title }]
  if (input.imageUrl) intro.push({ kind: 'image', url: input.imageUrl, alt: input.title })
  return renderEmail({
    brand: { name: 'ZakazIQ', color: null },
    subject: newsSubject(input),
    intro,
    body: input.body,
    blocks: input.link ? [{ kind: 'buttons', items: [{ label: 'Více', url: input.link }] }] : [],
    footer: NEWS_EMAIL_FOOTER,
    unsubscribeUrl,
  })
}

/** Veřejná adresa obrázku novinky (servíruje app/z/novinky/[id]/obrazek). */
export const newsImagePath = (id: string): string => `/z/novinky/${id}/obrazek`
