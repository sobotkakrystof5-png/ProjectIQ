import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { isUndelivered, parseResendEvent, type DeliveryEvent } from '@/lib/admin/email-delivery'
import { createNotification } from '@/lib/notifications'

/**
 * Zápis doručení e-mailů z adminu podle webhooku Resendu (R-146, migrace 135).
 * Čistá část (rozbor události, štítek) je v `email-delivery.ts`.
 */

export type DeliveryResult = 'ignored' | 'recorded' | 'stale'

/**
 * Uloží stav e-mailu. Novější událost přepíše starší (podle času od Resendu,
 * ne podle pořadí příchodu), jen „zdržuje se" nikdy nepřepíše konečný stav —
 * Resend může zprávu o zdržení poslat i po doručení.
 *
 * Vrací stav před a po. `after` je null, když byla událost starší než uložená.
 * Opakovaný webhook (Resend zkouší znovu) tak vrátí stejný stav před i po.
 */
export async function recordDelivery(e: DeliveryEvent): Promise<{ before: string | null; after: string | null }> {
  const [row] = await adminDb<{ before: string | null; after: string | null }>`
    WITH prev AS (
      SELECT status FROM email_deliveries WHERE provider_id = ${e.providerId}
    ), up AS (
      INSERT INTO email_deliveries (provider_id, status, event_at, bounce_type)
      VALUES (${e.providerId}, ${e.status}, ${e.eventAt.toISOString()}, ${e.bounceType})
      ON CONFLICT (provider_id) DO UPDATE
         SET status = EXCLUDED.status, event_at = EXCLUDED.event_at,
             bounce_type = EXCLUDED.bounce_type, updated_at = now()
       WHERE (EXCLUDED.status <> 'delayed' AND email_deliveries.status = 'delayed')
          OR ((EXCLUDED.status = 'delayed') = (email_deliveries.status = 'delayed')
              AND EXCLUDED.event_at >= email_deliveries.event_at)
      RETURNING status
    )
    SELECT (SELECT status FROM prev) AS before, (SELECT status FROM up) AS after
  `
  return { before: row?.before ?? null, after: row?.after ?? null }
}

const UNDELIVERED_BODY: Record<string, (to: string) => string> = {
  bounced: (to) => `Adresa ${to} pozvánku vrátila. Opravte e-mail u kontaktu a v kalendáři pošlete pozvánku znovu.`,
  suppressed: (to) =>
    `Na ${to} Resend nic nepošle, dřív se z ní e-maily vracely. Opravte e-mail u kontaktu a pošlete pozvánku znovu.`,
  failed: (to) => `Pozvánku na ${to} se nepodařilo doručit. V kalendáři ji můžete poslat znovu.`,
}

/** Pozvánka na nadcházející schůzku nedorazila → upozornění do zvonku. */
async function notifyUndeliveredInvite(
  providerId: string,
  status: string,
  notify: typeof createNotification,
): Promise<boolean> {
  const [event] = await adminDb<{ title: string; invite_to: string | null }>`
    SELECT title, invite_to FROM calendar_events
     WHERE invite_provider_id = ${providerId} AND invite_status = 'sent' AND ends_at > now()
     LIMIT 1
  `
  if (!event) return false
  const body = UNDELIVERED_BODY[status] ?? UNDELIVERED_BODY.failed
  await notify({
    type: 'meeting_invite_undelivered',
    title: `Pozvánka na schůzku nedorazila: ${event.title}`.slice(0, 200),
    body: body(event.invite_to ?? 'klienta').slice(0, 500),
    link: '/dashboard/calendar',
  })
  return true
}

export async function handleAdminResendEvent(
  evt: unknown,
  deps: { notify?: typeof createNotification; now?: Date } = {},
): Promise<DeliveryResult> {
  const delivery = parseResendEvent(evt, deps.now)
  if (!delivery) return 'ignored'
  const { before, after } = await recordDelivery(delivery)
  if (after === null) return 'stale'
  // Jen při změně na „nedorazila" — opakovaný webhook ani druhá zpráva o témž
  // vrácení upozornění nezdvojí.
  if (isUndelivered(after) && !isUndelivered(before)) {
    await notifyUndeliveredInvite(delivery.providerId, after, deps.notify ?? createNotification)
  }
  return 'recorded'
}
