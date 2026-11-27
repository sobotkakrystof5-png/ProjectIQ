import { z } from 'zod'
import { isIsoDate } from '@/lib/prague-time'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import { INVOICE_KINDS } from './invoice-kinds'

/**
 * Koncept faktury (R-117) — co jde uložit rozepsané a co musí být hotové,
 * než se faktura vystaví a odešle.
 *
 * Soubor je čistý (bez databáze), aby ho četl formulář i dashboard
 * v prohlížeči a ukázal, co v konceptu ještě chybí.
 */

const text = (max: number) => z.string().trim().max(max)

/** Koncept smí být rozepsaný: jméno ani popis položky ještě nemusí být. */
export const draftItemSchema = z.object({
  description: text(200),
  quantity: z.number().finite().positive().max(100000),
  unitPrice: z.number().finite().min(0).max(9999999999.99),
  vatRate: z.union([z.literal(0), z.literal(12), z.literal(21)]),
})

export const draftFieldsSchema = z.object({
  projectId: z.string().uuid().nullable().default(null),
  counterparty: z.object({
    name: text(160),
    address: text(400),
    ico: text(8).regex(/^\d{8}$/, 'IČO má osm číslic.').or(z.literal('')),
    dic: text(20),
    /** Telefon odběratele na faktuře (R-153). Koncepty před R-153 ho nemají. */
    phone: text(40).regex(/^[+0-9 ()/-]*$/, 'Telefon může mít jen číslice, mezery a +.').optional(),
  }),
  email: text(254).email('Zkontrolujte e-mail odběratele.').or(z.literal('')),
  items: z.array(draftItemSchema).max(50, 'Nejvíc padesát položek.'),
  currency: z.enum(INVOICE_CURRENCIES),
  dueDays: z.number().int().min(0).max(90),
  /** Datum plnění; prázdné = den, kdy fakturu schválíte. */
  suppliedOn: z.string().max(10).refine(v => v === '' || isIsoDate(v), 'Vyberte platné datum.'),
  note: text(2000),
  /**
   * Druh faktury (R-143). Prázdný = koncept z doby před R-143, vystaví se
   * jako dřív. Částku zálohové, částečné a finální faktury přepočítá
   * schválení podle stavu zakázky v tu chvíli.
   */
  kind: z.enum(INVOICE_KINDS).nullish(),
  percent: z.number().finite().positive().max(100).nullish(),
})

export type DraftFields = z.infer<typeof draftFieldsSchema>

export const DRAFT_SOURCES = ['project_done', 'manual', 'assistant', 'recurring'] as const
export type DraftSource = (typeof DRAFT_SOURCES)[number]

export const DRAFT_SOURCE_LABELS: Record<DraftSource, string> = {
  project_done: 'Zakázka je hotová',
  manual: 'Uložili jste rozepsanou',
  assistant: 'Připravil asistent',
  recurring: 'Pravidelná faktura',
}

/**
 * Co chybí, aby šla faktura vystavit a poslat. Prázdný seznam = připraveno.
 * Adresa je povinná, protože vystavený doklad už nejde doplnit (R-098).
 */
export function draftGaps(fields: Pick<DraftFields, 'counterparty' | 'email' | 'items'>): string[] {
  const gaps: string[] = []
  if (!fields.counterparty.name.trim()) gaps.push('jméno odběratele')
  if (!fields.counterparty.address.trim()) gaps.push('adresa odběratele')
  if (!fields.email.trim()) gaps.push('e-mail, kam fakturu poslat')
  const filled = fields.items.filter(item => item.description.trim() !== '')
  if (filled.length === 0) gaps.push('položka s popisem')
  else if (filled.every(item => item.unitPrice * item.quantity <= 0)) gaps.push('cena')
  return gaps
}

/** „jméno odběratele a cena" — do jedné věty pro člověka. */
export function gapsSentence(gaps: string[]): string {
  if (gaps.length <= 1) return gaps[0] ?? ''
  return `${gaps.slice(0, -1).join(', ')} a ${gaps[gaps.length - 1]}`
}

// ─── Pravidelné faktury ──────────────────────────────────────────────────────

export const recurringFieldsSchema = z.object({
  label: text(160).min(1, 'Pojmenujte pravidelnou fakturu, třeba „Správa webu".'),
  projectId: z.string().uuid().nullable().default(null),
  counterparty: draftFieldsSchema.shape.counterparty.extend({
    name: text(160).min(1, 'Doplňte jméno odběratele.'),
  }),
  email: draftFieldsSchema.shape.email,
  items: z
    .array(draftItemSchema.extend({ description: text(200).min(1, 'Napište, co fakturujete.') }))
    .min(1, 'Přidejte aspoň jednu položku.')
    .max(50),
  currency: z.enum(INVOICE_CURRENCIES),
  dueDays: z.number().int().min(0).max(90),
  dayOfMonth: z.number().int().min(1, 'Den v měsíci je 1 až 28.').max(28, 'Den v měsíci je 1 až 28.'),
})

export type RecurringFields = z.infer<typeof recurringFieldsSchema>

const MONTHS = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
]

/** '2026-11' → 'listopad 2026'. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : period
}
