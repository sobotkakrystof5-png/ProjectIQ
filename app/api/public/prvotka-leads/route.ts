import { webLeadPostHandler } from '@/lib/web-leads'

// Příjem leadů z kontaktního formuláře na prvotka.cz. Stejný tvar payloadu
// jako /api/public/alteno-leads, jen `section: 'prvotka'`, hlavička
// `x-prvotka-lead-signature` a vlastní klíč `PRVOTKA_LEAD_WEBHOOK_SECRET`.
//
// Vlastní klíč schválně: klíč leží v cizím repozitáři webu, a kdyby unikl,
// nesmí jít poslat poptávky za vizeon.cz ani alteno.cz.
//
// Napojení samotného webu Prvotky je práce v jeho repozitáři, ne tady.
export const POST = webLeadPostHandler('prvotka')
