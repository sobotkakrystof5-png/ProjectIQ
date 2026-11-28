'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { sendPlainEmail } from '@/lib/email'
import { sendLeadMeetingEmail } from '@/lib/admin/lead-meeting'
import {
  discardCreatedLead,
  ensureLeadFor,
  finishMeetingFor,
  loadMailTarget,
  recordMailSent,
} from '@/lib/admin/lead-mail-target'
import { pragueWallClockToISO } from '@/lib/prague-time'
import { canPublish, proposalForContact, publishProposal } from '@/lib/admin/offers/proposals'
import { loadDemo, markDemoSent } from '@/lib/admin/offers/demo'

/**
 * „Poslat e-mail" (R-132): tři šablony — Portfolio, Nabídka a Schůzka
 * s Google Meet — z Hovorů, z karty kontaktu a od firem od AI asistenta.
 * Adresát je **vždy e-mail uloženého kontaktu** (server ho čte z databáze
 * podle id), z prohlížeče nepřichází; okno proto nejde použít k odeslání
 * pošty komukoli.
 *
 * Portfolio a Nabídka jsou osobní dopis z krystof@vizeon.cz. Schůzka navíc
 * vytvoří odkaz na Google Meet a zapíše termín do Hovorů a kalendáře
 * (`lib/admin/lead-meeting.ts`); adresát, který v Hovorech ještě není, se tam
 * kvůli ní založí (`lib/admin/lead-mail-target.ts`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const target = z.object({ kind: z.enum(['lead', 'contact', 'outreach']), id: z.string().regex(UUID) })

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
  z.object({ template: z.literal('portfolio'), target, subject, body }),
  // `offerId` = nabídka z navrhovače (R-155): po odeslání se zapíše jako odeslaná a odkaz začne fungovat.
  z.object({ template: z.literal('nabidka'), target, subject, body, offerId: z.string().regex(UUID).optional() }),
  // Ukázka webu k nabídce z navrhovače (R-160), s cenovou nabídkou, nebo bez ní.
  z.object({
    template: z.literal('ukazka'),
    target,
    subject,
    body,
    proposalId: z.string().regex(UUID),
    includeOffer: z.boolean(),
  }),
  z.object({
    template: z.literal('schuzka'),
    target,
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

  const recipient = await loadMailTarget(data.target)
  if (!recipient) return { ok: false, error: 'Kontakt nenalezen.' }
  if (!recipient.email) return { ok: false, error: 'Kontakt nemá vyplněný e-mail.' }

  if (data.template === 'schuzka') {
    const [y, m, d] = data.date.split('-').map(Number)
    const [h, min] = data.time.split(':').map(Number)
    const { leadId, created } = await ensureLeadFor(recipient)
    const result = await sendLeadMeetingEmail({
      leadId,
      to: recipient.email,
      startsAt: pragueWallClockToISO(y, m, d, h, min),
      minutes: data.minutes,
      subject: data.subject,
      intro: data.body,
    })
    if (!result.ok) {
      // Kontakt založený jen kvůli téhle schůzce se zahodí, ať po neúspěchu v Hovorech nezbyde.
      if (created) await discardCreatedLead(leadId).catch((e) => console.error('[Hovory] Úklid kontaktu selhal:', (e as Error).message))
      return result
    }
    // E-mail už odešel — co se nezapíše, jen se zaloguje.
    await finishMeetingFor(recipient, leadId).catch((e) => console.error('[Hovory] Převzetí firmy selhalo:', (e as Error).message))
    revalidateAll()
    return { ok: true, message: `E-mail se schůzkou odeslán (${result.when}).` }
  }

  // Ukázka jde jen kontaktu, ke kterému nabídka patří, a jen hotová (odkaz z navrhy.vizeon.cz).
  let demoUrl: string | null = null
  if (data.template === 'ukazka') {
    if (data.target.kind !== 'contact') return { ok: false, error: 'Ukázku posílejte z karty kontaktu.' }
    const proposal = await proposalForContact(data.proposalId, data.target.id)
    if (!proposal) return { ok: false, error: 'Nabídka k tomuhle kontaktu nepatří. Obnovte stránku.' }
    const { demo } = await loadDemo(proposal.id, data.target.id)
    if (demo?.status !== 'ready' || !demo.url) return { ok: false, error: 'Ukázka ještě není hotová.' }
    demoUrl = demo.url
  }

  // Nabídka z navrhovače jde jen kontaktu, ke kterému patří, a cena nad stropem jen potvrzená.
  const offerId =
    data.template === 'nabidka' ? data.offerId : data.template === 'ukazka' && data.includeOffer ? data.proposalId : undefined
  if (offerId) {
    if (data.target.kind !== 'contact') return { ok: false, error: 'Nabídku z navrhovače posílejte z karty kontaktu.' }
    const check = await canPublish(offerId, data.target.id)
    if (!check.ok) {
      return {
        ok: false,
        error:
          check.error === 'needs_confirmation'
            ? 'Cena je nad 50 000 Kč. Potvrďte ji u nabídky, pak ji pošlete.'
            : 'Nabídka k tomuhle kontaktu nepatří. Obnovte stránku.',
      }
    }
  }

  const sent = await sendPlainEmail({ to: recipient.email, subject: data.subject, text: data.body })
  if (!sent) return { ok: false, error: 'Nepodařilo se odeslat e-mail. Zkontrolujte prosím nastavení odesílání.' }

  if (offerId) {
    // E-mail už odešel: odkaz musí začít fungovat, chyba zápisu se jen zaloguje.
    await publishProposal(offerId, data.target.id).catch((err) =>
      console.error('[navrhovac] Nabídka se nezapsala jako odeslaná:', (err as Error).message.slice(0, 120)),
    )
    revalidatePath(`/dashboard/kontakty/${data.target.id}`)
    revalidatePath('/dashboard/nabidky')
  }

  if (data.template === 'ukazka' && demoUrl) {
    await markDemoSent(data.proposalId, demoUrl).catch((err) =>
      console.error('[navrhovac] Odeslání ukázky se nezapsalo:', (err as Error).message.slice(0, 120)),
    )
    revalidatePath(`/dashboard/kontakty/${data.target.id}`)
  }

  // E-mail už odešel, takže zápis do historie nesmí vrátit chybu.
  await recordMailSent(recipient, data.subject).catch((err) =>
    console.error('[Hovory] Záznam o odeslaném e-mailu se nezapsal:', (err as Error).message),
  )
  revalidateAll()
  return { ok: true, message: 'E-mail odeslán.' }
}

function revalidateAll() {
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/kontakty')
  revalidatePath('/dashboard/ai-asistent')
  revalidatePath('/dashboard')
}
