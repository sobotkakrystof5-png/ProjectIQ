import { z } from 'zod'
import { isIsoDate } from '../time'

export const dateSchema = z.string().max(10).refine(isIsoDate, 'Vyberte platné datum.')
export const currencySchema = z.enum(['CZK', 'EUR'])
export const amountSchema = z.number().finite().min(0).max(9999999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001)
const text = (n: number) => z.string().trim().max(n)
export const partySchema = z.object({
 name: text(160).min(1), address: text(400).min(1), ico: text(8).regex(/^\d{8}$/).or(z.literal('')),
 dic: text(20), email: text(254).email().or(z.literal('')), bank: text(80),
})
export const itemSchema = z.object({
 description: text(200).min(1), quantity: z.number().finite().positive().max(100000).multipleOf(0.001),
 unitPrice: amountSchema, vatRate: z.union([z.literal(0), z.literal(12), z.literal(21)]),
})
export const issueSchema = z.object({
 slug: text(60).min(1), jobId: z.string().uuid().nullable(), customerId: z.string().uuid().nullable(),
 issuer: partySchema.extend({ vatPayer: z.boolean() }), counterparty: partySchema,
 issuedOn: dateSchema, suppliedOn: dateSchema, dueOn: dateSchema, currency: currencySchema,
 items: z.array(itemSchema).min(1).max(50), note: text(2000),
}).refine(v => v.dueOn >= v.issuedOn, 'Splatnost musí být po vystavení.')
 .refine(v => v.issuer.ico.length === 8, 'Doplňte IČO dodavatele.')
 .refine(v => !v.issuer.vatPayer || v.issuer.dic.length > 0, 'Doplňte DIČ dodavatele.')
 .refine(v => v.issuer.vatPayer || v.items.every(i => i.vatRate === 0), 'Neplátce nemůže účtovat DPH.')
export type IssueInput = z.infer<typeof issueSchema>
export type Party = z.infer<typeof partySchema>
export type InvoiceItem = z.infer<typeof itemSchema>
export const paymentSchema = z.object({ slug: text(60).min(1), id: z.string().uuid(), day: dateSchema, method: z.enum(['cash','card','transfer','other']) })
export const transactionSchema = z.object({
 slug: text(60).min(1), kind: z.enum(['income','expense']), amount: amountSchema.refine(v=>v>0), currency: currencySchema,
 day: dateSchema, category: text(80).min(1), description: text(500), method: z.enum(['cash','card','transfer','other']),
})
export const taxSchema = z.object({
 slug: text(60).min(1), mode: z.enum(['flat_expenses','real','flat_tax']), flatRate: z.union([z.literal(30),z.literal(40),z.literal(60),z.literal(80)]),
 vatPayer: z.boolean(), sideActivity: z.boolean(), months: z.number().int().min(1).max(12),
 healthMinimum: z.boolean(), taxpayerCredit: z.boolean(), flatBand: z.union([z.literal(1),z.literal(2),z.literal(3)]),
 filing: z.enum(['paper','electronic','advisor']), advances: amountSchema,
}).refine(v=>v.mode!=='flat_tax'||!v.vatPayer, 'Plátce DPH nemůže využít paušální daň.')
export type TaxSettings = Omit<z.infer<typeof taxSchema>, 'slug'>
export { DEFAULT_TAX } from './defaults'
