'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { linkOutreachContact, propagateContact, syncOutreachContact } from '@/lib/admin/contact-sync'
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

  // Kontakt firmy (R-141): už propojený, jinak podle telefonu a e-mailu, jinak nový.
  const contactId =
    source.contact_id ??
    (await ensureContact({
      name: source.contact_name ?? source.company_name,
      company: source.company_name,
      email: source.email,
      phone: source.phone,
      source: 'growth-os',
    }))
  if (contactId) await linkOutreachContact(id, contactId)

  const callback = source.callback_at
    ? isoToPragueDateAndTime(new Date(source.callback_at).toISOString())
    : null
  const nextAction = callback
    ? `Zavolat — domluveno s asistentem${source.callback_text ? ` (${source.callback_text})` : ''}`
    : source.demo_url
      ? 'Zavolat — zeptat se na ukázku'
      : 'Zavolat'

  // Jeden příkaz: nejdřív firmu „zabrat" (jen dokud nemá kontakt v Hovorech),
  // teprve ze záboru založit kontakt. Dvojklik nebo dvě karty tak nezaloží
  // dva řádky — druhý UPDATE počká na zámek řádku a podmínku už nesplní.
  // Cizí klíč na nový kontakt Postgres kontroluje až na konci příkazu.
  // Audit 2026-11-24, #23.
  const newLeadId = randomUUID()
  const rows = await adminDb<{ id: string }>`
    WITH claim AS (
      UPDATE outreach_leads
         SET client_lead_id = ${newLeadId}::uuid, handled_at = now(), handled_reason = 'prevzato', updated_at = now()
       WHERE id = ${id} AND client_lead_id IS NULL
      RETURNING id
    )
    INSERT INTO client_leads (
      id, company_name, contact_name, phone, email, lead_status, next_action, next_action_type,
      next_action_date, next_action_time, notes, contact_id
    )
    SELECT
      ${newLeadId}::uuid,
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
    FROM claim
    RETURNING id::text AS id
  `
  const leadId = rows[0]?.id
  if (!leadId) {
    // Někdo byl rychlejší (druhé kliknutí) — vrátit jeho kontakt, nic nezakládat.
    const winner = await loadOutreachSource(id)
    if (winner?.client_lead_id) return { ok: true, leadId: winner.client_lead_id }
    return { ok: false, error: 'Kontakt se nepodařilo založit.' }
  }

  if (contactId) {
    try {
      await propagateContact(contactId)
    } catch (err) {
      console.error('[outreach] doplnění údajů po převzetí selhalo', (err as Error).message)
    }
  }
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/ai-asistent')
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
  revalidatePath('/dashboard/ai-asistent')
}

/** „Zpět" — firma se do fronty vrátí. */
export async function undoDismissOutreachLead(id: string): Promise<void> {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Firma nenalezena.')
  await restoreOutreachLead(id)
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/ai-asistent')
}

/**
 * „Uložit do Kontaktů" (R-141): firma dostane kontakt (najde se podle telefonu
 * a e-mailu, jinak nový) a její údaje se propíšou. Vrací id kontaktu, ať jde
 * rovnou otevřít jeho karta — tam se e-mail a telefon opravují pro všechny.
 */
export async function openOutreachContact(id: string): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  await requireAuth()
  if (!UUID.test(id)) return { ok: false, error: 'Firma nenalezena.' }
  const contactId = await syncOutreachContact(id)
  if (!contactId) return { ok: false, error: 'Kontakt nejde založit: firma nemá telefon ani e-mail.' }
  revalidatePath('/dashboard/kontakty')
  revalidatePath(`/dashboard/ai-asistent/kontakt/${id}`)
  return { ok: true, contactId }
}
