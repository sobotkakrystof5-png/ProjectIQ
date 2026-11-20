import { z } from 'zod'

/**
 * Šablona e-mailu, kterým faktura odchází klientovi (R-139).
 *
 * Soubor je záměrně bez `server-only`: stejné funkce dělají náhled ve
 * formuláři a skutečný e-mail na serveru, takže se text, který vidíte při
 * psaní, nemůže rozejít s tím, co dorazí klientovi.
 *
 * Šablona je **prostý text** s proměnnými ve složených závorkách. Nikdy se
 * nevkládá jako HTML — `buildPlainLayout` v `lib/email.ts` ho při odeslání
 * escapuje — a hodnoty proměnných se do textu dosazují jedním průchodem, takže
 * jméno odběratele s `{cislo}` uvnitř se podruhé nerozbalí.
 */

export const INVOICE_EMAIL_VARIABLES = [
  { key: 'cislo', label: 'Číslo faktury', example: '2026012' },
  { key: 'castka', label: 'Částka', example: '12 500 Kč' },
  { key: 'splatnost', label: 'Splatnost', example: '4. 12. 2026' },
  { key: 'odberatel', label: 'Jméno odběratele', example: 'Jan Novák' },
  { key: 'dodavatel', label: 'Vaše jméno nebo firma', example: 'Kryštof Sobotka' },
] as const

export type InvoiceEmailVariable = (typeof INVOICE_EMAIL_VARIABLES)[number]['key']
export type InvoiceEmailValues = Record<InvoiceEmailVariable, string>

const KNOWN = new Set<string>(INVOICE_EMAIL_VARIABLES.map(v => v.key))
const VARIABLE_LIST = INVOICE_EMAIL_VARIABLES.map(v => `{${v.key}}`).join(', ')

/** `{něco}` — obsah bez dalších závorek. */
const TOKEN = /\{([^{}]*)\}/g

export const DEFAULT_INVOICE_EMAIL_TEMPLATE = {
  subject: 'Faktura {cislo}',
  body: 'Dobrý den,\n\nposílám fakturu {cislo} se splatností {splatnost}.\nNajdete ji v příloze.\n\nDěkuju,\n{dodavatel}',
}

export type InvoiceEmailTemplate = { subject: string; body: string }

/** Názvy proměnných, které šablona používá a my je neznáme (překlep, `{cena}`…). */
export function unknownVariables(text: string): string[] {
  const unknown = new Set<string>()
  for (const match of text.matchAll(TOKEN)) {
    const key = match[1].trim()
    if (!KNOWN.has(key)) unknown.add(key)
  }
  return [...unknown]
}

export const invoiceEmailTemplateSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, 'Doplňte předmět e-mailu.')
      .max(200, 'Předmět může mít nejvýš 200 znaků.')
      .refine(value => !/[\r\n]/.test(value), 'Předmět musí být na jednom řádku.'),
    body: z
      .string()
      .trim()
      .min(1, 'Doplňte text e-mailu.')
      .max(4000, 'Text může mít nejvýš 4 000 znaků.')
      .transform(value => value.replace(/\r\n?/g, '\n')),
  })
  .superRefine((value, ctx) => {
    for (const field of ['subject', 'body'] as const) {
      const unknown = unknownVariables(value[field])
      if (unknown.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Proměnná ${unknown.map(name => `{${name}}`).join(', ')} neexistuje. Použít jde jen ${VARIABLE_LIST}.`,
        })
      }
    }
  })

/**
 * Dosadí údaje do šablony. Neznámá proměnná zůstane, jak je (uložit ji schéma
 * nepustí, ale starší záznam nebo ruční zásah do databáze nesmí zhatit odeslání).
 */
export function renderInvoiceEmail(
  template: InvoiceEmailTemplate,
  values: InvoiceEmailValues,
): { subject: string; text: string } {
  const fill = (source: string) =>
    source.replace(TOKEN, (whole, name: string) => {
      const key = name.trim()
      return KNOWN.has(key) ? values[key as InvoiceEmailVariable] : whole
    })
  return {
    // Předmět je hlavička e-mailu: jeden řádek, ať jméno odběratele s odřádkováním
    // nemůže přidat další hlavičku.
    subject: fill(template.subject).replace(/\s+/g, ' ').trim(),
    text: fill(template.body).trim(),
  }
}

export const EXAMPLE_INVOICE_EMAIL_VALUES: InvoiceEmailValues = Object.fromEntries(
  INVOICE_EMAIL_VARIABLES.map(v => [v.key, v.example]),
) as InvoiceEmailValues

/** 2026-11-30 → 30. 11. 2026 — v e-mailu klientovi, ne ISO. */
export function czDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d}. ${m}. ${y}`
}

/**
 * „12 500 Kč", „1 200,50 €". Haléře se ukážou jen když nějaké jsou — fakturu
 * na 12 500,50 Kč nesmí e-mail zaokrouhlit na 12 501.
 */
export function formatInvoiceAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function invoiceEmailValues(invoice: {
  number: string
  amount: number
  currency: string
  dueOn: string
  counterpartyName: string
  issuerName: string
}): InvoiceEmailValues {
  return {
    cislo: invoice.number,
    castka: formatInvoiceAmount(invoice.amount, invoice.currency),
    splatnost: czDate(invoice.dueOn),
    odberatel: invoice.counterpartyName,
    dodavatel: invoice.issuerName,
  }
}
