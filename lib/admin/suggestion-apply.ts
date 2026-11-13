import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { createLead } from '@/app/calls-actions'
import { addLeadNote } from '@/app/calls-actions'
import { createCalendarEvent } from '@/app/calendar-actions'
import { setProjectStatus } from '@/app/actions'
import { addProjectNote } from '@/app/project-notes-actions'
import { pragueDateTimeToISO } from '@/lib/prague-time'
import { mailtoHref, smsHref, whatsappHref } from '@/lib/contacts/href'
import { toLikePattern } from '@/lib/admin-search'
import { STATUS_ORDER, type ProjectStatus } from '@/lib/types'
import type { AppliedRef } from '@/lib/admin/suggestions'
import type { Proposal } from '@/lib/ai/suggestion-schema'

/**
 * Co se stane po kliknutí na „Provést" (AD14).
 *
 * Tvrdá pravidla, která tenhle soubor drží:
 *
 * 1. **Žádná obecná cesta do SQL.** Na každý druh návrhu je jeden executor
 *    a ten volá tutéž server action, jakou by zavolal lidský formulář —
 *    se stejnou validací. Návrh tedy nemůže udělat nic, co by nešlo udělat
 *    ručně na obrazovce.
 * 2. **Nic se neposílá.** `send_message` jen složí odkaz (`mailto:`, `sms:`,
 *    `wa.me`); odeslání zůstává v poštovním klientu nebo v telefonu (R-084).
 * 3. **Na peníze se nesahá.** `create_invoice_draft` nic nevystaví ani
 *    nezaloží příjem — otevře předvyplněný formulář. Admin žádný koncept
 *    faktury nemá a vystavený doklad je neměnný (R-098), takže jediný
 *    bezpečný „koncept" je rozepsaný formulář.
 * 4. **Nic se nemaže.**
 *
 * Executor nikdy nehádá, ke kterému záznamu návrh patří: buď má
 * identifikátor z kontextu, nebo nápovědu, která sedí **právě na jeden**
 * záznam. Dvě shody znamenají otázku pro člověka, ne losování.
 */

export type ApplyOutcome =
  | {
      ok: true
      ref: AppliedRef
      message: string
      description?: string
      /** Stav zakázky před změnou — jediná akce, kterou jde vzít zpět. */
      previousStatus?: ProjectStatus
    }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Nápověda → právě jedna zakázka, nebo nic. */
async function resolveProject(ref: { id: string | null; hint: string | null }): Promise<string | null> {
  if (ref.id && UUID.test(ref.id)) {
    const rows = await adminDb`SELECT id::text AS id FROM projects WHERE id = ${ref.id} LIMIT 1`
    return rows[0] ? String(rows[0].id) : null
  }
  const pattern = ref.hint ? toLikePattern(ref.hint) : null
  if (!pattern) return null
  const rows = await adminDb`
    SELECT id::text AS id FROM projects
    WHERE client_name ILIKE ${pattern} ESCAPE '\'
    ORDER BY created_at DESC LIMIT 2
  `
  return rows.length === 1 ? String(rows[0].id) : null
}

/** Nápověda → právě jeden kontakt v Hovorech, nebo nic. */
async function resolveLead(ref: { id: string | null; hint: string | null }): Promise<string | null> {
  if (ref.id && UUID.test(ref.id)) {
    const rows = await adminDb`SELECT id::text AS id FROM client_leads WHERE id = ${ref.id} LIMIT 1`
    return rows[0] ? String(rows[0].id) : null
  }
  const pattern = ref.hint ? toLikePattern(ref.hint) : null
  if (!pattern) return null
  const rows = await adminDb`
    SELECT id::text AS id FROM client_leads
    WHERE company_name ILIKE ${pattern} ESCAPE '\' OR contact_name ILIKE ${pattern} ESCAPE '\'
    ORDER BY created_at DESC LIMIT 2
  `
  return rows.length === 1 ? String(rows[0].id) : null
}

async function applyCreateLead(p: Extract<Proposal, { kind: 'create_lead' }>): Promise<ApplyOutcome> {
  const created = await createLead({
    company_name: p.companyName,
    contact_name: p.contactName,
    phone: p.phone,
    email: p.email,
    // Nový kontakt začíná jako vlažný; asistent o teplotě nic neví a škála
    // `cold`/`warm`/`hot` je úsudek člověka, ne modelu.
    lead_status: 'warm',
    next_action: null,
    next_action_date: null,
    next_action_time: null,
    next_action_type: null,
    notes: p.note,
    estimated_value: null,
    call_answered: null,
  })
  return {
    ok: true,
    ref: { kind: 'lead', id: created.id, href: '/dashboard/calls' },
    message: 'Kontakt zapsaný.',
    description: p.companyName,
  }
}

async function applyScheduleCall(p: Extract<Proposal, { kind: 'schedule_call' }>): Promise<ApplyOutcome> {
  const startsAt = pragueDateTimeToISO(p.date, p.time)
  if (!startsAt) return { ok: false, error: 'Chybí datum nebo čas — doplňte je a zkuste to znovu.' }
  const endsAt = new Date(new Date(startsAt).getTime() + p.durationMinutes * 60_000).toISOString()

  try {
    await createCalendarEvent({
      title: p.title,
      description: p.note,
      starts_at: startsAt,
      ends_at: endsAt,
      // Jediný druh, který admin zná pro zapsaný termín; `block` je blokace.
      event_type: 'manual',
      contact_name: p.contactName,
      phone: p.phone,
      email: p.email,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Termín se nepodařilo zapsat.' }
  }

  return {
    ok: true,
    ref: { kind: 'calendar', id: null, href: '/dashboard/calendar' },
    message: 'Termín je v kalendáři.',
    description: p.title,
  }
}

async function applyProjectStatus(
  p: Extract<Proposal, { kind: 'update_project_status' }>,
): Promise<ApplyOutcome> {
  const projectId = await resolveProject(p.project)
  if (!projectId) return { ok: false, error: 'Nevíme, o kterou zakázku jde. Otevřete ji a zkuste to odtamtud.' }
  if (!STATUS_ORDER.includes(p.status as ProjectStatus)) return { ok: false, error: 'Neznámý stav zakázky.' }

  const { previousStatus } = await setProjectStatus(projectId, p.status as ProjectStatus)
  return {
    ok: true,
    ref: { kind: 'project', id: projectId, href: `/dashboard/${projectId}` },
    message: 'Stav zakázky změněný.',
    // „Zpět" vrací `undoProjectStatus`; e-mail klientovi odchází se zpožděním
    // a vrácený stav ho zruší (R-097), takže vrácení je bezpečné.
    previousStatus,
  }
}

async function applyInvoiceDraft(
  p: Extract<Proposal, { kind: 'create_invoice_draft' }>,
): Promise<ApplyOutcome> {
  // Žádný zápis: asistent na peníze nesahá. Jediné, co udělá, je otevřít
  // formulář vystavení s předvyplněnou zakázkou.
  const projectId = await resolveProject(p.project)
  const href = projectId ? `/dashboard/faktury/nova?zakazka=${projectId}` : '/dashboard/faktury/nova'
  return {
    ok: true,
    ref: { kind: 'invoice-draft', id: projectId, href },
    message: 'Otevíráme formulář faktury.',
    description: 'Nic se nevystavilo — zkontrolujte položky a vystavte ji sami.',
  }
}

async function applyAddNote(p: Extract<Proposal, { kind: 'add_note' }>): Promise<ApplyOutcome> {
  if (p.target === 'project') {
    const projectId = await resolveProject(p.ref)
    if (!projectId) return { ok: false, error: 'Nevíme, ke které zakázce poznámka patří.' }
    await addProjectNote(projectId, 'Kryštof', p.noteText)
    return {
      ok: true,
      ref: { kind: 'project-note', id: projectId, href: `/dashboard/${projectId}` },
      message: 'Poznámka přidaná.',
    }
  }

  const leadId = await resolveLead(p.ref)
  if (!leadId) return { ok: false, error: 'Nevíme, ke kterému kontaktu poznámka patří.' }
  await addLeadNote(leadId, p.noteText)
  return {
    ok: true,
    ref: { kind: 'lead-note', id: leadId, href: '/dashboard/calls' },
    message: 'Poznámka přidaná.',
  }
}

async function applySendMessage(p: Extract<Proposal, { kind: 'send_message' }>): Promise<ApplyOutcome> {
  // Nic se neposílá (R-084). Složí se odkaz a odeslání zůstává na člověku
  // v jeho poštovním klientu nebo v telefonu.
  const href =
    p.channel === 'email'
      ? mailtoHref(p.email, { subject: p.subject, body: p.body })
      : p.channel === 'sms'
        ? smsHref(p.phone, p.body)
        : whatsappHref(p.phone, p.body)

  if (!href) {
    return {
      ok: false,
      error: p.channel === 'email' ? 'Chybí použitelná e-mailová adresa.' : 'Chybí použitelné telefonní číslo.',
    }
  }

  return {
    ok: true,
    ref: { kind: 'message', id: null, href },
    message: 'Zpráva je připravená.',
    description: 'Odeslání zůstává na vás — text si ještě projděte.',
  }
}

/** Whitelist executorů. Co tu není, se neprovede. */
export async function applyProposal(proposal: Proposal): Promise<ApplyOutcome> {
  switch (proposal.kind) {
    case 'create_lead':
      return applyCreateLead(proposal)
    case 'schedule_call':
      return applyScheduleCall(proposal)
    case 'update_project_status':
      return applyProjectStatus(proposal)
    case 'create_invoice_draft':
      return applyInvoiceDraft(proposal)
    case 'add_note':
      return applyAddNote(proposal)
    case 'send_message':
      return applySendMessage(proposal)
    case 'none':
      return { ok: false, error: 'K téhle větě žádná akce není.' }
    default: {
      // Nový druh návrhu bez executoru skončí tady, ne v databázi.
      const never: never = proposal
      void never
      return { ok: false, error: 'Tenhle druh návrhu zatím neumíme provést.' }
    }
  }
}
