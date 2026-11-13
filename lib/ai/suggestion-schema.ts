import { z } from 'zod'
import { STATUS_ORDER } from '@/lib/types'

/**
 * Typovaný návrh akce (AD14, R-084).
 *
 * Model **nedostane žádný nástroj a nic nevykoná** — vrací tenhle tvar
 * a provede ho až server action po kliknutí člověka. Vynucené `tool_choice`
 * navíc na opus-5-5 a sonnet-5-5 vrací 400, takže strukturovaný výstup je
 * i jediná cesta, která funguje.
 *
 * Soubor je čistý (bez databáze a bez `server-only`): totéž schéma parsuje
 * odpověď modelu i uložený řádek při potvrzení, a čte ho i prohlížeč,
 * aby uměl návrh vykreslit.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const dateField = z.string().regex(DATE).nullable().describe('Datum YYYY-MM-DD, nebo null')
const timeField = z.string().regex(TIME).nullable().describe('Čas HH:MM ve 24hodinovém tvaru, nebo null')
const text = (max: number) => z.string().max(max)
const optionalText = (max: number) => z.string().max(max).nullable()

/** Odkaz na záznam. `id` jen když si je model jistý, jinak `hint` k dohledání. */
const refFields = {
  id: z.string().nullable().describe('Identifikátor záznamu z kontextu, jinak null'),
  hint: optionalText(160).describe('Podle čeho záznam poznat, když identifikátor neznáš'),
}

export const SUGGESTION_KINDS = [
  'create_lead',
  'schedule_call',
  'update_project_status',
  'create_invoice_draft',
  'add_note',
  'send_message',
  'none',
] as const

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

/** Co se ukáže nad návrhem. Česky a slovesem, ať je vidět, co klik udělá. */
export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  create_lead: 'Zapsat kontakt',
  schedule_call: 'Zapsat do kalendáře',
  update_project_status: 'Posunout stav zakázky',
  create_invoice_draft: 'Připravit fakturu',
  add_note: 'Přidat poznámku',
  send_message: 'Připravit zprávu',
  none: 'Nevím, co s tím',
}

export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create_lead'),
    companyName: text(160).describe('Firma nebo jméno, pod kterým kontakt vedeme'),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
    note: optionalText(600),
  }),
  z.object({
    kind: z.literal('schedule_call'),
    title: text(160).describe('Název termínu, typicky s kým'),
    date: dateField,
    time: timeField,
    durationMinutes: z.number().int().min(15).max(480).describe('Délka v minutách; když neřekl, dej 60'),
    contactName: optionalText(120),
    phone: optionalText(40),
    email: optionalText(160),
    note: optionalText(600),
  }),
  z.object({
    kind: z.literal('update_project_status'),
    project: z.object(refFields),
    status: z.enum(STATUS_ORDER as [string, ...string[]]).describe('Nový stav zakázky'),
  }),
  z.object({
    kind: z.literal('create_invoice_draft'),
    project: z.object(refFields),
    counterpartyName: optionalText(160).describe('Odběratel, pokud ho věta zmiňuje'),
    description: optionalText(300).describe('Co se fakturuje'),
    amount: z.number().nullable().describe('Částka bez měny, nebo null'),
  }),
  z.object({
    kind: z.literal('add_note'),
    target: z.enum(['project', 'lead']).describe('Kam poznámka patří'),
    ref: z.object(refFields),
    noteText: text(2000),
  }),
  z.object({
    kind: z.literal('send_message'),
    channel: z.enum(['sms', 'email', 'whatsapp']),
    ref: z.object(refFields),
    phone: optionalText(40),
    email: optionalText(160),
    subject: optionalText(160).describe('Předmět; u SMS a WhatsAppu null'),
    body: text(2000),
  }),
  z.object({
    kind: z.literal('none'),
    reason: text(300).describe('Proč z věty nejde poznat, co se má stát'),
  }),
])

export type Proposal = z.infer<typeof proposalSchema>

/**
 * Kořen je objekt, ne rovnou sjednocení — strukturovaný výstup si s `anyOf`
 * na nejvyšší úrovni nerozumí všude stejně, zanořený ho zvládne.
 */
export const suggestionSchema = z.object({
  proposal: proposalSchema,
  confidence: z.number().min(0).max(1).describe('Jistota od 0 do 1'),
  assumptions: z.array(text(200)).max(5).describe('Co jsi odvodil, i když to přímo nezaznělo'),
  missing: z.array(text(120)).max(8).describe('Co ve větě chybí a člověk to musí doplnit'),
})

export type Suggestion = z.infer<typeof suggestionSchema>

/** Pod touhle jistotou se návrh ukáže jako „nejistý" a nenabídne jednoklikové potvrzení. */
export const CONFIDENCE_FLOOR = 0.6
