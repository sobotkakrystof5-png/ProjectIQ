import { z } from 'zod'

export const vizeonBookingSchema = z.object({
  clientName: z.string().min(2, 'Jméno musí mít alespoň 2 znaky'),
  clientEmail: z.string().email('Neplatný e-mail'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve formátu YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Čas musí být ve formátu HH:MM'),
  projectType: z.string().min(1, 'Typ projektu je povinný'),
  clientPhone: z.string().max(30).optional(),
  message: z.string().max(1000).optional(),
  source: z.literal('vizeon_web'),
})

export type VizeonBookingPayload = z.infer<typeof vizeonBookingSchema>
