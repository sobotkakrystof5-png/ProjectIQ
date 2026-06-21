import { sql } from '@/lib/db'
import { NotificationList } from '@/components/NotificationList'
import type { NotificationType } from '@/lib/notifications'

export const revalidate = 0

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

export default async function NotificationsPage() {
  const rows = await sql`
    SELECT id, type, title, body, link, read, created_at
    FROM notifications
    ORDER BY created_at DESC
    LIMIT 200
  `

  const notifications = (rows as (Omit<Notification, 'created_at'> & { created_at: Date })[]).map(r => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
  })) satisfies Notification[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Oznámení</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Veškeré aktivity klientů a připomínky</p>
      </div>
      <NotificationList notifications={notifications} />
    </div>
  )
}
