// Složení e-mailu zákazníkovi z textu (výchozího nebo upraveného v Nastavení)
// a údajů události (S15). Bez importů serveru: náhled v Nastavení volá
// stejnou funkci s ukázkovými údaji, takže vypadá přesně jako odeslaný e-mail.

import { fillTemplate, MESSAGES, SAMPLE_VALUES, type MessageType, type TemplateValues } from './catalog'
import { renderEmail, type EmailBlock, type RenderedEmail } from './layout'

export type CustomerExtras = {
  /** Odkaz „Přidat do kalendáře“ (.ics). */
  calendarUrl?: string | null
  /** Stav věrnostní karty (poděkování, odměna). */
  card?: { stamps: number; needed: number; reward: string | null } | null
  unsubscribeUrl?: string | null
}

export type ComposeInput = {
  type: MessageType
  brand: { name: string; color: string | null }
  /** Upravený text z Nastavení; null = výchozí. */
  subject?: string | null
  body?: string | null
  values: TemplateValues
  extras?: CustomerExtras
}

function blocksFor(type: MessageType, v: TemplateValues, x: CustomerExtras): EmailBlock[] {
  const calendar: EmailBlock[] = x.calendarUrl
    ? [{ kind: 'buttons', items: [{ label: 'Přidat do kalendáře', url: x.calendarUrl }] }]
    : []
  const visit = (label: string): EmailBlock => ({
    kind: 'details',
    rows: [
      { label, value: v.termin ?? '' },
      { label: 'Služba', value: v.sluzba ?? '' },
    ],
  })
  switch (type) {
    case 'request_received':
      return [visit('Chtěný termín')]
    case 'booking_confirmed':
      return [visit('Termín'), ...calendar]
    case 'booking_changed':
      return [visit('Nový termín'), ...calendar]
    case 'booking_declined':
      return [visit('Termín')]
    case 'reminder':
      return [visit('Termín'), ...calendar]
    case 'thank_you':
    case 'reward_ready':
      return x.card ? [{ kind: 'card', ...x.card }] : []
    case 'invoice':
      return [
        {
          kind: 'details',
          rows: [
            { label: 'Faktura', value: v.cislo ?? '', mono: true },
            { label: 'Částka', value: v.castka ?? '', mono: true },
            { label: 'Splatnost', value: v.splatnost ?? '', mono: true },
          ],
        },
      ]
    default:
      return []
  }
}

export function composeCustomerEmail(input: ComposeInput): RenderedEmail {
  const def = MESSAGES[input.type]
  const values: TemplateValues = { ...input.values, byznys: input.brand.name }
  const subject = fillTemplate(input.subject?.trim() || def.subject, values)
  const body = fillTemplate(input.body?.trim() || def.body, values)
  const x = input.extras ?? {}
  return renderEmail({
    brand: input.brand,
    subject,
    body,
    blocks: blocksFor(input.type, values, x),
    footer: `E-mail vám poslal ${input.brand.name} přes ZakazIQ. Odpovědět můžete přímo na něj.`,
    unsubscribeUrl: x.unsubscribeUrl ?? null,
  })
}

/** Náhled v Nastavení: ukázkové údaje, karta a tlačítko jako ve skutečném e-mailu. */
export function previewCustomerEmail(input: Omit<ComposeInput, 'values' | 'extras'>): RenderedEmail {
  return composeCustomerEmail({
    ...input,
    values: SAMPLE_VALUES,
    extras: {
      calendarUrl: 'https://www.zakaziq.cz/',
      card:
        input.type === 'reward_ready'
          ? { stamps: 10, needed: 10, reward: SAMPLE_VALUES.odmena ?? null }
          : { stamps: 4, needed: 10, reward: SAMPLE_VALUES.odmena ?? null },
    },
  })
}

/** Zpráva z „Komu napsat“ (text napsal majitel) s odkazem na odhlášení. */
export function composeOutreachEmail(input: {
  brand: { name: string; color: string | null }
  subject: string
  body: string
  unsubscribeUrl: string
}): RenderedEmail {
  return renderEmail({
    brand: input.brand,
    subject: input.subject,
    body: input.body,
    footer: `Tuhle zprávu vám poslal ${input.brand.name}, protože jste souhlasili se zasíláním novinek.`,
    unsubscribeUrl: input.unsubscribeUrl,
  })
}
