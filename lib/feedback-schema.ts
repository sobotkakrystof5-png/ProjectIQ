import { z } from 'zod'

export const feedbackSchema = z.object({
  nps: z.number().int().min(1).max(10),
  content: z.string().max(2000).optional(),
})

export const bookingSchema = z.object({
  clientWish: z.string().min(1).max(1000),
  scheduledAt: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Neplatný datum/čas' }),
  channel: z.enum(['whatsapp', 'teams', 'meet', 'phone', 'other']),
  channelOtherText: z.string().max(200).optional(),
  clientEmail: z.string().email({ message: 'Neplatný e-mail' }),
}).refine(d => d.channel !== 'other' || (d.channelOtherText ?? '').trim().length > 0, {
  message: 'Upřesněte preferovaný kanál',
  path: ['channelOtherText'],
})

/**
 * Dotazník spokojenosti (R-119). Povinná je jen známka 0–10; čtyři oblasti
 * a texty jsou nepovinné. Délky hlídá server, ne jen formulář.
 */
const npsScore = z
  .number({ message: 'Vyberte prosím číslo od 0 do 10.' })
  .int({ message: 'Vyberte prosím číslo od 0 do 10.' })
  .min(0, { message: 'Vyberte prosím číslo od 0 do 10.' })
  .max(10, { message: 'Vyberte prosím číslo od 0 do 10.' })
const area = z.number().int().min(1).max(5).nullable().optional()
const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, { message }).optional()

export const surveyScoreSchema = z.object({ nps: npsScore })

export const surveySchema = z.object({
  nps: npsScore,
  rating_result: area,
  rating_communication: area,
  rating_schedule: area,
  rating_value: area,
  improve_text: optionalText(2000, 'Text je moc dlouhý, zkraťte ho prosím pod 2 000 znaků.'),
  reference_text: optionalText(3000, 'Reference je moc dlouhá, zkraťte ji prosím pod 3 000 znaků.'),
  // Souhlas se zveřejněním je dobrovolný (AD16) a od R-119 má tři úrovně.
  publish_mode: z.enum(['named', 'anonymous', 'private']).default('private'),
  reviewer_role: optionalText(120, 'Firma nebo pozice může mít nejvýš 120 znaků.'),
})

export type SurveyInput = z.infer<typeof surveySchema>
