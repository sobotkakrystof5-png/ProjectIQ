import 'server-only'
import { wsDb } from '../db'
import { canWrite, getBillingState } from '../billing'
import { confirmRequest, type BookingError } from '../bookings'
import type { WsContext } from '../context'
import { refreshSegmentsSafely } from '../segments'
import { verifyLink } from './links'
import { deliver, notifyBookingConfirmed } from './notify'

// Jednorázový odkaz z e-mailu „Nová poptávka“ (S15): majitel potvrdí
// poptávku bez přihlášení. Odkaz = podepsané ID řádku ws.action_tokens.
//   - otevření stránky (GET) nic nemění — e-mailové programy odkazy předem
//     načítají; potvrzuje až tlačítko (server action),
//   - použití je atomické (UPDATE … WHERE used_at IS NULL AND expires_at > now()),
//     druhé použití i po expiraci vrátí „neplatný“,
//   - když potvrzení selže (obsazený čas), odkaz zůstane použitelný,
//   - po úspěchu se zneplatní i odkazy ostatních vlastníků k téže poptávce.

export type LinkState =
  | { ok: false; reason: 'invalid' | 'used' | 'expired' | 'handled' }
  | {
      ok: true
      accountId: string
      businessId: string
      requestId: string
      business: { name: string; color: string | null; slug: string }
      request: { name: string | null; service: string | null; wantedStart: Date | null; message: string | null }
      /** Byznys bez zakázek s kalendářem potvrzuje jen s časem. */
      needsTime: boolean
    }

export async function peekActionLink(token: string): Promise<LinkState> {
  const link = verifyLink(token, 'a')
  if (!link?.id) return { ok: false, reason: 'invalid' }
  const scope = { accountId: link.accountId }
  const [row] = await wsDb(scope)`
    SELECT t.business_id, t.request_id, t.used_at, t.expires_at < now() AS expired,
           r.status, r.wanted_start, r.message, c.name,
           COALESCE((SELECT string_agg(s2.name, ' + ' ORDER BY rs.position)
             FROM ws.request_services rs JOIN ws.services s2 ON s2.account_id = rs.account_id AND s2.id = rs.service_id
             WHERE rs.account_id = r.account_id AND rs.request_id = r.id), s.name) AS service,
           b.name AS business_name, b.color, b.slug,
           EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = t.account_id AND m.business_id = t.business_id AND m.module = 'calendar' AND m.enabled) AS calendar,
           EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = t.account_id AND m.business_id = t.business_id AND m.module = 'jobs' AND m.enabled) AS jobs
    FROM ws.action_tokens t
    JOIN ws.requests r ON r.account_id = t.account_id AND r.id = t.request_id
    JOIN ws.businesses b ON b.account_id = t.account_id AND b.id = t.business_id
    LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
    LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
    WHERE t.account_id = ${link.accountId} AND t.id = ${link.id}`
  if (!row) return { ok: false, reason: 'invalid' }
  if (row.used_at) return { ok: false, reason: 'used' }
  if (row.expired) return { ok: false, reason: 'expired' }
  if (row.status !== 'new') return { ok: false, reason: 'handled' }
  return {
    ok: true,
    accountId: link.accountId,
    businessId: String(row.business_id),
    requestId: String(row.request_id),
    business: { name: String(row.business_name), color: (row.color as string | null) ?? null, slug: String(row.slug) },
    request: {
      name: (row.name as string | null) ?? null,
      service: (row.service as string | null) ?? null,
      wantedStart: row.wanted_start ? new Date(row.wanted_start as string) : null,
      message: (row.message as string | null) ?? null,
    },
    needsTime: Boolean(row.calendar) && !row.jobs && !row.wanted_start,
  }
}

export type UseResult =
  | { ok: true; start: Date | null; changed: boolean }
  | { ok: false; reason: 'invalid' | 'used' | 'expired' | 'handled' | 'read_only' | BookingError }

/** Potvrdí poptávku z odkazu. `start` = jiný čas (jinak chtěný). */
export async function applyActionLink(token: string, input: { start?: Date | null } = {}): Promise<UseResult> {
  const link = verifyLink(token, 'a')
  if (!link?.id) return { ok: false, reason: 'invalid' }
  const scope = { accountId: link.accountId }
  const acc = link.accountId

  // Bez aktivního předplatného je účet jen pro čtení (B5) — odkaz se nespotřebuje.
  if (!canWrite(await getBillingState(acc))) return { ok: false, reason: 'read_only' }

  const [taken] = await wsDb(scope)`
    UPDATE ws.action_tokens SET used_at = now()
    WHERE account_id = ${acc} AND id = ${link.id} AND used_at IS NULL AND expires_at > now()
    RETURNING business_id, request_id`
  if (!taken) {
    const [t] = await wsDb(scope)`SELECT used_at IS NOT NULL AS used FROM ws.action_tokens WHERE account_id = ${acc} AND id = ${link.id}`
    return { ok: false, reason: !t ? 'invalid' : t.used ? 'used' : 'expired' }
  }
  const businessId = String(taken.business_id)
  const requestId = String(taken.request_id)
  const [biz] = await wsDb(scope)`SELECT id, name FROM ws.businesses WHERE account_id = ${acc} AND id = ${businessId}`
  const ctx: WsContext = { userId: 'email-link', accountId: acc, role: 'owner' }
  const res = biz
    ? await confirmRequest(ctx, { id: businessId, name: String(biz.name) }, { requestId, start: input.start ?? null })
    : ({ ok: false, reason: 'not_found' } as const)

  if (!res.ok) {
    // Nepovedlo se (obsazený čas…) — odkaz jde použít znovu, pokud poptávka ještě čeká.
    if (res.reason !== 'already_handled') {
      await wsDb(scope)`UPDATE ws.action_tokens SET used_at = NULL WHERE account_id = ${acc} AND id = ${link.id}`
    }
    return { ok: false, reason: res.reason === 'already_handled' ? 'handled' : res.reason }
  }

  await wsDb(scope)`UPDATE ws.action_tokens SET used_at = now() WHERE account_id = ${acc} AND request_id = ${requestId} AND used_at IS NULL`
  const [req] = await wsDb(scope)`SELECT customer_id, status FROM ws.requests WHERE account_id = ${acc} AND id = ${requestId}`
  await refreshSegmentsSafely(scope, { id: businessId }, [(req?.customer_id as string | null) ?? null])
  if (res.data.appointmentId) {
    await notifyBookingConfirmed(scope, businessId, res.data.appointmentId, { changed: req?.status === 'rescheduled' })
    await deliver(scope)
  }
  return { ok: true, start: res.data.start, changed: req?.status === 'rescheduled' }
}
