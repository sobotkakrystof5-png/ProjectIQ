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

export type FeedbackInput = z.infer<typeof feedbackSchema>
export type BookingInput = z.infer<typeof bookingSchema>
