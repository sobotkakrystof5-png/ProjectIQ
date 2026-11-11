import { bookingOptionsHandler, bookingPostHandler } from '@/lib/web-leads'

// Veřejný booking endpoint pro vizeon.cz. Adresa, tělo požadavku i hlavička
// x-api-key (VIZEON_API_KEY) zůstávají beze změny — formulář žije v cizím
// repozitáři. Implementace je sdílená se všemi zdroji, viz lib/web-leads.ts.
export const OPTIONS = bookingOptionsHandler('vizeon')
export const POST = bookingPostHandler('vizeon')
