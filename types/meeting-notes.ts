import { z } from 'zod'

/**
 * Schůzky a přepisy (R-144): co posílá most z Wispr Flow na
 * `POST /api/public/schuzky` a co si o schůzce pamatuje AI.
 *
 * Přepis se nijak neupravuje — `transcript` se uloží přesně tak, jak přišel.
 * Proto tu není `.trim()` ani jiná úprava textu přepisu.
 */

export const MAX_TRANSCRIPT_CHARS = 1_000_000

const isoInstant = z.string().datetime({ offset: true })

export const meetingParticipantSchema = z.object({
  name: z.string().trim().max(200).nullish(),
  emails: z.array(z.string().trim().max(320)).max(10).optional().default([]),
  spoke: z.boolean().optional(),
  role: z.string().trim().max(40).optional(),
  self: z.boolean().optional(),
})

export type MeetingParticipant = {
  name: string | null
  emails: string[]
  spoke: boolean
  role: string | null
  self: boolean
}

export const meetingIngestSchema = z.object({
  source: z.literal('wispr'),
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300).nullish(),
  start: isoInstant.nullish(),
  end: isoInstant.nullish(),
  share_link: z.string().trim().max(500).nullish(),
  participants: z.array(meetingParticipantSchema).max(50).optional().default([]),
  /** Shrnutí od Wispr Flow — jen vodítko pro AI, nikde se neukazuje jako naše. */
  summary: z.string().max(20_000).nullish(),
  transcript: z.string().min(1).max(MAX_TRANSCRIPT_CHARS),
  /** Kolik znaků měl přepis podle Wispr Flow — kontrola, že se nic neztratilo. */
  transcript_chars: z.number().int().min(0).max(2 * MAX_TRANSCRIPT_CHARS).nullish(),
})

export type MeetingIngestPayload = z.infer<typeof meetingIngestSchema>

export const meetingKnownQuerySchema = z.array(z.string().trim().min(1).max(200)).min(1).max(100)

/** Výsledek AI uložený v `meeting_notes.ai` (už očištěný, viz `lib/admin/meeting-notes/ai.ts`). */
export type MeetingAi = {
  title: string
  isClient: boolean
  candidateId: string | null
  confidence: 'high' | 'medium' | 'low'
  matchReason: string
  client: {
    name: string | null
    company: string | null
    email: string | null
    phone: string | null
    ico: string | null
    web: string | null
  }
  salutation: string | null
  summary: string
  agreements: string[]
  mySteps: string[]
  clientSteps: string[]
  openQuestions: string[]
  /** Jen pro Kryštofa — do e-mailu klientovi nikdy. */
  internalNotes: string[]
  speakers: { label: string; name: string }[]
}

const str = (max: number) => z.string().max(max)
const list = (max: number) => z.array(z.string().max(600)).max(max)

/** Tvar `meeting_notes.ai` při čtení z databáze — starý nebo poškozený záznam se nevykreslí. */
export const storedMeetingAiSchema = z.object({
  title: str(200),
  isClient: z.boolean(),
  candidateId: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  matchReason: str(600),
  client: z.object({
    name: str(200).nullable(),
    company: str(200).nullable(),
    email: str(320).nullable(),
    phone: str(40).nullable(),
    ico: str(20).nullable(),
    web: str(300).nullable(),
  }),
  salutation: str(120).nullable(),
  summary: str(2000),
  agreements: list(30),
  mySteps: list(30),
  clientSteps: list(30),
  openQuestions: list(30),
  internalNotes: list(30).optional().default([]),
  speakers: z.array(z.object({ label: str(120), name: str(200) })).max(20),
})
