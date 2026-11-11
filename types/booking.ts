import { z } from 'zod'

// Poptávka s termínem z webu klienta. Tvar je pro všechny weby stejný, liší se
// jen `source` — a ten musí zůstat přesně takový, jaký web posílá: formuláře
// žijí v cizích repozitářích (vizeon.cz, alteno.cz), takže změna schématu je
// rozbije. Nová hodnota se přidá do LEAD_ORIGINS, schéma se nemění.
const bookingFields = {
  // Horní délky má každé pole (B13): skutečný formulář je nikdy nenaplní,
  // ale bez nich by se do databáze vešel libovolně dlouhý text.
  clientName: z.string().min(2, 'Jméno musí mít alespoň 2 znaky').max(200),
  clientEmail: z.string().max(254).email('Neplatný e-mail'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve formátu YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Čas musí být ve formátu HH:MM'),
  projectType: z.string().min(1, 'Typ projektu je povinný').max(200),
  clientPhone: z.string().max(30).optional(),
  message: z.string().max(1000).optional(),
}

/** Schéma objednávky pro jeden zdroj — `source` je jeho pevná hodnota. */
export const bookingSchemaFor = (source: string) =>
  z.object({ ...bookingFields, source: z.literal(source) })

export type BookingPayload = z.infer<ReturnType<typeof bookingSchemaFor>>
