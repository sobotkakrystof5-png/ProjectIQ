import 'server-only'
import { revalidatePath } from 'next/cache'
import { adminDb } from '@/lib/admin/db'
import { addLeadNote, createLead, deleteLead, deleteLeadNote } from '@/app/calls-actions'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  restoreCalendarEvent,
  updateCalendarEvent,
  type CalendarEventSnapshot,
} from '@/app/calendar-actions'
import { setProjectStatus, undoProjectStatus } from '@/app/actions'
import { addProjectNote, deleteProjectNote } from '@/app/project-notes-actions'
import { addBusinessIncome, deleteBusinessIncome } from '@/app/dashboard/finance/business-income-actions'
import { createCost, deleteCost } from '@/app/costs-actions'
import { cancelIssuedInvoice, issueNewInvoice, setInvoicePaid } from '@/app/dashboard/finance/invoice-actions'
import { loadIssueDraft, loadIssuerProfile } from '@/lib/admin/invoice-issue'
import { resolveEvent, resolveInvoice, resolveLead, resolveProject } from '@/lib/admin/assistant-resolve'
import { getPragueTodayISO, isoToPragueDateAndTime, pragueDateTimeToISO } from '@/lib/prague-time'
import { mailtoHref, smsHref, whatsappHref } from '@/lib/contacts/href'
import { DEFAULT_LEAD_ORIGIN } from '@/lib/lead-origins'
import { STATUS_LABELS, STATUS_ORDER, type ProjectStatus } from '@/lib/types'
import type { Action } from '@/lib/ai/suggestion-schema'
import type { UndoToken } from '@/lib/admin/suggestions'

/**
 * Provedení akcí z plánu asistenta a jejich vrácení (AD14, od R-111 sám).
 *
 * Tvrdá pravidla, která tenhle soubor drží:
 *
 * 1. **Žádná obecná cesta do SQL.** Na každý druh akce je jeden executor
 *    a ten volá tutéž server action, jakou by zavolal lidský formulář — se
 *    stejnou validací, stejnými kontrolami kolizí a stejným zrcadlením
 *    kalendář ↔ Hovory. Asistent nemůže udělat nic, co by nešlo udělat ručně.
 *    Výjimka je založení zakázky: `createProject` posílá klientovi uvítací
 *    e-mail a přesměrovává, takže tady je vlastní úzký INSERT bez obojího.
 * 2. **Každá vratná akce vrací, jak ji vrátit** (`UndoToken`). Ten leží jen
 *    v databázi, do prohlížeče nechodí.
 * 3. **Nic se neposílá.** `send_message` jen složí odkaz (`mailto:`, `sms:`,
 *    `wa.me`); odeslání zůstává v poštovním klientu nebo v telefonu.
 * 4. **Nic se nehádá.** Záznam se najde přes `lib/admin/assistant-resolve.ts`
 *    — buď právě jeden, nebo otázka.
 *
 * Co smí běžet bez klepnutí, rozhoduje `lib/ai/action-policy.ts`, ne tenhle soubor.
 */

export type RunOutcome =
  | {
      ok: true
      message: string
      description?: string | null
      href?: string | null
      undo: UndoToken | null
    }
  | { ok: false; error: string; href?: string | null }

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function formatCzk(amount: number): string {
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(amount)} Kč`
}

function formatWhen(startsAtIso: string): string {
  const { date, time } = isoToPragueDateAndTime(startsAtIso)
  const [y, m, d] = date.split('-').map(Number)
  return `${d}. ${m}. ${y} v ${time}`
}

// ── Kontakty a kalendář ─────────────────────────────────────────────────

async function runCreateContact(a: Extract<Action, { kind: 'create_contact' }>): Promise<RunOutcome> {
  const created = await createLead({
    company_name: a.companyName,
    contact_name: a.contactName,
    phone: a.phone,
    email: a.email,
    // Teplota kontaktu je úsudek člověka, ne modelu — začíná jako vlažný.
    lead_status: 'warm',
    next_action: null,
    next_action_date: null,
    next_action_time: null,
    next_action_type: null,
    notes: a.note,
    estimated_value: null,
    call_answered: null,
  })
  return {
    ok: true,
    message: 'Kontakt zapsaný',
    description: a.companyName,
    href: '/dashboard/calls',
    undo: { type: 'lead', id: String(created.id) },
  }
}

async function runScheduleEvent(a: Extract<Action, { kind: 'schedule_event' }>): Promise<RunOutcome> {
  if (!a.date || !a.time) return { ok: false, error: 'Chybí den nebo čas termínu.' }
  const startsAt = pragueDateTimeToISO(a.date, a.time)
  if (!startsAt) return { ok: false, error: 'Den nebo čas termínu nedává smysl.' }
  const endsAt = new Date(new Date(startsAt).getTime() + a.durationMinutes * 60_000).toISOString()

  try {
    const { id } = await createCalendarEvent({
      title: a.title,
      description: a.note,
      starts_at: startsAt,
      ends_at: endsAt,
      event_type: 'manual',
      contact_name: a.contactName,
      phone: a.phone,
      email: a.email,
    })
    return {
      ok: true,
      message: 'Termín v kalendáři',
      description: `${a.title}, ${formatWhen(startsAt)}`,
      href: '/dashboard/calendar',
      undo: id ? { type: 'event_created', id } : null,
    }
  } catch (err) {
    return { ok: false, error: errorText(err, 'Termín se nepodařilo zapsat.') }
  }
}

type EventRow = {
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  event_type: 'manual' | 'block'
  contact_name: string | null
  phone: string | null
  email: string | null
}

async function loadEvent(id: string): Promise<EventRow | null> {
  const rows = await adminDb`
    SELECT e.title, e.description, e.starts_at, e.ends_at, e.event_type,
           l.contact_name, l.phone, l.email
    FROM calendar_events e
    LEFT JOIN client_leads l ON l.calendar_event_id = e.id
    WHERE e.id = ${id} AND e.event_type IN ('manual', 'block')
    LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return {
    title: String(r.title),
    description: (r.description as string | null) ?? null,
    starts_at: new Date(r.starts_at as string).toISOString(),
    ends_at: new Date(r.ends_at as string).toISOString(),
    event_type: r.event_type === 'block' ? 'block' : 'manual',
    contact_name: (r.contact_name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
  }
}

async function runMoveEvent(a: Extract<Action, { kind: 'move_event' }>): Promise<RunOutcome> {
  if (!a.date && !a.time && !a.durationMinutes) return { ok: false, error: 'Nevím, kam termín přesunout.' }
  const found = await resolveEvent(a.event)
  if (!found.ok) return found
  const before = await loadEvent(found.id)
  if (!before) return { ok: false, error: 'Termín už v kalendáři není.' }

  const old = isoToPragueDateAndTime(before.starts_at)
  const startsAt = pragueDateTimeToISO(a.date ?? old.date, a.time ?? old.time)
  if (!startsAt) return { ok: false, error: 'Nový den nebo čas nedává smysl.' }
  const durationMs = a.durationMinutes
    ? a.durationMinutes * 60_000
    : new Date(before.ends_at).getTime() - new Date(before.starts_at).getTime()
  const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString()

  try {
    await updateCalendarEvent(found.id, { ...before, starts_at: startsAt, ends_at: endsAt })
  } catch (err) {
    return { ok: false, error: errorText(err, 'Termín se nepodařilo přesunout.') }
  }
  return {
    ok: true,
    message: 'Termín přesunutý',
    description: `${before.title}: ${formatWhen(before.starts_at)} → ${formatWhen(startsAt)}`,
    href: '/dashboard/calendar',
    undo: { type: 'event_moved', id: found.id, before },
  }
}

async function runCancelEvent(a: Extract<Action, { kind: 'cancel_event' }>): Promise<RunOutcome> {
  const found = await resolveEvent(a.event)
  if (!found.ok) return found
  const snapshot = await deleteCalendarEvent(found.id)
  if (!snapshot) return { ok: false, error: 'Termín už v kalendáři není.' }
  return {
    ok: true,
    message: 'Termín zrušený',
    description: `${snapshot.title}, ${formatWhen(snapshot.starts_at)}`,
    href: '/dashboard/calendar',
    undo: { type: 'event_cancelled', snapshot: snapshot as unknown as Record<string, unknown> },
  }
}

// ── Zakázky a poznámky ──────────────────────────────────────────────────

async function runCreateProject(a: Extract<Action, { kind: 'create_project' }>): Promise<RunOutcome> {
  const name = a.clientName.trim()
  if (!name) return { ok: false, error: 'Chybí jméno klienta.' }
  // Úzký INSERT místo `createProject`: ta posílá klientovi uvítací e-mail
  // a končí přesměrováním. Asistent sám nic neposílá (R-111).
  const rows = await adminDb`
    INSERT INTO projects (client_name, client_email, client_phone, service_type, description,
                          status, progress, price, paid, deadline, deposit_paid, lead_origin, invoiced_on_ico)
    VALUES (${name}, ${a.clientEmail}, ${a.clientPhone}, ${a.serviceType}, ${a.description},
            'new', 0, ${a.price}, false, ${a.deadline}::date, false, ${DEFAULT_LEAD_ORIGIN}, false)
    RETURNING id::text AS id
  `
  const id = String(rows[0].id)
  revalidatePath('/dashboard/zakazky')
  revalidatePath('/dashboard')
  return {
    ok: true,
    message: 'Zakázka založená',
    description: [name, a.serviceType, a.price ? formatCzk(a.price) : null].filter(Boolean).join(', '),
    href: `/dashboard/${id}`,
    undo: { type: 'project', id },
  }
}

async function runProjectStatus(a: Extract<Action, { kind: 'update_project_status' }>): Promise<RunOutcome> {
  if (!STATUS_ORDER.includes(a.status as ProjectStatus)) return { ok: false, error: 'Neznámý stav zakázky.' }
  const found = await resolveProject(a.project)
  if (!found.ok) return found
  try {
    const { previousStatus } = await setProjectStatus(found.id, a.status as ProjectStatus)
    return {
      ok: true,
      message: 'Stav zakázky změněný',
      description: `${STATUS_LABELS[previousStatus]} → ${STATUS_LABELS[a.status as ProjectStatus]}`,
      href: `/dashboard/${found.id}`,
      // E-mail klientovi odchází se zpožděním a vrácený stav ho zruší (R-097).
      undo: { type: 'status', projectId: found.id, previous: previousStatus },
    }
  } catch (err) {
    return { ok: false, error: errorText(err, 'Stav zakázky se nepodařilo změnit.') }
  }
}

async function runAddNote(a: Extract<Action, { kind: 'add_note' }>): Promise<RunOutcome> {
  const content = a.noteText.trim()
  if (!content) return { ok: false, error: 'Poznámka je prázdná.' }
  if (a.target === 'project') {
    const found = await resolveProject(a.ref)
    if (!found.ok) return found
    const note = await addProjectNote(found.id, 'Kryštof', content)
    return {
      ok: true,
      message: 'Poznámka u zakázky',
      description: content.slice(0, 120),
      href: `/dashboard/${found.id}`,
      undo: { type: 'project_note', id: String(note.id), projectId: found.id },
    }
  }
  const found = await resolveLead(a.ref)
  if (!found.ok) return found
  const note = await addLeadNote(found.id, content)
  return {
    ok: true,
    message: 'Poznámka u kontaktu',
    description: content.slice(0, 120),
    href: '/dashboard/calls',
    undo: { type: 'lead_note', id: String(note.id) },
  }
}

// ── Peníze ──────────────────────────────────────────────────────────────

async function runAddPayment(a: Extract<Action, { kind: 'add_payment' }>): Promise<RunOutcome> {
  if (!a.amount || a.amount <= 0) return { ok: false, error: 'Chybí částka platby.' }
  let projectId: string | null = null
  if (a.paymentType === 'zaloha') {
    const found = await resolveProject(a.project)
    if (!found.ok) return found
    projectId = found.id
  }
  const result = await addBusinessIncome({
    kind: a.paymentType,
    amount: a.amount,
    date: a.date ?? getPragueTodayISO(),
    note: a.note ?? '',
    // Linie u zálohy se bere ze zakázky; jednorázový příjem bez údaje jde do nepřiznané (výchozí formuláře).
    declared: false,
    projectId,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    message: a.paymentType === 'zaloha' ? 'Záloha zapsaná' : 'Příjem zapsaný',
    description: [formatCzk(a.amount), a.note].filter(Boolean).join(', '),
    href: projectId ? `/dashboard/${projectId}` : '/dashboard/finance?tab=podnikani',
    undo: { type: 'income', id: result.id },
  }
}

async function runAddCost(a: Extract<Action, { kind: 'add_cost' }>): Promise<RunOutcome> {
  if (!a.amount || a.amount <= 0) return { ok: false, error: 'Chybí částka nákladu.' }
  let projectId: string | null = null
  if (a.project) {
    const found = await resolveProject(a.project)
    if (!found.ok) return found
    projectId = found.id
  }
  const { id } = await createCost({
    name: a.name.trim() || 'Náklad',
    amount: a.amount,
    cost_type: a.costType,
    category: projectId ? 'client' : a.category,
    description: a.note,
    project_id: projectId,
  })
  return {
    ok: true,
    message: 'Náklad zapsaný',
    description: `${a.name}, ${formatCzk(a.amount)}`,
    href: projectId ? `/dashboard/${projectId}` : '/dashboard/naklady',
    undo: { type: 'cost', id, projectId },
  }
}

async function invoiceLabel(id: string): Promise<{ number: string; client: string | null; paidOn: string | null }> {
  const rows = await adminDb`
    SELECT invoice_number, client_name, paid_on::text AS paid_on FROM invoices WHERE id = ${id} LIMIT 1
  `
  const r = rows[0] ?? {}
  return {
    number: String(r.invoice_number ?? ''),
    client: (r.client_name as string | null) ?? null,
    paidOn: (r.paid_on as string | null) ?? null,
  }
}

async function runMarkInvoicePaid(a: Extract<Action, { kind: 'mark_invoice_paid' }>): Promise<RunOutcome> {
  const found = await resolveInvoice(a.invoice, { unpaidOnly: true })
  if (!found.ok) return found
  const before = await invoiceLabel(found.id)
  const paidOn = a.paidOn ?? getPragueTodayISO()
  const result = await setInvoicePaid(found.id, paidOn)
  if (result.error) return { ok: false, error: result.error }
  return {
    ok: true,
    message: 'Faktura zaplacená',
    description: [before.number, before.client].filter(Boolean).join(', '),
    href: `/dashboard/faktury/${found.id}`,
    undo: { type: 'invoice_paid', id: found.id, previousPaidOn: before.paidOn },
  }
}

/**
 * Vystavení faktury. Jen po klepnutí (`confirm`) a jen tehdy, když je doklad
 * úplný: odběratel **s adresou**, popis a částka. Bez adresy by vznikl
 * doklad bez povinného údaje — a vystavený doklad už nejde opravit (R-098).
 * Co chybí, se doplní v předvyplněném formuláři.
 */
async function runIssueInvoice(a: Extract<Action, { kind: 'issue_invoice' }>): Promise<RunOutcome> {
  let projectId: string | null = null
  if (a.project) {
    const found = await resolveProject(a.project)
    if (!found.ok) return found
    projectId = found.id
  } else if (a.counterpartyName) {
    // „Vystav fakturu Kavárně" — zakázka se pozná podle odběratele, když sedí
    // právě na jednu. Jinak se fakturuje bez zakázky (a bez její částky).
    const found = await resolveProject({ id: null, hint: a.counterpartyName })
    if (found.ok) projectId = found.id
  }
  const formHref = projectId ? `/dashboard/faktury/nova?zakazka=${projectId}` : '/dashboard/faktury/nova'

  const [draft, issuer] = await Promise.all([loadIssueDraft(projectId), loadIssuerProfile()])
  if (!issuer.configured) {
    return { ok: false, error: 'Nejdřív vyplňte údaje dodavatele.', href: '/dashboard/faktury/dodavatel' }
  }
  if (issuer.profile.vatPayer) {
    return { ok: false, error: 'U plátce DPH je potřeba zvolit sazbu. Dokončete fakturu ve formuláři.', href: formHref }
  }

  const counterparty = {
    ...draft.counterparty,
    name: draft.counterparty.name || a.counterpartyName?.trim() || '',
  }
  const amount = a.amount ?? (draft.amount > 0 ? draft.amount : null)
  const description = a.description?.trim() || draft.items[0]?.description || ''

  if (!counterparty.name || !counterparty.address) {
    return { ok: false, error: 'U odběratele chybí jméno nebo adresa. Doplňte je ve formuláři.', href: formHref }
  }
  if (!amount || amount <= 0 || !description) {
    return { ok: false, error: 'Chybí popis nebo částka. Doplňte je ve formuláři.', href: formHref }
  }

  const result = await issueNewInvoice({
    projectId,
    counterparty,
    issuedOn: draft.issuedOn,
    suppliedOn: draft.suppliedOn,
    dueOn: draft.dueOn,
    currency: 'CZK',
    items: [{ description, quantity: 1, unitPrice: amount, vatRate: 0 }],
    note: '',
  })
  if (result.error || !result.id) return { ok: false, error: result.error ?? 'Fakturu se nepodařilo vystavit.', href: formHref }
  return {
    ok: true,
    message: `Faktura ${result.number ?? ''} vystavená`.replace(/\s+/g, ' '),
    description: `${counterparty.name}, ${formatCzk(amount)}`,
    href: `/dashboard/faktury/${result.id}`,
    // Vystavený doklad se nevrací — opravuje se stornem (R-098).
    undo: null,
  }
}

async function runCancelInvoice(a: Extract<Action, { kind: 'cancel_invoice' }>): Promise<RunOutcome> {
  const found = await resolveInvoice(a.invoice, { unpaidOnly: false })
  if (!found.ok) return found
  const before = await invoiceLabel(found.id)
  const result = await cancelIssuedInvoice(found.id)
  if (result.error) return { ok: false, error: result.error }
  return {
    ok: true,
    message: 'Faktura stornovaná',
    description: [before.number, before.client].filter(Boolean).join(', '),
    href: `/dashboard/faktury/${found.id}`,
    undo: null,
  }
}

// ── Zprávy ──────────────────────────────────────────────────────────────

/** Telefon a e-mail, když je model nemá: z kontaktu v Hovorech, pak ze zakázky. */
async function contactDetails(ref: { id: string | null; hint: string | null }): Promise<{ phone: string | null; email: string | null }> {
  const lead = await resolveLead(ref)
  if (lead.ok) {
    const rows = await adminDb`SELECT phone, email FROM client_leads WHERE id = ${lead.id} LIMIT 1`
    return { phone: (rows[0]?.phone as string | null) ?? null, email: (rows[0]?.email as string | null) ?? null }
  }
  const project = await resolveProject(ref)
  if (project.ok) {
    const rows = await adminDb`SELECT client_phone, client_email FROM projects WHERE id = ${project.id} LIMIT 1`
    return {
      phone: (rows[0]?.client_phone as string | null) ?? null,
      email: (rows[0]?.client_email as string | null) ?? null,
    }
  }
  return { phone: null, email: null }
}

async function runSendMessage(a: Extract<Action, { kind: 'send_message' }>): Promise<RunOutcome> {
  // Nic se neposílá. Složí se odkaz a odeslání zůstává na člověku v jeho
  // poštovním klientu nebo v telefonu.
  const known = a.phone || a.email ? { phone: a.phone, email: a.email } : await contactDetails(a.ref)
  const href =
    a.channel === 'email'
      ? mailtoHref(known.email, { subject: a.subject, body: a.body })
      : a.channel === 'sms'
        ? smsHref(known.phone, a.body)
        : whatsappHref(known.phone, a.body)

  if (!href) {
    return { ok: false, error: a.channel === 'email' ? 'Chybí e-mailová adresa.' : 'Chybí telefonní číslo.' }
  }
  return {
    ok: true,
    message: 'Zpráva připravená',
    description: 'Odeslání je na vás — text si ještě projděte.',
    href,
    undo: null,
  }
}

/** Whitelist executorů. Co tu není, se neprovede. */
export async function runAction(action: Action): Promise<RunOutcome> {
  try {
    switch (action.kind) {
      case 'create_contact':
        return await runCreateContact(action)
      case 'schedule_event':
        return await runScheduleEvent(action)
      case 'move_event':
        return await runMoveEvent(action)
      case 'cancel_event':
        return await runCancelEvent(action)
      case 'create_project':
        return await runCreateProject(action)
      case 'update_project_status':
        return await runProjectStatus(action)
      case 'add_note':
        return await runAddNote(action)
      case 'add_payment':
        return await runAddPayment(action)
      case 'add_cost':
        return await runAddCost(action)
      case 'mark_invoice_paid':
        return await runMarkInvoicePaid(action)
      case 'issue_invoice':
        return await runIssueInvoice(action)
      case 'cancel_invoice':
        return await runCancelInvoice(action)
      case 'send_message':
        return await runSendMessage(action)
      default: {
        const never: never = action
        void never
        return { ok: false, error: 'Tohle zatím neumím provést.' }
      }
    }
  } catch (err) {
    // Executor nesmí shodit celý plán — chyba jedné akce je hláška u ní.
    console.error('[asistent] akce selhala:', action.kind, err instanceof Error ? err.name : 'unknown')
    return { ok: false, error: 'Tohle se nepodařilo. Zkuste to prosím ručně.' }
  }
}

// ── Zpět ────────────────────────────────────────────────────────────────

export type UndoOutcome = { ok: true } | { ok: false; error: string }

/**
 * Vrátí jeden provedený krok. Volá tytéž server actions jako ruční „Zpět"
 * na obrazovkách (smazání termínu, obnova smazaného, návrat stavu).
 */
export async function undoStep(token: UndoToken): Promise<UndoOutcome> {
  try {
    switch (token.type) {
      case 'lead':
        await deleteLead(token.id)
        return { ok: true }
      case 'event_created':
        await deleteCalendarEvent(token.id)
        return { ok: true }
      case 'event_moved':
        await updateCalendarEvent(token.id, token.before)
        return { ok: true }
      case 'event_cancelled':
        await restoreCalendarEvent(token.snapshot as unknown as CalendarEventSnapshot)
        return { ok: true }
      case 'status':
        if (!STATUS_ORDER.includes(token.previous as ProjectStatus)) return { ok: false, error: 'Neznámý stav zakázky.' }
        await undoProjectStatus(token.projectId, token.previous as ProjectStatus)
        return { ok: true }
      case 'project_note':
        await deleteProjectNote(token.id, token.projectId)
        return { ok: true }
      case 'lead_note':
        await deleteLeadNote(token.id)
        return { ok: true }
      case 'project': {
        // Zakázka, ke které mezitím přibyly peníze nebo faktura, se nemaže —
        // smazala by se i jejich vazba. Tu ať smaže člověk vědomě.
        const rows = await adminDb`
          DELETE FROM projects p
          WHERE p.id = ${token.id}
            AND NOT EXISTS (SELECT 1 FROM finance_transactions t WHERE t.source_project_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.project_id = p.id)
          RETURNING p.id
        `
        if (rows.length === 0) {
          return { ok: false, error: 'Zakázka už má platby nebo fakturu. Smažte ji ručně, pokud opravdu chcete.' }
        }
        revalidatePath('/dashboard/zakazky')
        revalidatePath('/dashboard')
        return { ok: true }
      }
      case 'income': {
        const result = await deleteBusinessIncome(token.id)
        return result.ok ? { ok: true } : { ok: false, error: result.error }
      }
      case 'cost':
        await deleteCost(token.id, token.projectId)
        return { ok: true }
      case 'invoice_paid': {
        const result = await setInvoicePaid(token.id, token.previousPaidOn)
        return result.error ? { ok: false, error: result.error } : { ok: true }
      }
      default: {
        const never: never = token
        void never
        return { ok: false, error: 'Tohle nejde vrátit.' }
      }
    }
  } catch (err) {
    console.error('[asistent] vrácení selhalo:', token.type, err instanceof Error ? err.name : 'unknown')
    return { ok: false, error: errorText(err, 'Vrátit se to nepodařilo.') }
  }
}
