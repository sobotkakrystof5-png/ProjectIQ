import { bookingOptionsHandler, bookingPostHandler } from '@/lib/web-leads'

// Veřejný booking endpoint pro alteno.cz. Stejné tělo požadavku jako
// /api/public/booking, jen `source: 'alteno_web'` a hlavička x-api-key
// ověřená proti ALTENO_API_KEY. Adresa, payload ani klíč se nemění — volá to
// cizí repozitář. Po AD02 jen poptávka padne do společného inboxu.
export const OPTIONS = bookingOptionsHandler('alteno')
export const POST = bookingPostHandler('alteno')
