import 'server-only'
import { q, wsDb, type WsQuery, type WsRow } from '../db'
import type { WsBusiness, WsContext } from '../context'
import { isNewsTag, type NewsTag } from '../news-format'
import { newsImagePath } from './news-email'

// Zvonek v aplikaci (S15): upozornění se po otevření označí jako přečtená,
// „Co je nového“ ukazuje novinky ZakazIQ (ws.product_news, píše admin S17).

export type NewsItem = {
  id: string
  title: string
  body: string
  link: string | null
  tag: NewsTag
  /** Cesta k obrázku na vlastní doméně (CSP), nebo null. */
  image: string | null
  publishedAt: Date
}

/** Dotazy na novinky a čas, kdy je člen naposledy viděl (pro jednu dávku s dalšími). */
export function newsQueries(ctx: WsContext): [WsQuery, WsQuery] {
  return [
    q`SELECT id, title, body, link_url, tag, image_type IS NOT NULL AS has_image, published_at FROM ws.product_news
      WHERE published_at IS NOT NULL AND published_at <= now() AND published_at > now() - interval '120 days'
      ORDER BY published_at DESC LIMIT 3`,
    q`SELECT news_seen_at FROM ws.members WHERE account_id = ${ctx.accountId} AND user_id = ${ctx.userId}`,
  ]
}

export function newsFrom([news, me]: WsRow[][]): { items: NewsItem[]; unseen: boolean } {
  const items = news.map((n: WsRow) => ({
    id: String(n.id),
    title: String(n.title),
    body: String(n.body),
    link: (n.link_url as string | null) ?? null,
    tag: isNewsTag(n.tag) ? n.tag : 'new',
    image: n.has_image ? newsImagePath(String(n.id)) : null,
    publishedAt: new Date(n.published_at as string),
  }))
  const seen = me[0]?.news_seen_at ? new Date(me[0].news_seen_at as string) : null
  return { items, unseen: items.some((i) => !seen || i.publishedAt > seen) }
}

/** Posledních pár novinek a jestli je člen už viděl. */
export async function getNews(ctx: WsContext): Promise<{ items: NewsItem[]; unseen: boolean }> {
  return newsFrom(await wsDb(ctx).batch(newsQueries(ctx)))
}

/** Otevřený zvonek: upozornění byznysu přečtená, novinky viděné. */
export async function markBellSeen(ctx: WsContext, business: Pick<WsBusiness, 'id'>): Promise<void> {
  await wsDb(ctx).batch([
    q`UPDATE ws.notifications SET read_at = now()
      WHERE account_id = ${ctx.accountId} AND (business_id = ${business.id} OR business_id IS NULL) AND read_at IS NULL`,
    q`UPDATE ws.members SET news_seen_at = now() WHERE account_id = ${ctx.accountId} AND user_id = ${ctx.userId}`,
  ])
}
