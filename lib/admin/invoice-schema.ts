import { z } from 'zod'
import { invoiceTotal, itemTotals } from '@/lib/ws/money/calculations'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import { isValidIco } from '@/lib/ico'

/**
 * Tvar vystavované faktury: co se smí zadat a kolik to dělá (AD12).
 *
 * Schválně **bez** `server-only` a bez databáze — stejná pravidla musí platit
 * ve formuláři v prohlížeči i na serveru. Všechno, co sahá do databáze, je
 * v `lib/admin/invoicing.ts`.
 */

const text = (max: number) => z.string().trim().max(max)

export const issuerProfileSchema = z.object({
  name: text(160).min(1, 'Doplňte jméno nebo název firmy.'),
  address: text(400).min(1, 'Doplňte adresu.'),
  ico: text(8).refine(isValidIco, 'IČO nesedí — zkontrolujte číslice.'),
  dic: text(20),
  /** IBAN; bez něj se na fakturu nekreslí QR platba. */
  bank: text(80),
  email: z.string().trim().max(254).email('Zkontrolujte e-mail.').or(z.literal('')),
  phone: text(40),
  vatPayer: z.boolean(),
}).refine(v => !v.vatPayer || v.dic.length > 0, { message: 'Plátce DPH musí mít DIČ.', path: ['dic'] })

export type IssuerProfile = z.infer<typeof issuerProfileSchema>

export const EMPTY_PROFILE: IssuerProfile = {
  name: '', address: '', ico: '', dic: '', bank: '', email: '', phone: '', vatPayer: false,
}

const partySchema = z.object({
  name: text(160).min(1, 'Doplňte, komu fakturujete.'),
  address: text(400),
  ico: text(8).refine(v => v === '' || isValidIco(v), 'IČO odběratele nesedí.'),
  dic: text(20),
  email: z.string().trim().max(254).email('Zkontrolujte e-mail odběratele.').or(z.literal('')),
})

export const itemSchema = z.object({
  description: text(200).min(1, 'Popište, co fakturujete.'),
  quantity: z.number().finite().positive().max(100000),
  unitPrice: z.number().finite().min(0).max(9999999999.99),
  vatRate: z.union([z.literal(0), z.literal(12), z.literal(21)]),
})

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vyberte platné datum.')

export const issueInvoiceSchema = z.object({
  projectId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  counterparty: partySchema,
  issuedOn: isoDate,
  suppliedOn: isoDate,
  dueOn: isoDate,
  currency: z.enum(INVOICE_CURRENCIES),
  items: z.array(itemSchema).min(1, 'Přidejte aspoň jednu položku.').max(50, 'Na jednu fakturu patří nejvýš 50 položek.'),
  note: text(2000),
}).refine(v => v.dueOn >= v.issuedOn, { message: 'Splatnost nemůže být dřív než vystavení.', path: ['dueOn'] })

export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>

export type InvoiceItemInput = z.infer<typeof itemSchema>

/** Může se fakturovat? Bez těchhle údajů by doklad nebyl platný. */
export function profileReady(profile: IssuerProfile): boolean {
  return issuerProfileSchema.safeParse(profile).success
}

/** Součty dokladu v korunách — jediné místo, kde se počítá cena faktury. */
export function invoiceSums(items: InvoiceItemInput[]): { amount: number; vat: number } {
  return {
    amount: invoiceTotal(items),
    vat: Math.round(items.reduce((sum, item) => sum + itemTotals(item).vat * 100, 0)) / 100,
  }
}

/**
 * Zakázka pro výběr ve formuláři, i s tím, co z ní jde předvyplnit:
 * odběratel z kontaktu (AD09), adresa z jeho poslední faktury a částka
 * jako cena zakázky minus už zaplacená záloha.
 */
export type IssueProjectOption = {
  id: string
  clientName: string
  description: string | null
  /** Co zbývá doúčtovat: cena bez zaplacené zálohy. */
  remaining: number | null
  counterparty: { name: string; address: string; ico: string; dic: string; email: string }
  contactId: string | null
}

export type IssueOptions = {
  profile: IssuerProfile
  projects: IssueProjectOption[]
}
