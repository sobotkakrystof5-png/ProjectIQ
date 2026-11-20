import { redirect } from 'next/navigation'
import { requireClient } from '@/lib/portal/context'
import { listClientThreads } from '@/lib/portal/chat'
import { PORTAL_HOME_PATH } from '@/lib/portal/paths'

// Kam po přihlášení (KP16, R-123): když čeká nepřečtená zpráva, rovnou do
// toho chatu (vlákna jsou seřazená od poslední zprávy), jinak Přehled.
// Jen tady — položka Přehled v menu vede vždy na přehled.
export default async function KlientStartPage() {
  const ctx = await requireClient()
  const threads = await listClientThreads(ctx.clientId).catch(() => [])
  const unread = threads.find((t) => t.unread > 0)
  redirect(unread ? `/klient/zpravy/${unread.projectId}` : PORTAL_HOME_PATH)
}
