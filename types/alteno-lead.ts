import { z } from 'zod'

// Kontaktní formulář z alteno.cz — samostatná integrace, oddělená od
// veřejného booking API (app/api/public/booking/alteno). Web posílá jen
// kontaktní údaje bez konkrétního termínu konzultace; name a email jsou
// jediné povinné položky, zbytek je nepovinný podle kontraktu s webem.
export const altenoLeadSchema = z.object({
  section: z.literal('alteno'),
  source: z.literal('web_contact_form'),
  name: z.string().min(1, 'name je povinné'),
  email: z.string().email('Neplatný e-mail'),
  phone: z.string().max(30).nullish(),
  companyUrl: z.string().max(500).nullish(),
  message: z.string().max(5000).nullish(),
  toolsUsed: z.array(z.string().max(200)).nullish(),
  automationGoal: z.string().max(500).nullish(),
  createdAt: z.string().nullish(),
})

export type AltenoLeadPayload = z.infer<typeof altenoLeadSchema>
