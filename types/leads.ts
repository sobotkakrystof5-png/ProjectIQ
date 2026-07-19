import { z } from 'zod'

export const n8nLeadSchema = z.object({
  company_name: z.string().min(1, 'Název firmy je povinný'),
  contact_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email('Neplatný e-mail').optional(),
  notes: z.string().max(2000).optional(),
  next_action_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve formátu YYYY-MM-DD').optional(),
  next_action_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Čas musí být ve formátu HH:MM').optional(),
})

export type N8nLeadPayload = z.infer<typeof n8nLeadSchema>
