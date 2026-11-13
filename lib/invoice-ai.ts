import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { InvoiceAiExtract } from '@/lib/types'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import { aiModel, isAiConfigured } from '@/lib/ai/models'

/**
 * AI přepis PDF faktury.
 *
 * Pravidlo celé fáze: **přepis nikdy neblokuje uložení.** Funkce proto
 * nikdy nevyhazuje — vrací buď `data`, nebo `error` s českou hláškou, a
 * volající si s tím poradí. Když chybí klíč k API, model se splete nebo
 * spadne síť, formulář se pořád vyplní ručně.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Schéma, které model musí dodržet (structured outputs). Všechna pole jsou
 * povinná, ale nullable — model tak musí ke každému říct buď hodnotu, nebo
 * „nenašel jsem", místo aby klíč tiše vynechal.
 */
const extractSchema = z.object({
  invoice_number: z.string().nullable().describe('Číslo faktury / variabilní symbol dokladu'),
  issued_on: z.string().nullable().describe('Datum vystavení ve formátu YYYY-MM-DD'),
  due_on: z.string().nullable().describe('Datum splatnosti ve formátu YYYY-MM-DD'),
  amount: z.number().nullable().describe('Celková částka k úhradě včetně DPH, jen číslo'),
  currency: z.enum(INVOICE_CURRENCIES).nullable().describe('Měna faktury'),
  client_name: z.string().nullable().describe('Odběratel — komu je faktura vystavena'),
  client_ico: z.string().nullable().describe('IČO odběratele'),
  client_dic: z.string().nullable().describe('DIČ odběratele'),
})

const SYSTEM_PROMPT = `Přepisuješ české faktury do strukturovaných dat pro účetní evidenci OSVČ.

Pravidla:
- Vyplňuj jen to, co v dokumentu skutečně stojí. Co nenajdeš, nech null — nikdy nehádej ani nedopočítávej.
- Odběratel je ten, KOMU je faktura vystavena (příjemce plnění), ne dodavatel. Rozlišuj to pečlivě; IČO a DIČ ber ze stejné strany jako jméno odběratele.
- Částka je celková suma k úhradě včetně DPH, jako čisté číslo bez měny a bez oddělovačů tisíců.
- Data převeď do formátu YYYY-MM-DD.
- Datum zaplacení nevyplňuješ vůbec — o něm rozhoduje uživatel, ne doklad.`

export interface InvoiceExtractResult {
  data?: InvoiceAiExtract
  error?: string
}

/** Bez klíče se na API vůbec nesahá — příznak čte i UI, aby tlačítko vůbec nenabízelo. */
export function isInvoiceAiConfigured(): boolean {
  return isAiConfigured()
}

/** Datum z modelu bereme jen ve tvaru, který přijme `<input type="date">`. */
function safeDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return DATE_RE.test(trimmed) ? trimmed : null
}

function safeText(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Jedno volání modelu. `null` = model vrátil něco, co schématu neodpovídá. */
async function readWith(model: string, pdfBase64: string) {
  const client = new Anthropic()
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Přepis dokladu je jednoduchá extrakce — nízký effort stačí a šetří tokeny.
    output_config: { effort: 'low', format: zodOutputFormat(extractSchema) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: 'Přepiš údaje z této faktury.' },
        ],
      },
    ],
  })
  return response.parsed_output ?? null
}

export async function extractInvoiceFromPdf(pdfBase64: string): Promise<InvoiceExtractResult> {
  if (!isInvoiceAiConfigured()) {
    return { error: 'AI přepis není nakonfigurovaný — vyplň fakturu ručně' }
  }

  try {
    // Od AD14 čte doklad `vision` (haiku) místo opusu — tatáž práce za zlomek
    // ceny. Když se model do schématu netrefí, zkusí to jednou `smart`
    // (sonnet); je to jedna faktura za čas, ne hromadný provoz.
    let parsed = await readWith(aiModel('vision'), pdfBase64)
    if (!parsed && aiModel('smart') !== aiModel('vision')) {
      parsed = await readWith(aiModel('smart'), pdfBase64)
    }
    if (!parsed) return { error: 'Z faktury se nepodařilo nic vyčíst — vyplň ji ručně' }

    // Normalizace: model může vrátit platný JSON s nepoužitelnou hodnotou
    // (datum slovy, prázdný řetězec). Formulář má dostat jen to, co umí zobrazit.
    return {
      data: {
        invoice_number: safeText(parsed.invoice_number),
        issued_on: safeDate(parsed.issued_on),
        due_on: safeDate(parsed.due_on),
        amount: Number.isFinite(parsed.amount) && (parsed.amount ?? -1) >= 0 ? parsed.amount : null,
        currency: parsed.currency,
        client_name: safeText(parsed.client_name),
        client_ico: safeText(parsed.client_ico),
        client_dic: safeText(parsed.client_dic),
      },
    }
  } catch (err) {
    // Detail chyby patří do logu, ne uživateli — může nést kus obsahu faktury.
    console.error('[invoice-ai] extrakce selhala:', err)
    if (err instanceof Anthropic.RateLimitError) {
      return { error: 'AI je momentálně přetížená — zkus to za chvíli, nebo vyplň ručně' }
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: 'AI přepis není správně nakonfigurovaný — vyplň fakturu ručně' }
    }
    return { error: 'Přepis faktury se nepodařil — vyplň ji ručně' }
  }
}

/** Zod schéma přepisu — sdílené s veřejným endpointem, kde AI doplňuje chybějící pole. */
export const invoiceExtractSchema = extractSchema
