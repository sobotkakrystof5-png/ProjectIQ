import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { createNotification } from '@/lib/notifications'
import { safeHttpUrl, stripControlChars } from '@/lib/security/html'

/**
 * Ukázkový web k nabídce (navrhovač nabídek, R-160).
 *
 * Ukázky staví Growth OS (vizeon-autopilot): Claude Code v GitHub Actions
 * postaví jednu stránku, Cloudflare Pages ji vystaví na navrhy.vizeon.cz.
 * ZakazIQ si ukázku vyžádá (`requestDemo`), Growth OS ji postaví a vrátí
 * odkaz na `POST /api/public/nabidky/ukazka` (`recordDemoResult`).
 * E-mail klientovi pošle Kryštof z karty nabídky, Growth OS ho neposílá.
 *
 * Firma, se kterou mluvil robot, ukázku často už má (`outreach_leads.demo_url`).
 * Tu karta použije rovnou a nic se nestaví.
 *
 * Bez migrace 145 tabulka chybí: hotová ukázka od robota jde poslat dál,
 * vyžádat novou nejde.
 */

export const DEMO_URL_RE = /^https:\/\/navrhy\.vizeon\.cz\/[a-z0-9][a-z0-9-]{0,80}\/?$/

/** Odkaz na ukázku jen z navrhy.vizeon.cz. Cokoli jiného je `null`. */
export function demoUrlOk(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const url = safeHttpUrl(raw.trim())
  return url !== null && DEMO_URL_RE.test(url) ? url : null
}

export type DemoStatus = 'requested' | 'ready' | 'failed'
export type DemoError = 'dispatch_failed' | 'build_failed' | 'timeout' | 'no_email'

export type DemoState = {
  status: DemoStatus
  source: 'robot' | 'build'
  url: string | null
  error: DemoError | null
  requestedAt: string | null
  readyAt: string | null
  sentAt: string | null
}

/** Jak dlouho se čeká na postavení, než se žádost bere jako nedoběhlá. */
export const DEMO_TIMEOUT_MINUTES = 120
/** Kolikrát jde ukázku k jedné nabídce vyžádat. Stavba stojí čas i limit předplatného. */
export const DEMO_MAX_ATTEMPTS = 5

const missingTable = (err: unknown) => (err as { code?: unknown })?.code === '42P01'
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString())

/** Ukázka u firmy od robota (kontakt i jeho sloučené kontakty), nejnovější. */
async function robotDemo(contactId: string): Promise<string | null> {
  const rows = await adminDb<{ demo_url: string | null }>`
    SELECT o.demo_url FROM outreach_leads o
     WHERE o.contact_id = coalesce((SELECT merged_into FROM contacts WHERE id = ${contactId}), ${contactId}::uuid)
       AND o.demo_url IS NOT NULL
     ORDER BY o.demo_built_at DESC NULLS LAST, o.source_updated_at DESC
     LIMIT 1`
  return demoUrlOk(rows[0]?.demo_url ?? null)
}

export type DemoView = {
  demo: DemoState | null
  /** Jde ukázku vyžádat (migrace 145 je a Growth OS je napojený). */
  canRequest: boolean
}

/** Stav ukázky k nabídce: řádek v `offer_demos`, jinak hotová ukázka od robota. */
export async function loadDemo(proposalId: string, contactId: string): Promise<DemoView> {
  let row: Record<string, unknown> | null = null
  let migrated = true
  try {
    const rows = await adminDb<Record<string, unknown>>`
      SELECT status, source, url, error, requested_at, ready_at, sent_at FROM offer_demos WHERE proposal_id = ${proposalId}`
    row = rows[0] ?? null
  } catch (err) {
    if (!missingTable(err)) throw err
    migrated = false
  }
  const canRequest = migrated && demoConfigured()
  if (row) {
    return {
      canRequest,
      demo: {
        status: row.status as DemoStatus,
        source: row.source as 'robot' | 'build',
        url: demoUrlOk(row.url),
        error: (row.error as DemoError | null) ?? null,
        requestedAt: iso(row.requested_at),
        readyAt: iso(row.ready_at),
        sentAt: iso(row.sent_at),
      },
    }
  }
  const url = await robotDemo(contactId).catch(() => null)
  return {
    canRequest,
    demo: url ? { status: 'ready', source: 'robot', url, error: null, requestedAt: null, readyAt: null, sentAt: null } : null,
  }
}

/* ------------------------------------------------------------------ */
/* Žádost do Growth OS                                                  */
/* ------------------------------------------------------------------ */

function demoEndpoint(): string | null {
  const raw = process.env.GROWTH_OS_DEMO_URL?.trim()
  if (!raw) return null
  const url = safeHttpUrl(raw)
  return url !== null && url.startsWith('https://') ? url : null
}

export function demoConfigured(): boolean {
  return demoEndpoint() !== null && (process.env.GROWTH_OS_DEMO_KEY?.trim() ?? '').length >= 32
}

/** Co jde do Growth OS: jen veřejné údaje o firmě a e-mail, na který ukázka půjde. */
export type DemoLead = {
  company_name: string
  email: string
  website: string | null
  city: string | null
  industry: string | null
  phone: string | null
  notes: string | null
}

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = stripControlChars(v).replace(/\s+/g, ' ').trim().slice(0, max)
  return t === '' ? null : t
}

async function demoLeadFor(proposalId: string): Promise<{ lead: DemoLead } | { error: 'not_found' | 'no_email' }> {
  const rows = await adminDb<{
    company: string
    email: string | null
    phone: string | null
    brief: Record<string, unknown> | null
    summary: string | null
  }>`
    SELECT p.company, c.email, c.phone, r.brief, r.result -> 'company' ->> 'summary' AS summary
      FROM offer_proposals p
      JOIN contacts c ON c.id = coalesce((SELECT merged_into FROM contacts WHERE id = p.contact_id), p.contact_id)
      LEFT JOIN offer_research r ON r.id = p.research_id
     WHERE p.id = ${proposalId}`
  const row = rows[0]
  if (!row) return { error: 'not_found' }
  const email = clip(row.email, 254)
  if (!email) return { error: 'no_email' }
  const brief = row.brief ?? {}
  return {
    lead: {
      company_name: clip(row.company, 200) ?? 'Firma',
      email,
      website: safeHttpUrl(typeof brief.web === 'string' ? brief.web : null),
      city: clip(brief.city, 80),
      industry: clip(brief.industry, 80),
      phone: clip(row.phone, 20),
      notes: clip(row.summary, 600),
    },
  }
}

export type RequestOutcome =
  | { ok: true }
  | { ok: false; error: 'not_connected' | 'not_found' | 'no_email' | 'already' | 'limit' | 'dispatch_failed' }

export type DispatchDemo = (lead: DemoLead, proposalId: string) => Promise<boolean>

/** Pošle žádost do Growth OS. Přesměrování se nesleduje, odpověď se nečte (jen kód). */
export const dispatchDemo: DispatchDemo = async (lead, proposalId) => {
  const url = demoEndpoint()
  const key = process.env.GROWTH_OS_DEMO_KEY?.trim()
  if (!url || !key) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ zakaziq: { proposal_id: proposalId }, lead }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    return res.status >= 200 && res.status < 300
  } catch {
    return false
  }
}

/**
 * Vyžádá stavbu ukázky. Stejnou žádost dvakrát po sobě nepošle (čeká se na
 * výsledek, nebo na vypršení), nejvýš `DEMO_MAX_ATTEMPTS` za nabídku.
 */
export async function requestDemo(proposalId: string, dispatch: DispatchDemo = dispatchDemo): Promise<RequestOutcome> {
  if (!demoConfigured()) return { ok: false, error: 'not_connected' }
  const found = await demoLeadFor(proposalId)
  if ('error' in found) return { ok: false, error: found.error }

  const claimed = await adminDb<{ attempts: number }>`
    INSERT INTO offer_demos (proposal_id, status, source, requested_at, attempts, updated_at)
    VALUES (${proposalId}, 'requested', 'build', now(), 1, now())
    ON CONFLICT (proposal_id) DO UPDATE
       SET status = 'requested', source = 'build', url = NULL, error = NULL, ready_at = NULL,
           requested_at = now(), attempts = offer_demos.attempts + 1, updated_at = now()
     WHERE offer_demos.attempts < ${DEMO_MAX_ATTEMPTS}
       AND (offer_demos.status <> 'requested' OR offer_demos.requested_at < now() - interval '1 minute' * ${DEMO_TIMEOUT_MINUTES})
    RETURNING attempts`
  if (claimed.length === 0) {
    const rows = await adminDb<{ status: string; attempts: number }>`
      SELECT status, attempts FROM offer_demos WHERE proposal_id = ${proposalId}`
    return { ok: false, error: rows[0]?.status === 'requested' ? 'already' : 'limit' }
  }

  const sent = await dispatch(found.lead, proposalId)
  if (!sent) {
    await adminDb`
      UPDATE offer_demos SET status = 'failed', error = 'dispatch_failed', updated_at = now()
       WHERE proposal_id = ${proposalId} AND status = 'requested'`
    return { ok: false, error: 'dispatch_failed' }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Výsledek od Growth OS                                                */
/* ------------------------------------------------------------------ */

export type DemoResult = { proposalId: string; status: 'ready'; url: string } | { proposalId: string; status: 'failed' }

/**
 * Zapíše výsledek stavby. Jen k nabídce, ke které ZakazIQ ukázku opravdu
 * vyžádal (řádek `build`, ne ukázka od robota), jinak `false`. Opakované
 * hlášení téhož nic nezmění.
 */
export async function recordDemoResult(result: DemoResult): Promise<boolean> {
  const ready = result.status === 'ready'
  const url = ready ? demoUrlOk(result.url) : null
  if (ready && url === null) return false
  const rows = await adminDb<{ company: string; contact_id: string; changed: boolean }>`
    WITH upd AS (
      UPDATE offer_demos
         SET status = ${ready ? 'ready' : 'failed'},
             url = ${url},
             error = ${ready ? null : 'build_failed'},
             ready_at = ${ready ? new Date().toISOString() : null}::timestamptz,
             updated_at = now()
       WHERE proposal_id = ${result.proposalId} AND source = 'build'
         AND (status = 'requested' OR (status = 'failed' AND error = 'timeout'))
      RETURNING proposal_id)
    SELECT p.company, p.contact_id::text, true AS changed
      FROM upd JOIN offer_proposals p ON p.id = upd.proposal_id`
  const row = rows[0]
  if (!row) {
    // Druhé hlášení stejné hotové ukázky není chyba, jen se nic nemění.
    const same = await adminDb<{ ok: boolean }>`
      SELECT true AS ok FROM offer_demos
       WHERE proposal_id = ${result.proposalId} AND source = 'build' AND status = ${ready ? 'ready' : 'failed'}
         AND (${url}::text IS NULL OR url = ${url})`
    return same.length > 0
  }
  await createNotification({
    type: 'offer_demo',
    title: ready ? `Ukázka webu je hotová: ${row.company.slice(0, 120)}` : `Ukázka se nepostavila: ${row.company.slice(0, 120)}`,
    body: ready ? 'E-mail s ukázkou čeká u nabídky, stačí ho odeslat.' : 'Zkuste ji u nabídky vyžádat znovu.',
    link: `/dashboard/kontakty/${row.contact_id}`,
  })
  return true
}

/** Po odeslání e-mailu s ukázkou. Ukázka od robota dostane řádek až teď. */
export async function markDemoSent(proposalId: string, url: string): Promise<void> {
  const clean = demoUrlOk(url)
  if (clean === null) return
  try {
    await adminDb`
      INSERT INTO offer_demos (proposal_id, status, source, url, ready_at, sent_at, updated_at)
      VALUES (${proposalId}, 'ready', 'robot', ${clean}, now(), now(), now())
      ON CONFLICT (proposal_id) DO UPDATE SET sent_at = now(), updated_at = now()
       WHERE offer_demos.status = 'ready'`
  } catch (err) {
    if (!missingTable(err)) throw err
  }
}

/** Denní údržba: žádost bez výsledku po `DEMO_TIMEOUT_MINUTES` je nedoběhlá. */
export async function maintainOfferDemos(): Promise<number> {
  try {
    const rows = await adminDb<{ proposal_id: string }>`
      UPDATE offer_demos SET status = 'failed', error = 'timeout', updated_at = now()
       WHERE status = 'requested' AND requested_at < now() - interval '1 minute' * ${DEMO_TIMEOUT_MINUTES}
      RETURNING proposal_id::text`
    return rows.length
  } catch (err) {
    if (missingTable(err)) return 0
    throw err
  }
}
