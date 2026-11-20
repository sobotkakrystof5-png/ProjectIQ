/**
 * Tři šablony e-mailu kontaktu v Hovorech (R-121): Portfolio, Nabídka
 * a Schůzka s Google Meet.
 *
 * Soubor je čistý (žádné `server-only`, žádný přístup k databázi) — čte ho
 * okno `components/LeadEmailDialog.tsx` i serverová akce, takže náhled
 * v okně a odeslaný e-mail mají tentýž text.
 *
 * **Žádné vymyšlené údaje** (B10): cena v nabídce se nebere z ceníku na
 * vizeon.cz — ten je jen rozmezí a u každé zakázky se cena domlouvá zvlášť
 * (Kryštof 2026-11-20). Píše se do okna u každé nabídky, výchozí hodnota je
 * odhadovaná hodnota kontaktu z Hovorů.
 */

import { buildPortfolioEmailBody, PORTFOLIO_EMAIL_SUBJECT } from '@/lib/portfolio-email'
import { EMAIL_SIGNATURE } from '@/lib/message-templates'
import { defaultIntro, defaultSubject, renderMeetingEmail, VIZEON_WEB } from '@/lib/admin/meeting-email'

export type LeadMailTemplateId = 'portfolio' | 'nabidka' | 'schuzka'

export type LeadMailTemplate = {
  id: LeadMailTemplateId
  /** Co se ukáže na kartě výběru. */
  label: string
  /** Jedna věta pod názvem: co v e-mailu je. */
  hint: string
}

export const LEAD_MAIL_TEMPLATES: LeadMailTemplate[] = [
  { id: 'portfolio', label: 'Portfolio', hint: 'Odkaz na moje ukázky práce po hovoru.' },
  { id: 'nabidka', label: 'Nabídka', hint: 'Cena za váš projekt a odkaz na ukázky.' },
  { id: 'schuzka', label: 'Schůzka s Google Meet', hint: 'Termín, odkaz na Meet a vizeon.cz.' },
]

export const NABIDKA_SUBJECT = 'Nabídka na tvorbu webu - Kryštof Sobotka'

/**
 * Cena z odhadované hodnoty kontaktu jako text do e-mailu („12 000 Kč"),
 * nebo prázdný řetězec, když hodnota chybí. Mezera mezi tisíci je obyčejná,
 * ne pevná — v prostém textu e-mailu se pevná mezera zobrazí různě.
 */
export function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${Math.round(n).toLocaleString('cs-CZ').replace(/\s/g, ' ')} Kč`
}

/**
 * Nabídka: cena je vždy ta, kterou Kryštof zadá k téhle zakázce. Bez ceny
 * řádek chybí a okno nabídku odeslat nedovolí.
 */
export function buildOfferBody(price?: string | null): string {
  const cena = price?.trim()
  return [
    'Dobrý den,',
    'děkuji za váš čas. Posílám vám svou nabídku.',
    cena ? `Cena za váš projekt: ${cena}` : null,
    // Odkaz je na konci řádku bez tečky: e-mail z něj dělá odkaz po první mezeře
    // a tečka by se do adresy dostala.
    `Cenu jsem stanovil podle toho, co jsme si spolu řekli. Ukázky mé práce najdete tady: ${VIZEON_WEB}`,
    'Pokud vám nabídka vyhovuje, stačí odpovědět na tenhle e-mail a domluvíme další postup.',
    EMAIL_SIGNATURE,
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n')
}

export type LeadMailContext = {
  /** Dnešek v Praze (`YYYY-MM-DD`) — do textu portfolia. */
  todayISO: string
  /** Příští hovor z Hovorů, když je zadaný. */
  nextCallDate: string | Date | null
  /** Okamžik schůzky (ISO), když už je vybraný; z něj je předmět. */
  startsAt?: string | null
  /** Cena do nabídky, jak ji Kryštof napsal („12 000 Kč", „10 000 až 15 000 Kč"). */
  price?: string | null
}

/** Výchozí předmět a text šablony. Člověk je před odesláním může přepsat. */
export function leadMailDefaults(id: LeadMailTemplateId, ctx: LeadMailContext): { subject: string; body: string } {
  switch (id) {
    case 'portfolio':
      return {
        subject: PORTFOLIO_EMAIL_SUBJECT,
        body: buildPortfolioEmailBody({ todayISO: ctx.todayISO, nextCallDateISO: ctx.nextCallDate }),
      }
    case 'nabidka':
      return { subject: NABIDKA_SUBJECT, body: buildOfferBody(ctx.price) }
    case 'schuzka':
      return {
        subject: ctx.startsAt ? defaultSubject(ctx.startsAt) : 'Naše schůzka',
        body: defaultIntro(false, null),
      }
  }
}

/** Místo odkazu v náhledu — skutečný Meet vzniká až při odeslání. */
const MEET_PLACEHOLDER = 'https://meet.google.com/xxx-xxxx-xxx'

/**
 * To, co k textu schůzky doplní kód: termín, odkaz na Meet, vizeon.cz a podpis.
 * Stejná funkce, jakou skládá odeslaný e-mail (`renderMeetingEmail`), takže
 * se náhled od skutečnosti nerozejde.
 */
export function meetingTail(startsAt: string, minutes: number): string {
  const { text } = renderMeetingEmail({
    intro: '',
    startsAt,
    minutes,
    meetUrl: MEET_PLACEHOLDER,
    demoUrl: null,
  })
  return text.replace(MEET_PLACEHOLDER, '(odkaz na Google Meet se vytvoří při odeslání)').trim()
}
