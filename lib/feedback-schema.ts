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

const rating = z.number().int().min(1).max(5)

export const surveySchema = z.object({
  rating_cooperation: rating,
  rating_speed: rating,
  rating_design: rating,
  rating_functionality: rating,
  rating_reliability: rating,
  rating_flexibility: rating,
  reference_text: z.string().max(3000).optional(),
  // Souhlas se zveřejněním je od AD16 **dobrovolný**: klient smí spolupráci
  // ohodnotit a zveřejnění odmítnout. Jinak by „se souhlasem“ nic neznamenalo —
  // podmínkou odeslání by si ho vynutil formulář u každého.
  consent: z.boolean().default(false),
})

export type FeedbackInput = z.infer<typeof feedbackSchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type SurveyInput = z.infer<typeof surveySchema>
