import { z } from 'zod'
import { isIsoDate } from '@/lib/prague-time'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'

/**
 * Tvar vystavované faktury (AD12). Samostatný soubor bez `server-only`,
 * protože podle něj počítá i formulář v prohlížeči — `lib/admin/invoice-issue.ts`
 * tahá `lib/db.ts`, a ten v klientském bundlu nemá co dělat (stejný důvod
 * jako `lib/invoice-constants.ts`).
 *
 * Server si vstup validuje znovu a navíc ho ověří databáze: `admin_invoice_issue`
 * si částku i DPH počítá z položek sama a proti poslané hodnotě je porovná.
 */

const text = (max: number) => z.string().trim().max(max)
const day = z.string().max(10).refine(isIsoDate, 'Vyberte platné datum.')

/** Strana dokladu. Adresa je povinná jen u dodavatele — odběratel může být i člověk bez IČO. */
export const partySchema = z.object({
  name: text(160).min(1, 'Doplňte jméno odběratele.'),
  address: text(400),
  ico: text(8).regex(/^\d{8}$/, 'IČO má osm číslic.').or(z.literal('')),
  dic: text(20),
})

export const issuerProfileSchema = z.object({
  name: text(160).min(1, 'Doplňte jméno dodavatele.'),
  address: text(400).min(1, 'Doplňte adresu dodavatele.'),
  ico: text(8).regex(/^\d{8}$/, 'IČO má osm číslic.'),
  dic: text(20),
  /** IBAN kvůli QR platbě; bez něj se QR kód na faktuře nekreslí. */
  bank: text(40),
  email: text(254),
  vatPayer: z.boolean(),
}).refine(v => !v.vatPayer || v.dic.length > 0, { message: 'Plátce DPH musí mít DIČ.', path: ['dic'] })

export type IssuerProfile = z.infer<typeof issuerProfileSchema>

export const invoiceItemSchema = z.object({
  description: text(200).min(1, 'Napište, co fakturujete.'),
  quantity: z.number().finite().positive().max(100000),
  unitPrice: z.number().finite().min(0).max(9999999999.99),
  vatRate: z.union([z.literal(0), z.literal(12), z.literal(21)]),
})

export type InvoiceIssueItem = z.infer<typeof invoiceItemSchema>

export const issueInvoiceSchema = z.object({
  projectId: z.string().uuid().nullable().default(null),
  counterparty: partySchema,
  issuedOn: day,
  suppliedOn: day,
  dueOn: day,
  currency: z.enum(INVOICE_CURRENCIES),
  items: z.array(invoiceItemSchema).min(1, 'Přidejte aspoň jednu položku.').max(50),
  note: text(2000).default(''),
}).refine(v => v.dueOn >= v.issuedOn, { message: 'Splatnost nemůže být dřív než vystavení.', path: ['dueOn'] })

export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>

export const EMPTY_ISSUER: IssuerProfile = {
  name: '', address: '', ico: '', dic: '', bank: '', email: '', vatPayer: false,
}

/** Výchozí splatnost: čtrnáct dní. */
export const DEFAULT_DUE_DAYS = 14
