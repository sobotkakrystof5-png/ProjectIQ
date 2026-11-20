'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { adminDb, q } from '@/lib/admin/db'
import { sendPlainEmail } from '@/lib/email'
import { sendLeadMeetingEmail } from '@/lib/admin/lead-meeting'
import { pragueWallClockToISO } from '@/lib/prague-time'

/**
 * „Poslat e-mail" z Hovorů (R-121): tři šablony — Portfolio, Nabídka
 * a Schůzka s Google Meet. Adresát je **vždy e-mail uloženého kontaktu**,
 * z prohlížeče nepřichází; okno proto nejde použít k odeslání pošty komukoli.
 *
 * Portfolio a Nabídka jsou osobní dopis z krystof@vizeon.cz. Schůzka navíc
 * vytvoří odkaz na Google Meet a zapíše termín do Hovorů a kalendáře
 * (`lib/admin/lead-meeting.ts`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const subject = z
  .string()
  .trim()
  .min(1, 'Předmět je povinný.')
  .max(200, 'Předmět je moc dlouhý.')
  .refine((s) => !/[\r\n]/.test(s), 'Předmět musí být na jednom řádku.')

// Hranaté závorky jsou v šablonách místa pro dopsání; e-mail s nedopsaným
// místem by klient dostal doslova.
const body = z
  .string()
  .trim()
  .min(1, 'Text e-mailu je povinný.')
  .max(4000, 'Text e-mailu je moc dlouhý.')
  .refine((s) => !/\[(doplnit|sem )/i.test(s), 'V textu zůstalo místo k dopsání v hranatých závorkách.')

const schema = z.discriminatedUnion('template', [
  z.object({ template: z.enum(['portfolio', 'nabidka']), leadId: z.string().regex(UUID), subject, body }),
  z.object({
    template: z.literal('schuzka'),
    leadId: z.string().regex(UUID),
    subject,
    body,
    // Pražský čas z formuláře; okamžik z něj spočítá server.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neplatné datum.'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Neplatný čas.'),
    minutes: z.number().int().min(15).max(180),
  }),
])

export type LeadEmailResult = { ok: true; message: string } | { ok: false; error: string }

export async function sendLeadEmail(raw: unknown): Promise<LeadEmailResult> {
  await requireAuth()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }
  const data = parsed.data

  if (data.template === 'schuzka') {
    const [y, m, d] = data.date.split('-').map(Number)
    const [h, min] = data.time.split(':').map(Number)
    const result = await sendLeadMeetingEmail({
      leadId: data.leadId,
      startsAt: pragueWallClockToISO(y, m, d, h, min),
      minutes: data.minutes,
      subject: data.subject,
      intro: data.body,
    })
    if (!result.ok) return result
    revalidatePath('/dashboard/calls')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')
    return { ok: true, message: `E-mail se schůzkou odeslán (${result.when}).` }
  }

  const rows = await adminDb<{ email: string | null }>`SELECT email FROM client_leads WHERE id = ${data.leadId}`
  if (!rows[0]) return { ok: false, error: 'Kontakt nenalezen.' }
  const to = rows[0].email?.trim()
  if (!to) return { ok: false, error: 'Kontakt nemá vyplněný e-mail.' }

  const sent = await sendPlainEmail({ to, subject: data.subject, text: data.body })
  if (!sent) return { ok: false, error: 'Nepodařilo se odeslat e-mail. Zkontrolujte prosím nastavení odesílání.' }

  // E-mail už odešel, takže zápis do historie nesmí vrátit chybu.
  try {
    await adminDb.batch([
      q`UPDATE client_leads SET portfolio_sent_at = now() WHERE id = ${data.leadId}`,
      q`INSERT INTO lead_notes (lead_id, content) VALUES (${data.leadId}, ${`Odeslán e-mail „${data.subject}“.`})`,
    ])
  } catch (err) {
    console.error('[Hovory] Záznam o odeslaném e-mailu se nezapsal:', (err as Error).message)
  }
  revalidatePath('/dashboard/calls')
  return { ok: true, message: 'E-mail odeslán.' }
}
