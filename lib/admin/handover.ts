import 'server-only'
import { adminDb, batchTolerant, q } from '@/lib/admin/db'
import { loadIssuerProfile } from '@/lib/admin/invoice-issue'
import { redactSensitive } from '@/lib/project-activity'
import { getPragueTodayISO } from '@/lib/prague-time'
import {
  cleanHandover,
  EMPTY_HANDOVER,
  handoverIsEmpty,
  handoverSchema,
  handoverTexts,
  type HandoverDoc,
} from './handover-schema'

/**
 * Předávací dokument (AD16): co bylo dodané, kde má klient přístupy a co je
 * a není v ceně údržby.
 *
 * Tři věci, které tu platí tvrdě:
 *  1. **Žádné heslo.** Do dokumentu patří, *kde* přístup je, ne čím se
 *     odemyká. Text proto jde přes `redactSensitive()` a když se v něm
 *     cokoli najde, uložení se odmítne celé — stejně jako u paměti (R-101).
 *     Dokument se posílá klientovi e-mailem, takže heslo v něm by skončilo
 *     v cizí schránce.
 *  2. **Nic se nedomýšlí.** Předvyplní se jen to, co v databázi je: popis
 *     zakázky a položky poslední vystavené faktury. Zbytek napíše člověk.
 *  3. **Vystavení je okamžik, ne stav.** `handover_issued_at` se zapíše při
 *     stažení PDF a plní krok „Předáno" v průvodce (AD11).
 *
 * Bez migrace 112 sloupce nejsou. Funkce to poznají (`42703`) a vrátí
 * „není k dispozici" místo aby shodily detail zakázky.
 */

export type HandoverState = {
  /** Migrace 112 proběhla a dokument jde ukládat. */
  available: boolean
  doc: HandoverDoc
  /** Dokument už někdo uložil (ne jen předvyplnil). */
  saved: boolean
  issuedAt: string | null
}

export type HandoverSaveResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string })?.code === '42703'
}

function parseDoc(raw: unknown): HandoverDoc | null {
  if (raw === null || raw === undefined) return null
  const value = typeof raw === 'string' ? safeJson(raw) : raw
  const parsed = handoverSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Co se nabídne, než to někdo přepíše: popis zakázky jako shrnutí a položky
 * poslední vystavené faktury jako seznam dodaného. Víc ne — co bylo doopravdy
 * předané, ví jen člověk (B10).
 */
export function prefillHandover(input: {
  description: string | null
  clientName: string
  invoiceItems: { description?: unknown }[]
}): HandoverDoc {
  const items = input.invoiceItems
    .map((item) => String(item?.description ?? '').trim())
    .filter((label) => label !== '')
    .slice(0, 20)
    .map((label) => ({ label, note: '' }))

  return {
    ...EMPTY_HANDOVER,
    summary: input.description?.trim() ?? '',
    items,
  }
}

/** Dokument zakázky — uložený, nebo předvyplněný z toho, co o ní víme. */
export async function loadHandover(projectId: string): Promise<HandoverState | null> {
  if (!UUID.test(projectId)) return null

  const [projectRows, invoiceRows] = await batchTolerant([
    q`SELECT client_name, description,
             to_jsonb(projects) ->> 'handover' AS handover,
             to_jsonb(projects) ->> 'handover_issued_at' AS handover_issued_at
        FROM projects WHERE id = ${projectId} LIMIT 1`,
    q`SELECT items FROM invoices
       WHERE project_id = ${projectId} AND items IS NOT NULL
       ORDER BY issued_on DESC, created_at DESC LIMIT 1`,
  ])

  const project = projectRows[0] as
    | { client_name: string; description: string | null; handover: string | null; handover_issued_at: string | null }
    | undefined
  if (!project) return null

  const available = await handoverAvailable()
  const saved = parseDoc(project.handover)
  const rawItems = invoiceRows[0]?.items
  const invoiceItems = Array.isArray(rawItems)
    ? (rawItems as { description?: unknown }[])
    : typeof rawItems === 'string'
      ? ((safeJson(rawItems) as { description?: unknown }[] | null) ?? [])
      : []

  return {
    available,
    saved: saved !== null,
    issuedAt: project.handover_issued_at,
    doc:
      saved ??
      prefillHandover({
        description: project.description,
        clientName: project.client_name,
        invoiceItems,
      }),
  }
}

let columnReady: boolean | null = null

export function resetHandoverReadyForTests(): void {
  columnReady = null
}

export async function handoverAvailable(): Promise<boolean> {
  if (columnReady !== null) return columnReady
  try {
    await adminDb`SELECT handover FROM projects LIMIT 1`
    columnReady = true
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    columnReady = false
  }
  return columnReady
}

/**
 * Uloží dokument. Odmítne text, ve kterém `redactSensitive()` cokoli našlo —
 * klíč, connection string, řádek z `.env` nebo cestu v domovské složce.
 */
export async function saveHandover(projectId: string, input: unknown): Promise<HandoverSaveResult> {
  if (!UUID.test(projectId)) return { ok: false, error: 'Zakázka nenalezena.' }

  const parsed = handoverSchema.safeParse(cleanHandover(input))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte vyplněné údaje.' }
  }
  const doc = parsed.data

  for (const value of handoverTexts(doc)) {
    if (redactSensitive(value).found) {
      return {
        ok: false,
        error: 'V textu je něco, co vypadá jako heslo nebo klíč. Do předávacího dokumentu napište jen to, kde přístup je — heslo pošlete jinudy.',
      }
    }
  }

  try {
    await adminDb`
      UPDATE projects SET handover = ${JSON.stringify(doc)}::jsonb, updated_at = now()
      WHERE id = ${projectId}
    `
  } catch (err) {
    if (isMissingColumn(err)) {
      return { ok: false, error: 'Předávací dokument zatím nejde uložit — chybí migrace 112.' }
    }
    throw err
  }
  return { ok: true }
}

export type HandoverForPdf = {
  doc: HandoverDoc
  projectTitle: string
  clientName: string
  issuerName: string
  issuedOn: string
  filename: string
}

/**
 * Podklad pro PDF. Vystavení se **zapisuje** (`handover_issued_at`), takže
 * průvodka pozná krok „Předáno" a klient i Kryštof vidí, kdy dokument vznikl.
 */
export async function loadHandoverForPdf(projectId: string): Promise<HandoverForPdf | null> {
  const state = await loadHandover(projectId)
  if (!state || !state.saved || handoverIsEmpty(state.doc)) return null

  const [rows] = await adminDb.batch([
    {
      text: `SELECT client_name,
                    coalesce(nullif(btrim(coalesce(description, '')), ''), client_name) AS title
             FROM projects WHERE id = $1 LIMIT 1`,
      params: [projectId],
    },
  ])
  const project = rows[0] as { client_name: string; title: string } | undefined
  if (!project) return null

  const issuer = await loadIssuerProfile()
  const issuedOn = getPragueTodayISO()

  // Razítko vystavení. Chybějící sloupec se tiše přejde — PDF se stáhne,
  // jen průvodka o tom neví.
  try {
    await adminDb`UPDATE projects SET handover_issued_at = now() WHERE id = ${projectId}`
  } catch (err) {
    if (!isMissingColumn(err)) throw err
  }

  return {
    doc: state.doc,
    projectTitle: project.title,
    clientName: project.client_name,
    issuerName: issuer.profile.name || 'ZakazIQ',
    issuedOn,
    filename: `predani-${slug(project.title)}-${issuedOn}.pdf`,
  }
}

/** Název souboru bez diakritiky a mezer — ať ho otevře i Windows. */
function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'zakazka'
  )
}
