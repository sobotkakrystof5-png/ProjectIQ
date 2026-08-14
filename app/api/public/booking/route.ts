import { bookingOptionsHandler, bookingPostHandler } from '@/lib/web-booking'

// Veřejný booking endpoint pro vizeon.cz. Implementace je sdílená s ALTENEM
// (app/api/public/booking/alteno) — viz lib/web-booking.ts.
export const OPTIONS = bookingOptionsHandler('vizeon')
export const POST = bookingPostHandler('vizeon')
