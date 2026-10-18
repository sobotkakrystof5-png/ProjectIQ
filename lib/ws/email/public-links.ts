import 'server-only'
import { wsDb } from '../db'
import { verifyLink } from './links'

// Veřejné odkazy z e-mailů bez přihlášení (S15): odhlášení zákazníka
// z hromadných zpráv, odhlášení účtu z novinek ZakazIQ a termín do kalendáře.
// Účet bere jen z ověřeného podpisu odkazu (lib/ws/email/links.ts).

/** Zákazník: už žádné zprávy „Komu napsat“. Opakované odhlášení nic nezmění. Vrací název firmy, nebo null (neplatný odkaz). */
export async function unsubscribeCustomer(token: string): Promise<{ businessName: string } | null> {
  const link = verifyLink(token, 'u')
  if (!link?.id) return null
  const scope = { accountId: link.accountId }
  const [updated, , business] = await wsDb(scope).batch([
    {
      text: `UPDATE ws.customers SET unsubscribed_at = COALESCE(unsubscribed_at, now())
             WHERE account_id = $1 AND id = $2 RETURNING id`,
      params: [link.accountId, link.id],
    },
    {
      text: `UPDATE ws.outbound_messages SET status = 'cancelled', last_error = 'no_consent'
             WHERE account_id = $1 AND customer_id = $2 AND status IN ('queued', 'draft') AND type LIKE 'outreach\\_%'`,
      params: [link.accountId, link.id],
    },
    {
      text: `SELECT name FROM ws.businesses WHERE account_id = $1 AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
      params: [link.accountId],
    },
  ])
  if (updated.length === 0) return null
  return { businessName: String(business[0]?.name ?? '') }
}

/** Jen náhled pro stránku odhlášení (nic nemění). */
export async function customerLinkBusiness(token: string): Promise<{ businessName: string; unsubscribed: boolean } | null> {
  const link = verifyLink(token, 'u')
  if (!link?.id) return null
  const [row] = await wsDb({ accountId: link.accountId })`
    SELECT c.unsubscribed_at IS NOT NULL AS unsubscribed,
           (SELECT name FROM ws.businesses b WHERE b.account_id = c.account_id AND b.archived_at IS NULL ORDER BY b.created_at LIMIT 1) AS business
    FROM ws.customers c WHERE c.account_id = ${link.accountId} AND c.id = ${link.id}`
  return row ? { businessName: String(row.business ?? ''), unsubscribed: Boolean(row.unsubscribed) } : null
}

/** Účet: novinky ZakazIQ e-mailem vypnout (zapnout jde zpátky v Nastavení). */
export async function unsubscribeNews(token: string): Promise<boolean> {
  const link = verifyLink(token, 'n')
  if (!link) return false
  const rows = await wsDb({ accountId: link.accountId })`
    UPDATE ws.accounts SET news_emails = false WHERE id = ${link.accountId} RETURNING id`
  return rows.length > 0
}

const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Termín jako .ics (jen potvrzená návštěva). Null = odkaz neplatí nebo termín už není. */
export async function appointmentIcs(token: string, now: Date = new Date()): Promise<string | null> {
  const link = verifyLink(token, 'c')
  if (!link?.id) return null
  const [a] = await wsDb({ accountId: link.accountId })`
    SELECT a.id, min(a2.starts_at) AS starts_at, max(a2.ends_at) AS ends_at, b.name AS business,
      COALESCE(string_agg(s2.name, ' + ' ORDER BY a2.starts_at), s.name) AS service
    FROM ws.appointments a
    JOIN ws.businesses b ON b.account_id = a.account_id AND b.id = a.business_id
    LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
    LEFT JOIN ws.appointments a2 ON a2.account_id = a.account_id AND a2.business_id = a.business_id
      AND a2.status = 'confirmed' AND ((a.group_id IS NOT NULL AND a2.group_id = a.group_id) OR (a.group_id IS NULL AND a2.id = a.id))
    LEFT JOIN ws.services s2 ON s2.account_id = a2.account_id AND s2.id = a2.service_id
    WHERE a.account_id = ${link.accountId} AND a.id = ${link.id} AND a.kind = 'visit' AND a.status = 'confirmed'
    GROUP BY a.id, a.starts_at, a.ends_at, b.name, s.name`
  if (!a) return null
  const title = [a.service, a.business].filter(Boolean).join(' · ')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZakazIQ//Termin//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${String(a.id)}@zakaziq.cz`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(new Date(a.starts_at as string))}`,
    `DTEND:${icsTime(new Date(a.ends_at as string))}`,
    `SUMMARY:${escapeIcs(title.slice(0, 200))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT2H',
    `DESCRIPTION:${escapeIcs(title.slice(0, 200))}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
