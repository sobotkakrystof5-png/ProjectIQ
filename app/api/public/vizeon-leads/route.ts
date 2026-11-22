import { webLeadPostHandler } from '@/lib/web-leads'

// Příjem poptávek z kontaktního formuláře na vizeon.cz (R-136). Stejný tvar
// payloadu jako /api/public/prvotka-leads, jen `section: 'vizeon'`, hlavička
// `x-vizeon-lead-signature` a vlastní klíč `VIZEON_LEAD_WEBHOOK_SECRET`.
//
// Vlastní klíč schválně, ne `VIZEON_API_KEY` z bookingu: klíč leží v cizím
// repozitáři webu, a kdyby unikl, nesmí jít zakládat termíny v kalendáři ani
// posílat poptávky za alteno.cz a prvotka.cz.
//
// Web volá www.zakaziq.cz: apex přesměrovává (308) a fetch při přechodu na
// jiný host hlavičku s klíčem zahodí.
export const POST = webLeadPostHandler('vizeon')
