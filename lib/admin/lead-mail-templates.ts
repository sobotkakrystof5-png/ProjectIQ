/**
 * Tři šablony e-mailu kontaktu v Hovorech (R-132): Portfolio, Nabídka
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
import { offerEmailLines } from '@/lib/admin/offers/proposal-model'

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
 *
 * S odkazem na stránku nabídky z navrhovače (R-155) e-mail jen uvede tři
 * varianty a doporučenou cenu; co obsahují, je na stránce.
 */
export function buildOfferBody(price?: string | null, offerUrl?: string | null): string {
  const cena = price?.trim()
  if (offerUrl) return ['Dobrý den,', ...offerEmailLines(cena ?? '', offerUrl), EMAIL_SIGNATURE].join('\n\n')
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

/** Předmět e-mailu s ukázkou webu, stejný jako u ukázek od robota (Growth OS). */
export const demoSubject = (company: string) => `Návrh nového webu pro ${company.trim() || 'vás'}`

/**
 * E-mail k nabídce z navrhovače (R-160): jen cenová nabídka, jen ukázka webu,
 * nebo obojí. Kryštof volí na kartě nabídky, text jde před odesláním upravit.
 * Ukázka bez nabídky je krátký dopis s odkazem, s nabídkou k ní přibude
 * odkaz na stránku nabídky a doporučená cena. Odkazy na konci řádku bez tečky.
 */
export function buildProposalMail(parts: {
  company: string
  offerUrl: string | null
  price: string | null
  demoUrl: string | null
}): { subject: string; body: string } {
  const price = parts.price?.trim() || null
  if (!parts.demoUrl) {
    return { subject: NABIDKA_SUBJECT, body: buildOfferBody(price, parts.offerUrl) }
  }
  const company = parts.company.trim()
  const lines: (string | null)[] = [
    'Dobrý den,',
    `připravil jsem pro vás ukázku, jak by mohl vypadat nový web${company ? ` pro ${company}` : ''}: ${parts.demoUrl}`,
    'Je to první verze, kterou doladíme podle vás: texty, fotky, barvy i to, co chcete zákazníkům ukázat jako první.',
  ]
  if (parts.offerUrl) {
    lines.push(`Co by web stál, najdete v nabídce ve třech variantách: ${parts.offerUrl}`)
    lines.push(`${price ? `Doporučuji variantu za ${price}. ` : ''}Variantu si vyberete jedním kliknutím přímo v nabídce.`)
  }
  lines.push('Když budete mít otázku, stačí odpovědět na tenhle e-mail.')
  lines.push(EMAIL_SIGNATURE)
  return {
    subject: demoSubject(company),
    body: lines.filter((line): line is string => line !== null).join('\n\n'),
  }
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
  /** Odkaz na stránku nabídky z navrhovače (R-155). */
  offerUrl?: string | null
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
      return { subject: NABIDKA_SUBJECT, body: buildOfferBody(ctx.price, ctx.offerUrl) }
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
