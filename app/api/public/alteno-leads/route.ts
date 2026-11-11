import { webLeadPostHandler } from '@/lib/web-leads'

// Příjem leadů z kontaktního formuláře na alteno.cz (samostatný repozitář).
// Adresa, payload (`section: 'alteno'`, `source: 'web_contact_form'`), hlavička
// `x-alteno-lead-signature` a klíč `ALTENO_LEAD_WEBHOOK_SECRET` zůstávají
// beze změny. Implementace je sdílená se všemi zdroji — lib/web-leads.ts.
export const POST = webLeadPostHandler('alteno')
