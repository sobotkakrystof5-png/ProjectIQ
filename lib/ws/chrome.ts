import 'server-only'
import type { WsBusiness, WsContext } from './context'
import { q, wsDb } from './db'
import { newsFrom, newsQueries } from './email/inbox'
import { EMPTY_CHROME, type FrameChrome } from './frame-chrome'
import { formatDayShort, formatMinutes, pragueParts } from './time'
import { notificationQueries, notificationsFrom } from './today'

// Doplňky kostry (typy v frame-chrome.ts): layout je nečeká — streamují se do
// hotové kostry a načítají se zároveň se stránkou, jedním dotazem do DB.

export async function getFrameChrome(ctx: WsContext, business: Pick<WsBusiness, 'id'>): Promise<FrameChrome> {
  try {
    const [services, ...rest] = await wsDb(ctx).batch([
      q`
        SELECT name FROM ws.services
        WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND active
        ORDER BY position, name
      `,
      ...notificationQueries(ctx, business),
      ...newsQueries(ctx),
    ])
    const notifications = notificationsFrom(rest.slice(0, 2))
    const news = newsFrom(rest.slice(2, 4))
    return {
      services: services.map((s) => String(s.name)),
      bell: {
        unread: notifications.unread,
        items: notifications.items.map((n) => {
          const at = pragueParts(n.created_at)
          return {
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            read: n.read,
            at: `${formatDayShort(at.date)} ${formatMinutes(at.minutes)}`,
          }
        }),
        news: news.items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link,
          tag: n.tag,
          image: n.image,
          at: formatDayShort(pragueParts(n.publishedAt).date),
        })),
        newsUnseen: news.unseen,
      },
    }
  } catch (e) {
    // Zvonek ani ⌘K nesmí shodit obrazovku; chyba se jen zapíše do logu serveru.
    console.error('ws: doplňky kostry se nenačetly', e instanceof Error ? e.message : e)
    return EMPTY_CHROME
  }
}
