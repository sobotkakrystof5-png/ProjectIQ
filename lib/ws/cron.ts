import 'server-only'
import { createHash, timingSafeEqual } from 'crypto'
import { wsSystem } from './db'
import { expireCards } from './loyalty'
import { recomputeSegments } from './segments'

// Denní cron Workspace (S12): skupiny zákazníků (Spící vznikají plynutím
// času) a propadlé věrnostní karty. Ověření CRON_SECRET je kopie
// verifyCronSecret z lib/api-auth.ts (admin se nemění, AGENTS.md → Hranice).

/** `Authorization: Bearer <CRON_SECRET>` (formát Vercel Cronu). Bez CRON_SECRET nepustí nikoho. */
export function isCronAuthorized(authorization: string | null): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || !authorization?.startsWith('Bearer ')) return false
  // Hash srovná délky, porovnání v konstantním čase.
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(authorization.slice('Bearer '.length)), digest(expected))
}

export type DailyRun = { businesses: number; changed: number; expired: number; failed: number }

/** Projde všechny byznysy, každý zvlášť pod svým účtem; chyba jednoho nezastaví ostatní. */
export async function runDailySegments(now: Date = new Date()): Promise<DailyRun> {
  const list = await wsSystem<{ account_id: string; business_id: string }>`SELECT account_id, business_id FROM ws.active_businesses()`
  const out: DailyRun = { businesses: list.length, changed: 0, expired: 0, failed: 0 }
  for (const b of list) {
    const scope = { accountId: b.account_id }
    const business = { id: b.business_id }
    try {
      out.expired += await expireCards(scope, business)
      out.changed += (await recomputeSegments(scope, business, { now })).changed
    } catch (e) {
      out.failed++
      console.error('cron.ws-segments', { accountId: b.account_id, error: e instanceof Error ? e.message : 'unknown' })
    }
  }
  return out
}
