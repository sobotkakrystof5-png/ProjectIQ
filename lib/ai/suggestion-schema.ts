import { z } from 'zod'
import { STATUS_ORDER } from '@/lib/types'

/**
 * Plán asistenta: jedna věta → **několik akcí** (R-111, dřív jeden návrh v AD14).
 *
 * Model **nedostane žádný nástroj a nic nevykoná** — vrací tenhle tvar a
 * provede ho server: vratné akce hned (se „Zpět"), ostatní po klepnutí
 * (`lib/ai/action-policy.ts`). Vynucené `tool_choice` na sonnet-5-5 vrací
 * 400, takže strukturovaný výstup je i jediná cesta, která funguje.
 *
 * Nepovinná pole jsou `nullable()`. Model je ale nevyplňuje jako `null` —
 * API pustí nejvýš 16 polí s `null` a 24 nepovinných, my jich máme přes
 * padesát. Model proto píše prázdný text nebo nulu a `lib/ai/plan-format.ts`
 * je před kontrolou převede na `null`; dál v kódu se s nimi pracuje stejně.
 *
 * Soubor je čistý (bez databáze a bez `server-only`): totéž schéma parsuje
 * odpověď modelu i uložený řádek při potvrzení a čte ho i prohlížeč, aby
 * uměl plán vykreslit.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const dateField = z.string().regex(DATE).nullable().default(null).describe('Datum YYYY-MM-DD; prázdné, když nezaznělo')
const timeField = z.string().regex(TIME).nullable().default(null).describe('Čas HH:MM ve 24hodinovém tvaru; prázdný, když nezazněl')
const text = (max: number) => z.string().max(max)
const optionalText = (max: number) => z.string().max(max).nullable().default(null)
const money = z.number().min(0).max(100_000_000).nullable().default(null).describe('Částka v Kč bez měny; 0, když nezazněla')

/** Odkaz na záznam. `id` jen když je v kontextu, jinak `hint` k dohledání podle jména. */
const refSchema = z.object({
  id: z.string().nullable().default(null).describe('Identifikátor záznamu z kontextu; jinak prázdné'),
  hint: optionalText(160).describe('Jméno, firma nebo číslo, podle kterého záznam poznat'),
})

/** Termín se pozná podle jména a dne — „zruš ten čtvrteční s Novákem". */
const eventRefSchema = refSchema.extend({
  date: dateField.describe('Den, kdy termín je, pokud ho věta zmiňuje'),
})

export const SUGGESTION_KINDS = [
  'create_contact',
  'schedule_event',
  'move_event',
  'cancel_event',
  'create_project',
  'update_project_status',
  'add_note',
  'add_payment',
  'add_cost',
  'mark_invoice_paid',
  'issue_invoice',
  'cancel_invoice',
  'send_message',
  'update_contact',
  'update_project',
  'update_event',
  'remember',
] as const

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

/** Co se ukáže nad akcí. Česky a slovesem, ať je vidět, co se stane. */
export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  create_contact: 'Zapsat kontakt',
  schedule_event: 'Zapsat termín',
  move_event: 'Přesunout termín',
  cancel_event: 'Zrušit termín',
  create_project: 'Založit zakázku',
  update_project_status: 'Posunout stav zakázky',
  add_note: 'Přidat poznámku',
  add_payment: 'Zapsat platbu',
  add_cost: 'Zapsat náklad',
  mark_invoice_paid: 'Faktura zaplacena',
  issue_invoice: 'Připravit fakturu',
  cancel_invoice: 'Stornovat fakturu',
  send_message: 'Připravit zprávu',
  update_contact: 'Upravit kontakt',
  update_project: 'Upravit zakázku',
  update_event: 'Upravit termín',
  remember: 'Zapamatovat si',
}

export const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create_contact'),
    companyName: text(160).describe('Firma nebo jméno, pod kterým kontakt vedeme'),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
    note: optionalText(600),
  }),
  z.object({
    kind: z.literal('schedule_event'),
    title: text(120).describe('Název termínu, typicky s kým a proč'),
    date: dateField,
    time: timeField,
    durationMinutes: z.number().int().min(15).max(480).describe('Délka v minutách; když neřekl, dej 60'),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
    note: optionalText(500),
  }),
  z.object({
    kind: z.literal('move_event'),
    event: eventRefSchema,
    date: dateField.describe('Nový den; prázdné = stejný den'),
    time: timeField.describe('Nový čas; prázdný = stejný čas'),
    durationMinutes: z.number().int().min(15).max(480).nullable().default(null).describe('Nová délka; 0 = beze změny'),
  }),
  z.object({
    kind: z.literal('cancel_event'),
    event: eventRefSchema,
  }),
  z.object({
    kind: z.literal('create_project'),
    clientName: text(160).describe('Klient nebo firma'),
    clientEmail: optionalText(160),
    clientPhone: optionalText(40),
    serviceType: optionalText(120).describe('Druh práce, např. web, e-shop, logo'),
    description: optionalText(600),
    price: money,
    deadline: dateField,
  }),
  z.object({
    kind: z.literal('update_project_status'),
    project: refSchema,
    status: z.enum(STATUS_ORDER as [string, ...string[]]).describe('Nový stav zakázky'),
  }),
  z.object({
    kind: z.literal('add_note'),
    target: z.enum(['project', 'lead']).describe('Kam poznámka patří'),
    ref: refSchema,
    noteText: text(2000),
  }),
  z.object({
    kind: z.literal('add_payment'),
    paymentType: z.enum(['zaloha', 'jednorazovy']).describe('Záloha k zakázce, nebo příjem bez zakázky'),
    project: refSchema.nullable().default(null).describe('Zakázka u zálohy; u jednorázového příjmu prázdné id i hint'),
    amount: money,
    date: dateField.describe('Kdy peníze přišly; prázdné = dnes'),
    note: optionalText(300),
  }),
  z.object({
    kind: z.literal('add_cost'),
    name: text(160).describe('Za co se platilo'),
    amount: money,
    costType: z.enum(['one_time', 'fixed_monthly', 'fixed_annual']).describe('Jednorázově, měsíčně, nebo ročně'),
    category: z
      .enum(['client', 'personal', 'domény', 'hosting', 'software', 'nástroje', 'ostatní'])
      .describe('Kategorie nákladu; client = na zakázku klienta'),
    project: refSchema.nullable().default(null).describe('Zakázka, ke které náklad patří; jinak prázdné id i hint'),
    note: optionalText(300),
  }),
  z.object({
    kind: z.literal('mark_invoice_paid'),
    invoice: refSchema.describe('Číslo faktury do hint, nebo jméno odběratele'),
    paidOn: dateField.describe('Kdy zaplatil; prázdné = dnes'),
  }),
  z.object({
    kind: z.literal('issue_invoice'),
    project: refSchema.nullable().default(null),
    counterpartyName: optionalText(160).describe('Odběratel, pokud ho věta zmiňuje'),
    description: optionalText(200).describe('Co se fakturuje'),
    amount: money,
  }),
  z.object({
    kind: z.literal('cancel_invoice'),
    invoice: refSchema,
  }),
  z.object({
    kind: z.literal('send_message'),
    channel: z.enum(['sms', 'email', 'whatsapp']),
    ref: refSchema,
    phone: optionalText(40),
    email: optionalText(160),
    subject: optionalText(160).describe('Předmět; u SMS a WhatsAppu prázdný'),
    body: text(2000),
  }),
  // ── Úpravy existujících záznamů (R-113). `null` = beze změny; smazat
  // hodnotu asistent neumí, to zůstává na formuláři.
  z.object({
    kind: z.literal('update_contact'),
    ref: refSchema,
    companyName: optionalText(160),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
    leadStatus: z.enum(['cold', 'warm', 'hot', 'waiting', 'converted', 'lost']).nullable().default(null),
    nextAction: optionalText(200),
    nextActionDate: dateField,
    nextActionTime: timeField,
    nextActionType: z.enum(['call', 'meeting', 'email', 'whatsapp', 'online', 'other']).nullable().default(null),
    estimatedValue: money,
  }),
  z.object({
    kind: z.literal('update_project'),
    project: refSchema,
    clientName: optionalText(160),
    clientEmail: optionalText(160),
    clientPhone: optionalText(40),
    serviceType: optionalText(120),
    description: optionalText(600),
    price: money,
    deadline: dateField,
  }),
  z.object({
    kind: z.literal('update_event'),
    event: eventRefSchema,
    title: optionalText(120),
    note: optionalText(500),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
  }),
  z.object({
    kind: z.literal('remember'),
    scope: z.enum(['global', 'project']).describe('Obecně o firmě, nebo k jedné zakázce'),
    project: refSchema.nullable().default(null),
    memoryKind: z.enum(['summary', 'preference', 'risk', 'glossary']).default('summary'),
    text: text(600),
  }),
])

export type Action = z.infer<typeof actionSchema>
/** Starší jméno z AD14 — jedna akce plánu. */
export type Proposal = Action

/** Nejvíc akcí z jedné věty. Víc nikdo neřekne naráz a strop drží cenu i chyby na uzdě. */
export const ACTIONS_MAX = 8

/**
 * Kořen je objekt, ne rovnou pole nebo sjednocení — strukturovaný výstup si
 * s `anyOf` na nejvyšší úrovni nerozumí všude stejně, zanořený ho zvládne.
 */
export const suggestionSchema = z.object({
  actions: z.array(actionSchema).max(ACTIONS_MAX).describe('Akce v pořadí, v jakém se mají provést; prázdné, když nic'),
  reply: text(500).describe('Jedna nebo dvě věty pro člověka: co uděláš, nebo odpověď či doplňující otázka'),
  confidence: z.number().min(0).max(1).describe('Jistota od 0 do 1'),
  assumptions: z.array(text(200)).max(5).describe('Co jsi odvodil, i když to přímo nezaznělo'),
  missing: z.array(text(120)).max(8).describe('Co ve větě chybí a člověk to musí doplnit'),
})

export type Suggestion = z.infer<typeof suggestionSchema>

/** Pod touhle jistotou se nic neprovede samo — všechno čeká na klepnutí. */
export const CONFIDENCE_FLOOR = 0.6
