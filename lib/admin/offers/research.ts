import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { createNotification } from '@/lib/notifications'
import { safeHttpUrl, stripControlChars } from '@/lib/security/html'
import { fireRoutine, routineConfigured, type FireRoutine } from './routine'
import { normalizeResult, readStoredResult, RESULT_JSON_SCHEMA, type OfferResearchResult } from './result'
import { createProposalAfterResearch } from './proposals'

/**
 * Rozbor firmy pro navrhovač nabídek (R-147, krok N1; běh podle R-149).
 *
 * Po odevzdání se rovnou připraví návrh nabídky (`proposals.ts`, N2).
 *
 * Tok: Kryštof u kontaktu klikne → `startResearch` založí řádek ve frontě
 * (`queued`) a spustí cloudovou úlohu Claude Code (`fireRoutine`) → úloha si
 * přes `POST /api/public/rozbory` řádek vyzvedne (`claimResearch`, `running`),
 * pustí subagenty na web firmy a rešerši → výsledek pošle na
 * `POST /api/public/rozbory/[id]` (`submitResult`), server ho zkontroluje
 * (`normalizeResult`) a uloží (`done`). Karta se mezitím jen dívá do databáze.
 *
 * Neplatí se API: úloha běží v předplatném Kryštofa. Když spuštění selže,
 * rozbor počká ve frontě na ranní průchod téže úlohy (7:00).
 *
 * Úloze jde jen to, co je o firmě veřejné nebo co si o ní Kryštof zapsal
 * jako firemní údaj: název, web, IČO, město, obor a starší rešerše z Growth OS.
 * Telefon, e-mail, poznámky ani přepisy hovorů ne (DECISIONS #055, #056).
 */

/** Strop rozborů za 24 h (D-N1). Rozbory se počítají do limitu předplatného. */
export const DAILY_RUN_LIMIT = 15
/** Vyzvednutý rozbor, který se do hodiny neodevzdal, je zaseknutý. */
export const RUN_TIMEOUT_MINUTES = 60
/** Rozbor, který si žádná úloha nevyzvedla (ranní průchod je v 7:00, tohle pokryje i den bez běhu). */
export const QUEUE_TIMEOUT_HOURS = 30

/* ------------------------------------------------------------------ */
/* Propojení                                                           */
/* ------------------------------------------------------------------ */

/**
 * `not_connected` — chybí klíč, kterým se úloha hlásí (`OFFER_RESEARCH_API_KEY`), rozbor nejde spustit.
 * `queue_only` — úloha se hlásit umí, ale tlačítko ji nespustí hned; rozbor počká na ranní průchod.
 * `ready` — tlačítko úlohu spustí hned.
 */
export type ResearchSetup = 'not_connected' | 'queue_only' | 'ready'

export function intakeConfigured(): boolean {
  return (process.env.OFFER_RESEARCH_API_KEY ?? '').trim().length >= 32
}

export function researchSetup(): ResearchSetup {
  if (!intakeConfigured()) return 'not_connected'
  return routineConfigured() ? 'ready' : 'queue_only'
}

/* ------------------------------------------------------------------ */
/* Zadání                                                              */
/* ------------------------------------------------------------------ */

export type OfferBrief = {
  company: string
  person: string | null
  web: string | null
  ico: string | null
  city: string | null
  industry: string | null
  /** Starší rešerše z Growth OS (text od modelu, může být nepřesný). */
  prior: string[]
}

/** Domény, ze kterých se web firmy odvodit nedá. */
const FREEMAIL = new Set([
  'gmail.com', 'seznam.cz', 'email.cz', 'post.cz', 'centrum.cz', 'volny.cz', 'atlas.cz', 'tiscali.cz', 'quick.cz',
  'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'yahoo.com', 'protonmail.com', 'proton.me',
])

/** Web firmy z e-mailu na vlastní doméně (info@firma.cz → https://firma.cz). */
export function webFromEmail(email: string | null): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase()
  if (!domain || FREEMAIL.has(domain) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null
  return `https://${domain}`
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = stripControlChars(v).replace(/\s+/g, ' ').trim().slice(0, max)
  return t === '' ? null : t
}

/** Jméno, ze kterého je vidět e-mail, do zadání nepatří (kontakt bez jména se jmenuje adresou). */
const notEmail = (v: string | null): string | null => (v !== null && v.includes('@') ? null : v)

/** Zadání pro kontakt: kontakt (kořen sloučení) + nejnovější firma od asistenta, která na něj ukazuje. */
export async function loadBriefForContact(contactId: string, webOverride?: string | null): Promise<OfferBrief | null> {
  const [contacts, leads] = await adminDb.batch([
    {
      text: `SELECT c.display_name, c.company, c.email, c.ico
               FROM contacts c WHERE c.id = coalesce((SELECT merged_into FROM contacts WHERE id = $1), $1)`,
      params: [contactId],
    },
    {
      text: `SELECT company_name, website, industry, city, research
               FROM outreach_leads
              WHERE contact_id = coalesce((SELECT merged_into FROM contacts WHERE id = $1), $1)
              ORDER BY source_updated_at DESC LIMIT 1`,
      params: [contactId],
    },
  ])
  const c = contacts[0] as { display_name: string; company: string | null; email: string | null; ico: string | null } | undefined
  if (!c) return null
  const lead = leads[0] as
    | { company_name: string; website: string | null; industry: string | null; city: string | null; research: unknown }
    | undefined

  const research = (lead?.research ?? null) as { angle?: unknown; hook?: unknown; findings?: unknown } | null
  const prior = [
    clean(research?.angle, 300),
    clean(research?.hook, 300),
    ...(Array.isArray(research?.findings) ? research.findings.slice(0, 8).map((f) => clean(f, 300)) : []),
  ].filter((x): x is string => x !== null)

  const web =
    (webOverride !== undefined ? safeHttpUrl(webOverride) : null) ??
    safeHttpUrl(lead?.website ?? null) ??
    webFromEmail(c.email)

  const company =
    notEmail(clean(c.company, 200)) ?? notEmail(clean(lead?.company_name, 200)) ?? notEmail(clean(c.display_name, 200)) ?? 'Firma'
  const person = notEmail(clean(c.display_name, 200))
  return {
    company,
    person: person !== company ? person : null,
    web,
    ico: c.ico && /^\d{8}$/.test(c.ico.replace(/\s/g, '')) ? c.ico.replace(/\s/g, '') : null,
    city: clean(lead?.city, 80),
    industry: clean(lead?.industry, 80),
    prior,
  }
}

/** Zadání, jak ho dostane úloha. Česká jména polí, ať je čte stejně jako pokyny. */
export function briefForRoutine(brief: OfferBrief) {
  return {
    firma: brief.company,
    kontaktni_osoba: brief.person,
    web: brief.web,
    ico: brief.ico,
    mesto: brief.city,
    obor: brief.industry,
    starsi_reserse_z_growth_os: brief.prior,
  }
}

/* ------------------------------------------------------------------ */
/* Řádek                                                               */
/* ------------------------------------------------------------------ */

export type ResearchStatus = 'queued' | 'running' | 'done' | 'failed'

export type ResearchRow = {
  id: string
  status: ResearchStatus
  error: string | null
  brief: OfferBrief
  result: OfferResearchResult | null
  active_seconds: number | null
  session_url: string | null
  created_at: string
  finished_at: string | null
}

type DbRow = {
  id: string
  status: ResearchStatus
  error: string | null
  brief: unknown
  result: unknown
  active_seconds: number | null
  session_url: string | null
  created_at: string | Date
  finished_at: string | Date | null
}

const COLUMNS = 'id::text, status, error, brief, result, active_seconds, session_url, created_at, finished_at'

const iso = (v: string | Date | null): string | null => (v === null ? null : new Date(v).toISOString())

function toRow(r: DbRow): ResearchRow {
  return {
    id: r.id,
    status: r.status,
    error: r.error,
    brief: r.brief as OfferBrief,
    result: readStoredResult(r.result),
    active_seconds: r.active_seconds,
    session_url: r.session_url,
    created_at: iso(r.created_at) as string,
    finished_at: iso(r.finished_at),
  }
}

async function selectRows(where: string, params: unknown[]): Promise<ResearchRow[]> {
  const [rows] = await adminDb.batch([{ text: `SELECT ${COLUMNS} FROM offer_research ${where}`, params }])
  return (rows as DbRow[]).map(toRow)
}

/* ------------------------------------------------------------------ */
/* Spuštění (admin)                                                    */
/* ------------------------------------------------------------------ */

export type StartOutcome =
  | { ok: true; id: string; fired: boolean }
  | { ok: false; error: 'not_connected' | 'not_found' | 'already_running' | 'daily_limit' }

/** Zapíše výsledek spuštění úlohy k rozboru. Vrací, jestli se úloha spustila. */
async function fireAndRecord(id: string, fire: FireRoutine): Promise<boolean> {
  const out = await fire(id)
  if (out.ok) {
    // Úloha si rozbor mohla vyzvednout dřív, než se tohle zapsalo — proto i `running`.
    await adminDb`
      UPDATE offer_research SET session_id = ${out.sessionId}, session_url = ${out.sessionUrl}, error = NULL, updated_at = now()
       WHERE id = ${id} AND status IN ('queued', 'running')`
    return true
  }
  if (out.reason !== 'not_configured') {
    await adminDb`
      UPDATE offer_research SET error = ${out.reason === 'rate_limited' ? 'fire_rate_limited' : 'fire_failed'}, updated_at = now()
       WHERE id = ${id} AND status = 'queued'`
  }
  return false
}

export async function startResearch(
  input: { contactId: string; web?: string | null },
  fire: FireRoutine = fireRoutine,
): Promise<StartOutcome> {
  if (!intakeConfigured()) return { ok: false, error: 'not_connected' }

  const brief = await loadBriefForContact(input.contactId, input.web)
  if (brief === null) return { ok: false, error: 'not_found' }

  const today = await adminDb<{ n: number }>`
    SELECT count(*)::int AS n FROM offer_research WHERE created_at > now() - interval '24 hours'`
  if ((today[0]?.n ?? 0) >= DAILY_RUN_LIMIT) return { ok: false, error: 'daily_limit' }

  let id: string
  try {
    const rows = await adminDb<{ id: string }>`
      INSERT INTO offer_research (contact_id, status, brief)
      VALUES (${input.contactId}, 'queued', ${JSON.stringify(brief)}::jsonb)
      RETURNING id::text`
    id = rows[0].id
  } catch (err) {
    if ((err as { code?: unknown })?.code === '23505') return { ok: false, error: 'already_running' }
    throw err
  }

  const fired = await fireAndRecord(id, fire)
  return { ok: true, id, fired }
}

/** Zkusí úlohu spustit znovu pro rozbor, který čeká ve frontě. */
export async function retryFire(id: string, fire: FireRoutine = fireRoutine): Promise<ResearchRow | null> {
  const [row] = await selectRows('WHERE id = $1', [id])
  if (!row || row.status !== 'queued') return row ?? null
  await fireAndRecord(id, fire)
  return getResearch(id)
}

/** Stav jednoho rozboru pro kartu (karta se ptá, dokud rozbor není hotový). */
export async function getResearch(id: string): Promise<ResearchRow | null> {
  const [row] = await selectRows('WHERE id = $1', [id])
  return row ?? null
}

/** Rozbory u kontaktu, nejnovější první (karta ukazuje poslední a historii). */
export async function listResearchForContact(contactId: string, limit = 5): Promise<ResearchRow[]> {
  return selectRows('WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2', [contactId, limit])
}

export async function deleteResearch(id: string): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`DELETE FROM offer_research WHERE id = ${id} RETURNING id::text`
  return rows.length > 0
}

/* ------------------------------------------------------------------ */
/* Úloha (veřejný vstup s klíčem)                                      */
/* ------------------------------------------------------------------ */

export type ClaimedResearch = {
  id: string
  zadani: ReturnType<typeof briefForRoutine>
  schema: typeof RESULT_JSON_SCHEMA
}

/**
 * Vyzvedne jeden rozbor z fronty: přednostně ten, pro který byla úloha spuštěna,
 * jinak nejstarší. Atomicky: dvě souběžné úlohy nedostanou tentýž rozbor.
 */
export async function claimResearch(preferredId: string | null): Promise<ClaimedResearch | null> {
  const rows = await adminDb<{ id: string; brief: unknown }>`
    UPDATE offer_research SET status = 'running', claimed_at = now(), updated_at = now(), error = NULL
     WHERE status = 'queued'
       AND id = (
         SELECT id FROM offer_research WHERE status = 'queued'
          ORDER BY (id = ${preferredId}::uuid) DESC NULLS LAST, created_at
          LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id::text, brief`
  const row = rows[0]
  if (!row) return null
  return { id: row.id, zadani: briefForRoutine(row.brief as OfferBrief), schema: RESULT_JSON_SCHEMA }
}

export type SubmitOutcome = { ok: true } | { ok: false; reason: 'not_found' | 'not_running' | 'invalid_result' }

/** Proč rozbor odevzdat nejde: neexistuje, nebo už neběží. */
async function whyNotRunning(id: string): Promise<SubmitOutcome> {
  const rows = await adminDb<{ status: string }>`SELECT status FROM offer_research WHERE id = ${id}`
  if (!rows[0]) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'not_running' }
}

/** Převezme výsledek od úlohy. Nesedí-li na schéma, rozbor běží dál a úloha může poslat opravu. */
export async function submitResult(id: string, input: unknown): Promise<SubmitOutcome> {
  const normalized = normalizeResult(input)
  if (!normalized.ok) {
    const rows = await adminDb<{ status: string }>`SELECT status FROM offer_research WHERE id = ${id}`
    if (!rows[0]) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: rows[0].status === 'running' ? 'invalid_result' : 'not_running' }
  }
  const rows = await adminDb<{ contact_id: string | null; company: string | null }>`
    UPDATE offer_research
       SET status = 'done', result = ${JSON.stringify(normalized.result)}::jsonb, error = NULL,
           active_seconds = greatest(0, extract(epoch FROM now() - coalesce(claimed_at, created_at)))::int,
           finished_at = now(), updated_at = now()
     WHERE id = ${id} AND status = 'running'
 RETURNING contact_id::text, brief->>'company' AS company`
  const row = rows[0]
  if (!row) return whyNotRunning(id)

  if (row.contact_id !== null) {
    // Návrh nabídky se třemi variantami (N2) se připraví hned; když selže, rozbor zůstává.
    await createProposalAfterResearch(id)
    await createNotification({
      type: 'offer_research_done',
      title: `Rozbor firmy je hotový: ${(row.company ?? 'firma').slice(0, 120)}`,
      body: 'Návrh nabídky se třemi variantami čeká na kartě kontaktu.',
      link: `/dashboard/kontakty/${row.contact_id}`,
    })
  }
  return { ok: true }
}

/** Úloha hlásí, že rozbor nedokáže dokončit. Text od úlohy se neukládá, jen kód. */
export async function failResearch(id: string): Promise<SubmitOutcome> {
  const rows = await adminDb<{ id: string }>`
    UPDATE offer_research
       SET status = 'failed', error = 'gave_up',
           active_seconds = greatest(0, extract(epoch FROM now() - coalesce(claimed_at, created_at)))::int,
           finished_at = now(), updated_at = now()
     WHERE id = ${id} AND status = 'running'
 RETURNING id::text`
  return rows[0] ? { ok: true } : whyNotRunning(id)
}

/* ------------------------------------------------------------------ */
/* Údržba                                                              */
/* ------------------------------------------------------------------ */

/**
 * Denní údržba (cron client-retention): ukončí rozbory, které si úloha
 * vyzvedla a do hodiny neodevzdala, a rozbory, které nikdo nevyzvedl;
 * pak smaže staré podle retence.
 */
export async function maintainOfferResearch(): Promise<{ timedOut: number; purged: number }> {
  const stuck = await adminDb<{ id: string }>`
    UPDATE offer_research
       SET status = 'failed', error = CASE WHEN status = 'running' THEN 'timeout' ELSE 'not_started' END,
           finished_at = now(), updated_at = now()
     WHERE (status = 'running' AND coalesce(claimed_at, created_at) < now() - interval '1 minute' * ${RUN_TIMEOUT_MINUTES})
        OR (status = 'queued' AND created_at < now() - interval '1 hour' * ${QUEUE_TIMEOUT_HOURS})
 RETURNING id::text`
  const purged = await adminDb<{ n: number }>`SELECT purge_offer_research() AS n`
  return { timedOut: stuck.length, purged: purged[0]?.n ?? 0 }
}
