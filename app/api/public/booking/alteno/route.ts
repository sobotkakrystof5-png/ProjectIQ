import { bookingOptionsHandler, bookingPostHandler } from '@/lib/web-booking'

// Veřejný booking endpoint pro alteno.cz. Stejné tělo požadavku jako
// /api/public/booking, jen `source: 'alteno_web'` a hlavička x-api-key
// ověřená proti ALTENO_API_KEY.
export const OPTIONS = bookingOptionsHandler('alteno')
export const POST = bookingPostHandler('alteno')
