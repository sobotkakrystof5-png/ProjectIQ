'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import {
  loadOutreachSource,
  markOutreachHandled,
  restoreOutreachLead,
  takeoverNote,
} from '@/lib/admin/outreach'
import { isoToPragueDateAndTime } from '@/lib/prague-time'

/**
 * Co se dá udělat s firmou od AI asistenta (R-112).
 *
 * Stejně jako AI leady (AD16) se **nepíše druhá cesta k zakázce**: firma se
 * převezme do Hovorů jako každý jiný kontakt a dál ji vede to, co Hovory
 * umí — plánovaný hovor v kalendáři, poznámky, převod na zakázku.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OutreachResult = { ok: true; leadId: string } | { ok: false; error: string }

/**
 * Převezme firmu do Hovorů. Když si klient v hovoru řekl o čas, stane se
 * z něj plánovaný hovor (ukáže se v kalendáři). Podruhé nic nezdvojí.
 */
export async function takeOverOutreachLead(id: string): Promise<OutreachResult> {
  await requireAuth()
  if (!UUID.test(id)) return { ok: false, error: 'Firma nenalezena.' }

  const source = await loadOutreachSource(id)
  if (!source) return { ok: false, error: 'Firma nenalezena.' }
  if (source.client_lead_id) return { ok: true, leadId: source.client_lead_id }

  const contactId = await ensureContact({
    name: source.contact_name ?? source.company_name,
    company: source.company_name,
    email: source.email,
    phone: source.phone,
    source: 'growth-os',
  })

  const callback = source.callback_at
    ? isoToPragueDateAndTime(new Date(source.callback_at).toISOString())
    : null
  const nextAction = callback
    ? `Zavolat — domluveno s asistentem${source.callback_text ? ` (${source.callback_text})` : ''}`
    : source.demo_url
      ? 'Zavolat — zeptat se na ukázku'
      : 'Zavolat'

  const rows = await adminDb<{ id: string }>`
    INSERT INTO client_leads (
      company_name, contact_name, phone, email, lead_status, next_action, next_action_type,
      next_action_date, next_action_time, notes, contact_id
    ) VALUES (
      ${source.company_name},
      ${source.contact_name},
      ${source.phone},
      ${source.email},
      'new',
      ${nextAction},
      'call',
      ${callback?.date ?? null}::date,
      ${callback?.time ?? null}::time,
      ${takeoverNote(source) || null},
      ${contactId}
    )
    RETURNING id::text AS id
  `
  const leadId = rows[0]?.id
  if (!leadId) return { ok: false, error: 'Kontakt se nepodařilo založit.' }

  await markOutreachHandled(id, 'prevzato', leadId)
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/kontakty')
  revalidatePath('/dashboard/calendar')
  return { ok: true, leadId }
}

/** „Nemá zájem" — firma zmizí z fronty, v databázi zůstane. */
export async function dismissOutreachLead(id: string): Promise<void> {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Firma nenalezena.')
  await markOutreachHandled(id, 'nezajem', null)
  revalidatePath('/dashboard/calls')
}

/** „Zpět" — firma se do fronty vrátí. */
export async function undoDismissOutreachLead(id: string): Promise<void> {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Firma nenalezena.')
  await restoreOutreachLead(id)
  revalidatePath('/dashboard/calls')
}
