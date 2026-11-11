import { z } from 'zod'

// Kontaktní formulář z webu klienta — samostatná integrace, oddělená od
// veřejného booking API (app/api/public/booking). Web posílá jen kontaktní
// údaje bez konkrétního termínu konzultace; `name` a `email` jsou jediné
// povinné položky, zbytek je nepovinný podle kontraktu s webem.
//
// Tvar zůstává přesně takový, jaký posílá alteno.cz (cizí repozitář) —
// `section` je klíč zdroje a `source` je dodnes `'web_contact_form'`.
// Položky `toolsUsed` a `automationGoal` posílá jen formulář Altena, ostatní
// weby je vynechají; proto jsou nepovinné.
export const webLeadSchemaFor = (origin: string) =>
  z.object({
    section: z.literal(origin),
    source: z.literal('web_contact_form'),
    name: z.string().min(1, 'name je povinné').max(200),
    email: z.string().max(254).email('Neplatný e-mail'),
    phone: z.string().max(30).nullish(),
    companyUrl: z.string().max(500).nullish(),
    message: z.string().max(5000).nullish(),
    toolsUsed: z.array(z.string().max(200)).nullish(),
    automationGoal: z.string().max(500).nullish(),
    createdAt: z.string().nullish(),
  })

export type WebLeadPayload = z.infer<ReturnType<typeof webLeadSchemaFor>>
