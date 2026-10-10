// Katalog e-mailů Workspace (S15): typy, výchozí texty a proměnné.
//
// Bez importů serveru — stejný kód skládá náhled v Nastavení (prohlížeč)
// i e-mail, který odchází z fronty. Náhled tak odpovídá odeslanému.
//
// Texty jsou obyčejný text s proměnnými {jmeno}, {termin}…; formát (karta,
// tlačítka, detaily termínu) přidá rozložení v layout.ts podle typu.

import type { WsModule } from '../templates/types'

export const MESSAGE_TYPES = [
  'request_received',
  'booking_confirmed',
  'booking_changed',
  'booking_declined',
  'reminder',
  'thank_you',
  'reward_ready',
  'invoice',
  'new_request',
  'daily_digest',
  'weekly_digest',
  'monthly_digest',
  'invoice_overdue',
  'vat_limit',
] as const

export type MessageType = (typeof MESSAGE_TYPES)[number]

export const isMessageType = (v: unknown): v is MessageType => (MESSAGE_TYPES as readonly unknown[]).includes(v)

export const TEMPLATE_VARS = {
  jmeno: 'jméno zákazníka',
  byznys: 'název firmy',
  termin: 'den a čas termínu',
  sluzba: 'služba',
  razitka: 'stav věrnostní karty',
  odmena: 'odměna',
  cislo: 'číslo faktury',
  castka: 'částka',
  splatnost: 'splatnost',
} as const

export type TemplateVar = keyof typeof TEMPLATE_VARS
export type TemplateValues = Partial<Record<TemplateVar, string>>

export type MessageDef = {
  label: string
  /** Kdy odchází — popisek v Nastavení. */
  when: string
  audience: 'customer' | 'owner'
  /** Bez zapnuté funkce se neposílá (a v Nastavení je skrytý). */
  needs?: WsModule
  /** Text jde upravit (přehledy skládá aplikace z dat, ty mají jen přepínač). */
  editable: boolean
  vars: TemplateVar[]
  subject: string
  body: string
}

export const MESSAGES: Record<MessageType, MessageDef> = {
  request_received: {
    label: 'Přijali jsme poptávku',
    when: 'Hned po odeslání formuláře nebo objednávky',
    audience: 'customer',
    editable: true,
    vars: ['jmeno', 'byznys', 'termin', 'sluzba'],
    subject: 'Vaši poptávku jsme přijali',
    body: 'Dobrý den,\n\nděkujeme za poptávku. Podíváme se na ni a brzy se vám ozveme.\n\n{byznys}',
  },
  booking_confirmed: {
    label: 'Potvrzení termínu',
    when: 'Po potvrzení poptávky nebo ruční rezervaci',
    audience: 'customer',
    needs: 'calendar',
    editable: true,
    vars: ['jmeno', 'byznys', 'termin', 'sluzba'],
    subject: 'Termín je potvrzený: {termin}',
    body: 'Dobrý den,\n\ntěšíme se na vás {termin}.\nKdyž vám termín nebude vyhovovat, odpovězte prosím na tenhle e-mail.\n\n{byznys}',
  },
  booking_changed: {
    label: 'Změna termínu',
    when: 'Po přesunu termínu nebo potvrzení na jiný čas',
    audience: 'customer',
    needs: 'calendar',
    editable: true,
    vars: ['jmeno', 'byznys', 'termin', 'sluzba'],
    subject: 'Nový čas termínu: {termin}',
    body: 'Dobrý den,\n\nváš termín je nově {termin}.\nKdyž vám nový čas nevyhovuje, odpovězte prosím na tenhle e-mail a domluvíme jiný.\n\n{byznys}',
  },
  booking_declined: {
    label: 'Odmítnutí nebo zrušení',
    when: 'Po odmítnutí poptávky nebo zrušení termínu',
    audience: 'customer',
    editable: true,
    vars: ['jmeno', 'byznys', 'termin', 'sluzba'],
    subject: 'Termín se nám nepodařilo zajistit',
    body: 'Dobrý den,\n\nomlouváme se, ale tenhle termín vám nemůžeme nabídnout.\nOdpovězte prosím na tenhle e-mail a najdeme jiný čas.\n\n{byznys}',
  },
  reminder: {
    label: 'Připomínka termínu',
    when: 'Den před termínem, ráno',
    audience: 'customer',
    needs: 'reminders',
    editable: true,
    vars: ['jmeno', 'byznys', 'termin', 'sluzba'],
    subject: 'Připomínka: {termin}',
    body: 'Dobrý den,\n\npřipomínáme váš termín {termin}.\nKdyž nemůžete přijít, dejte nám prosím vědět odpovědí na tenhle e-mail.\n\n{byznys}',
  },
  thank_you: {
    label: 'Poděkování po návštěvě',
    when: 'Po zaplacené návštěvě',
    audience: 'customer',
    needs: 'calendar',
    editable: true,
    vars: ['jmeno', 'byznys', 'sluzba', 'razitka'],
    subject: 'Děkujeme za návštěvu',
    body: 'Dobrý den,\n\nděkujeme, že jste přišli. Pokud budete chtít, napište nám pár slov, jak jste byli spokojeni. Stačí odpovědět na tenhle e-mail.\n\n{byznys}',
  },
  reward_ready: {
    label: 'Odměna je připravená',
    when: 'Když se věrnostní karta naplní',
    audience: 'customer',
    needs: 'loyalty',
    editable: true,
    vars: ['jmeno', 'byznys', 'odmena'],
    subject: 'Příště na vás čeká odměna',
    body: 'Dobrý den,\n\nvaše věrnostní karta je plná. Při příští návštěvě na vás čeká: {odmena}.\n\n{byznys}',
  },
  invoice: {
    label: 'Faktura',
    when: 'Když fakturu odešlete z aplikace',
    audience: 'customer',
    needs: 'invoices',
    editable: true,
    vars: ['jmeno', 'byznys', 'cislo', 'castka', 'splatnost'],
    subject: 'Faktura {cislo}',
    body: 'Dobrý den,\n\nv příloze posíláme fakturu {cislo} na {castka} se splatností {splatnost}.\n\nDěkujeme.\n{byznys}',
  },
  new_request: {
    label: 'Nová poptávka',
    when: 'Okamžitě, s tlačítky Potvrdit a Jiný čas',
    audience: 'owner',
    editable: false,
    vars: [],
    subject: 'Nová poptávka: {jmeno}',
    body: '',
  },
  daily_digest: {
    label: 'Ranní přehled dne',
    when: 'Každý pracovní den ráno: dnešní termíny a nevyřízené poptávky',
    audience: 'owner',
    editable: false,
    vars: [],
    subject: 'Dnešek v kostce',
    body: '',
  },
  weekly_digest: {
    label: 'Týdenní přehled',
    when: 'V pondělí ráno: týden dopředu a komu napsat',
    audience: 'owner',
    editable: false,
    vars: [],
    subject: 'Váš týden',
    body: '',
  },
  monthly_digest: {
    label: 'Měsíční přehled',
    when: '1. den v měsíci: příjmy, poptávky a zákazníci za minulý měsíc',
    audience: 'owner',
    editable: false,
    vars: [],
    subject: 'Jak se dařilo v minulém měsíci',
    body: '',
  },
  invoice_overdue: {
    label: 'Faktura po splatnosti',
    when: 'Den po splatnosti nezaplacené faktury',
    audience: 'owner',
    needs: 'invoices',
    editable: false,
    vars: [],
    subject: 'Faktura {cislo} je po splatnosti',
    body: '',
  },
  vat_limit: {
    label: 'Blíží se limit DPH',
    when: 'Když příjmy za rok přesáhnou 80 % limitu pro plátce DPH',
    audience: 'owner',
    needs: 'finance',
    editable: false,
    vars: [],
    subject: 'Blížíte se limitu pro DPH',
    body: '',
  },
}

/** Výchozí stav, když v ws.message_settings řádek chybí. */
export const DEFAULT_ENABLED: Record<MessageType, boolean> = Object.fromEntries(
  MESSAGE_TYPES.map((t) => [t, true]),
) as Record<MessageType, boolean>

export const SUBJECT_MAX = 150
export const BODY_MAX = 2000

/** Doplní proměnné. Neznámá nebo prázdná proměnná zmizí (i s mezerou před ní). */
export function fillTemplate(text: string, values: TemplateValues): string {
  return text
    .replace(/ ?\{([a-z_]+)\}/g, (match, key: string) => {
      const value = values[key as TemplateVar]
      if (!value) return ''
      return match.startsWith(' ') ? ` ${value}` : value
    })
    .replace(/[ \t]+\n/g, '\n')
}

/** Ukázkové hodnoty pro náhled v Nastavení (jasně smyšlené). */
export const SAMPLE_VALUES: TemplateValues = {
  jmeno: 'Jana Ukázková',
  termin: 'pátek 13. listopadu v 9:00',
  sluzba: 'Střih a foukaná',
  razitka: '4 z 10',
  odmena: 'střih zdarma',
  cislo: '2026-000012',
  castka: '1 850 Kč',
  splatnost: '27. 11. 2026',
}
