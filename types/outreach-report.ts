import { z } from 'zod'

/**
 * Kontrakt denních reportů z Growth OS (repozitář vizeon-autopilot), R-118.
 *
 * Growth OS po každém kole volání (a po posledním kole za celý den) pošle
 * report: čísla dne a jeden řádek za každý hovor. Opakované poslání téhož
 * dne/kola report přepíše (upsert podle `date` + `round`, hovory podle
 * `external_id`). ZakazIQ z toho skládá sekci AI asistent › Reporty
 * a Analýzu (kde hovory váznou, prompt pro Claude Code).
 *
 * Plný text reportu se **neposílá** — je plný telefonů a e-mailů. Den se
 * vykreslí ze strukturovaných dat. Přepis jen u hovorů, kde někdo zvedl;
 * ZakazIQ ho po 90 dnech smaže.
 *
 * Bez `.strict()`: novější Growth OS smí přidat pole, starší ZakazIQ je zahodí.
 */

const isoDate = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'neplatné datum' })

const count = z.number().int().min(0).max(100_000).default(0)
const seconds = z.number().min(0).max(36_000).nullish()
const optText = (max: number) => z.string().trim().max(max).nullish()

/** Výsledek hovoru, jak ho pojmenovává report autopilota (`callGroup`). */
export const CALL_RESULTS = [
  'SOUHLAS',
  'zavolat jindy',
  'neslyšel',
  'odmítl',
  'položil',
  'mlčky položil',
  'NEVOLAT',
  'nezvedl',
  'záznamník',
  'chyba',
  'čeká',
] as const

export const CHANCE_LEVELS = ['horká', 'teplá', 'vlažná', 'žádná', 'zatím nevíme'] as const

export const reportStatsSchema = z.object({
  calls: count,
  connected: count,
  silent: count,
  notAnswered: count,
  pending: count,
  accepted: count,
  hungUp: count,
  cantHear: count,
  callback: count,
  declined: count,
  dnc: count,
  failed: count,
  medianS: count,
  medianIntroS: z.number().int().min(0).max(3600).nullish(),
  lateIntro: count,
  hot: count,
  warm: count,
  lukewarm: count,
  emails: count,
  emailsSent: count,
  emailsOpened: count,
  demos: count,
  /** Cena hovorů dne, text z autopilota („0,84 €"). */
  costEur: optText(40),
  contacts: z
    .object({ total: count, reached: count, neverReached: count })
    .nullish(),
})

export const reportRoundSchema = z.object({
  round: z.number().int().min(1).max(10),
  time: optText(10),
  called: count,
  picked: count,
  accepted: count,
  declined: count,
  dnc: count,
  callback: count,
  hungUp: count,
  silent: count,
  cantHear: count,
  notAnswered: count,
  voicemail: count,
  pending: count,
})

export const reportCriterionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  success: count,
  failure: count,
  other: count,
  locked: z.boolean().default(false),
})

export const transcriptTurnSchema = z.object({
  role: z.enum(['agent', 'user']),
  /** Sekunda od začátku hovoru. */
  t: z.number().min(0).max(36_000).nullish(),
  text: z.string().max(1000),
})

export const reportCallSchema = z.object({
  /** `vizeon-call:<id hovoru v D1>`, nikdy se nemění. */
  external_id: z.string().trim().min(1).max(100),
  /** `vizeon-outreach:<id firmy v D1>` — stejný klíč jako snímky (types/outreach.ts). */
  lead_external_id: z.string().trim().min(1).max(100),
  company: z.string().trim().min(1).max(200),
  /** Kolo dne od 1. */
  round: z.number().int().min(1).max(10).nullish(),
  at: isoDate.nullish(),
  /** Neznámý výsledek nesmí shodit report — nový autopilot může přidat skupinu. */
  result: z.string().trim().min(1).max(40),
  duration_s: seconds,
  who_hung_up: optText(20),
  hangup_at_s: seconds,
  /** Za kolik sekund po první replice volaného agent představil nabídku. */
  intro_s: seconds,
  termination_reason: optText(300),
  chance: z
    .object({
      level: z.string().trim().max(20),
      why: z.array(z.string().trim().max(300)).max(10).default([]),
      action: optText(300),
    })
    .nullish(),
  summary: optText(2000),
  objections: z.array(z.string().trim().max(300)).max(20).default([]),
  failed_criteria: z
    .array(z.object({ id: z.string().trim().max(80), name: z.string().trim().max(200), rationale: optText(600) }))
    .max(20)
    .default([]),
  segment: optText(40),
  industry: optText(120),
  opening_variant: optText(10),
  /** Jen u hovorů, kde někdo zvedl. */
  transcript: z.array(transcriptTurnSchema).max(150).nullish(),
})

export const reportPayloadSchema = z.object({
  version: z.number().int().min(1),
  report: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'datum ve tvaru RRRR-MM-DD'),
    /** Průběžný report po N. kole; null = souhrn celého dne. */
    round: z.number().int().min(1).max(10).nullish(),
    generated_at: isoDate,
    subject: z.string().trim().min(1).max(300),
    stats: reportStatsSchema,
    rounds: z.array(reportRoundSchema).max(10).default([]),
    segments: z
      .record(z.string().max(40), z.object({ called: count, connected: count, accepted: count }))
      .default({}),
    criteria: z.array(reportCriterionSchema).max(50).default([]),
  }),
  calls: z.array(reportCallSchema).max(400).default([]),
})

export type ReportPayload = z.infer<typeof reportPayloadSchema>
export type ReportCallPayload = z.infer<typeof reportCallSchema>
export type ReportStats = z.infer<typeof reportStatsSchema>
export type ReportRound = z.infer<typeof reportRoundSchema>
export type ReportCriterion = z.infer<typeof reportCriterionSchema>
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>
