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
  // R-142. `.default('')`, aby profil uložený před R-142 dál prošel čtením —
  // jinak by admin přestal umět vystavit fakturu, dokud někdo profil neuloží.
  /** Obchodní značka (VIZEON). Právní jméno dodavatele zůstává v `name`. */
  tradeName: text(80).default(''),
  /** Údaj o zápisu do rejstříku nebo jiné evidence — povinný na obchodní listině (§ 435 OZ). */
  registry: text(300).default(''),
  phone: text(30).default(''),
  web: text(120).default(''),
}).refine(v => !v.vatPayer || v.dic.length > 0, { message: 'Plátce DPH musí mít DIČ.', path: ['dic'] })

export type IssuerProfile = z.infer<typeof issuerProfileSchema>

/**
 * Ukládání profilu je přísnější než čtení: bez údaje o zápisu by faktura
 * nesplnila § 435 občanského zákoníku, takže se profil bez něj neuloží.
 */
export const issuerProfileSaveSchema = issuerProfileSchema.refine(v => v.registry.length > 0, {
  message: 'Doplňte, kde jste zapsaní — u živnosti živnostenský rejstřík a úřad, u firmy obchodní rejstřík s oddílem a vložkou.',
  path: ['registry'],
})

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
  tradeName: '', registry: '', phone: '', web: '',
}

/** Výchozí splatnost: čtrnáct dní. */
export const DEFAULT_DUE_DAYS = 14

/**
 * Na opravené faktuře je vidět, kterou nahrazuje. Při opravě opravy se starý
 * odkaz nahradí novým, ať tam nejsou dva. Jde přepsat.
 */
export function replacementNote(note: string, number: string): string {
  const line = `Nahrazuje fakturu ${number}.`
  const base = note.replace(/\s*Nahrazuje fakturu [0-9A-Za-z/-]+\./g, '').trim()
  return (base === '' ? line : `${base} ${line}`).slice(0, 2000)
}
