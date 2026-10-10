import { z } from 'zod'

// Vlastní kolonky poptávky (ws.field_definitions, migrace 066) → Zod schéma
// pro hodnoty v requests.field_values (AGENTS.md B3). Bez závislostí na DB,
// čte ho API, objednávací stránka i testy.
//
// Typy: text, address (řádek textu), number, date (YYYY-MM-DD), choice
// (pilulky) a select (rozbalovací seznam) = jedna z možností. `slot`
// a `contact` jsou části formuláře, které mají vlastní pole poptávky (čas,
// kontakt) — do field_values nepatří. `file` přes API zatím nejde (nahrávání
// souborů nemáme), takže se přes web nevyžaduje.

export type FieldDefinition = {
  key: string
  label: string
  type: 'text' | 'choice' | 'select' | 'number' | 'date' | 'slot' | 'contact' | 'address' | 'file'
  required: boolean
  options: string[]
  help_text?: string | null
}

/** Kolonky, které se dají vyplnit na webu (pořadí podle position z DB). */
export const WEB_FIELD_TYPES: ReadonlySet<FieldDefinition['type']> = new Set<FieldDefinition['type']>([
  'text',
  'address',
  'number',
  'date',
  'choice',
  'select',
])

export const webFields = (defs: readonly FieldDefinition[]): FieldDefinition[] =>
  defs.filter((d) => WEB_FIELD_TYPES.has(d.type))

const MAX_TEXT = 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function valueSchema(def: FieldDefinition): z.ZodType<string | number> {
  switch (def.type) {
    case 'number':
      // Formulář posílá text, API číslo — obojí projde, uloží se číslo.
      return z.preprocess(
        (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.').replace(/\s/g, '')) : v),
        z.number({ error: `${def.label}: zadejte prosím číslo.` }).finite().min(-1e9).max(1e9),
      ) as z.ZodType<number>
    case 'date':
      return z
        .string()
        .regex(DATE_RE, `${def.label}: zadejte prosím datum.`)
        .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), `${def.label}: zadejte prosím datum.`)
    case 'choice':
    case 'select':
      return z.string().refine((v) => def.options.includes(v), `${def.label}: vyberte prosím jednu z možností.`)
    default:
      return z.string().trim().min(1, `${def.label}: vyplňte prosím.`).max(MAX_TEXT, `${def.label}: text je moc dlouhý.`)
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/**
 * Schéma objektu kolonek. Neznámé klíče se zahodí (web může poslat víc, než
 * byznys zná), prázdné nepovinné hodnoty se vynechají.
 */
export function fieldValuesSchema(defs: readonly FieldDefinition[]): z.ZodType<Record<string, string | number>> {
  const fields = webFields(defs)
  return z
    .record(z.string().max(40), z.unknown())
    .optional()
    .transform((raw, ctx) => {
      const input = raw ?? {}
      const out: Record<string, string | number> = {}
      for (const def of fields) {
        const value = input[def.key]
        if (isEmpty(value)) {
          if (def.required) ctx.addIssue({ code: 'custom', path: [def.key], message: `${def.label}: vyplňte prosím.` })
          continue
        }
        const parsed = valueSchema(def).safeParse(value)
        if (parsed.success) out[def.key] = parsed.data
        else ctx.addIssue({ code: 'custom', path: [def.key], message: parsed.error.issues[0]?.message ?? def.label })
      }
      return out
    })
}
