import { z } from 'zod'
import { reportCallSchema } from '@/types/outreach-report'

/**
 * Kontrakt s Growth OS (repozitář vizeon-autopilot), R-112, v2 R-120.
 *
 * Growth OS posílá **snímky stavu** firem, které obvolává: jeden prvek
 * `leads[]` = jedna firma z jeho databáze D1 se vším, co o ní teď ví.
 * Opakované poslání je v pořádku (upsert podle `external_id`), starší snímek
 * novější nepřepíše (`updated_at`).
 *
 * Bez `.strict()`: když Growth OS přidá pole (vyšší `version`), starší
 * ZakazIQ ho tiše zahodí a funguje dál.
 *
 * **v2** (R-120) přidává k firmě všechny hovory (`calls[]`), e-maily
 * (`email_log[]`), historii stavů, rešerši a víc o ukázce. Všechno je
 * volitelné: snímek v1 projde beze změny. Pole, které ve snímku chybí,
 * v ZakazIQ nic nepřepíše (přepis hovoru se drží, dokud nepřijde nový).
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

/** Hovor ve snímku firmy: jako v reportu, jen bez firmy (ta je nad ním). */
export const snapshotCallSchema = reportCallSchema.omit({ lead_external_id: true, company: true })

/** Jeden e-mail, který robot firmě poslal (v2). */
export const snapshotEmailSchema = z.object({
  /** `vizeon-email:<id v D1>`, nikdy se nemění. */
  external_id: z.string().trim().min(1).max(100),
  /** cold, demo, reminder, followup — neznámý druh se uloží, jak přišel. */
  kind: z.string().trim().min(1).max(20),
  status: optText(20),
  subject: optText(300),
  /** Náš text e-mailu (jen text, žádné HTML). */
  text: optText(8000),
  scheduled_for: optDate,
  sent_at: optDate,
  delivered_at: optDate,
  opened_at: optDate,
  clicked_at: optDate,
  replied_at: optDate,
  bounced_at: optDate,
  opens: z.number().int().min(0).max(10_000).default(0),
  clicks: z.number().int().min(0).max(10_000).default(0),
})

export type SnapshotCall = z.infer<typeof snapshotCallSchema>
export type SnapshotEmail = z.infer<typeof snapshotEmailSchema>

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
  /** v2: segment importu (remeslnik, maser…) a dávka, ze které firma přišla. */
  segment: optText(40),
  source_batch: optText(120),
  /** v2: kdy robot zavolá znovu (null = už ne). */
  next_call_after: optDate,
  /** v2: schůzka, kterou si klient domluvil přímo s robotem. */
  meeting_at: optDate,
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
      /** v2 */
      slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,99}$/, 'neplatný slug').nullish(),
      /** v2: obrázek náhledu (https, admin ho stáhne přes svůj server). */
      preview_url: webUrl(true).nullish(),
      last_viewed_at: optDate,
      /** v2: nejdelší prohlížení v sekundách. */
      max_view_s: z.number().int().min(0).max(86_400).nullish(),
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
  /** v2: všechny hovory firmy, nejnovější nahoře nebo dole, na pořadí nezáleží. */
  calls: z.array(snapshotCallSchema).max(30).nullish(),
  /** v2: všechny e-maily, které robot firmě poslal. */
  email_log: z.array(snapshotEmailSchema).max(30).nullish(),
  /** v2: historie stavů z D1 (`events` typu lead.status). */
  status_history: z
    .array(z.object({ at: isoDate, status: z.string().trim().min(1).max(40) }))
    .max(60)
    .nullish(),
  /** v2: proč jsme firmu oslovili (rešerše webu před studeným e-mailem). */
  research: z
    .object({
      angle: optText(40),
      hook: optText(500),
      findings: z.array(z.string().trim().max(300)).max(10).default([]),
    })
    .nullish(),
})

/** Strop jedné dávky. Growth OS posílá po kouscích, ať je tělo malé. */
export const OUTREACH_MAX_BATCH = 100

/** Nejvyšší verze kontraktu, které tenhle ZakazIQ rozumí. Vyšší projde, nová pole zahodí. */
export const OUTREACH_CONTRACT_VERSION = 2

export const outreachPayloadSchema = z.object({
  version: z.number().int().min(1),
  leads: z.array(outreachLeadSchema).min(1).max(OUTREACH_MAX_BATCH),
})

export type OutreachLeadPayload = z.infer<typeof outreachLeadSchema>
export type OutreachPayload = z.infer<typeof outreachPayloadSchema>
