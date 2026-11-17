import { z } from 'zod'

/**
 * Kontrakt s Growth OS (repozitář vizeon-autopilot), R-112.
 *
 * Growth OS posílá **snímky stavu** firem, které obvolává: jeden prvek
 * `leads[]` = jedna firma z jeho databáze D1 se vším, co o ní teď ví.
 * Opakované poslání je v pořádku (upsert podle `external_id`), starší snímek
 * novější nepřepíše (`updated_at`).
 *
 * Bez `.strict()`: když Growth OS přidá pole (vyšší `version`), starší
 * ZakazIQ ho tiše zahodí a funguje dál.
 */

const isoDate = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'neplatné datum' })

const optDate = isoDate.nullish()
const optText = (max: number) => z.string().trim().max(max).nullish()

/** Jen http(s) — hodnota se vykreslí jako odkaz. */
const webUrl = (httpsOnly: boolean) =>
  z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((s) => (httpsOnly ? /^https:\/\//i.test(s) : /^https?:\/\//i.test(s)), {
      message: httpsOnly ? 'odkaz musí začínat https://' : 'odkaz musí začínat http(s)://',
    })

export const OUTREACH_STATUSES = [
  'new',
  'scheduled',
  'called',
  'no_answer',
  'voicemail',
  'declined',
  'callback_later',
  'do_not_call',
  'accepted',
  'meeting_booked',
  'demo_building',
  'demo_ready',
  'email_sent',
  'email_opened',
  'demo_viewed',
  'replied',
  'meeting_held',
  'won',
  'lost',
] as const

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const outreachLeadSchema = z.object({
  external_id: z.string().trim().min(1).max(100),
  updated_at: isoDate,
  company: z.string().trim().min(1).max(200),
  contact_name: optText(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+[0-9]{8,15}$/, 'telefon musí být ve tvaru +420…')
    .nullish(),
  email: z.string().trim().max(254).email().nullish(),
  website: webUrl(false).nullish(),
  industry: optText(120),
  city: optText(120),
  // Neznámý stav nesmí shodit celý snímek — nová verze Growth OS může přidat stav.
  status: z.string().trim().min(1).max(40),
  do_not_call: z.boolean().default(false),
  attempts: z.number().int().min(0).max(100).default(0),
  last_call: z
    .object({
      at: optDate,
      outcome: optText(40),
      summary: optText(2000),
      callback_at: optDate,
      callback_text: optText(200),
    })
    .nullish(),
  demo: z
    .object({
      url: webUrl(true).nullish(),
      status: optText(20),
      built_at: optDate,
      views: z.number().int().min(0).max(100_000).default(0),
      first_viewed_at: optDate,
    })
    .nullish(),
  emails: z
    .object({
      cold_sent_at: optDate,
      demo_sent_at: optDate,
      opened_at: optDate,
      clicked_at: optDate,
      replied_at: optDate,
    })
    .nullish(),
})

/** Strop jedné dávky. Growth OS posílá po kouscích, ať je tělo malé. */
export const OUTREACH_MAX_BATCH = 100

export const outreachPayloadSchema = z.object({
  version: z.number().int().min(1),
  leads: z.array(outreachLeadSchema).min(1).max(OUTREACH_MAX_BATCH),
})

export type OutreachLeadPayload = z.infer<typeof outreachLeadSchema>
export type OutreachPayload = z.infer<typeof outreachPayloadSchema>
