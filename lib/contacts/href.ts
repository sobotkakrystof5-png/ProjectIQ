/**
 * Odkazy na zavolání a napsání (AD10).
 *
 * Jedno místo, kde se skládá `tel:`, `sms:`, `mailto:` a `wa.me` — aby se
 * neopakovalo na osmi obrazovkách a aby šlo otestovat, že se do odkazu
 * nedostane nic, co tam nepatří.
 *
 * **Proč tak opatrně s adresou:** `mailto:` bere parametry za `?`, takže
 * adresa s `?bcc=…` nebo `?body=…` v sobě umí do zprávy propašovat dalšího
 * příjemce nebo přepsat text. Totéž řešil R-062 ve Workspace. Adresa, která
 * neprojde `MAILTO_SAFE`, odkaz nedostane vůbec — nic se nedoplňuje ani
 * potichu neopravuje.
 *
 * Soubor je čistý a bez aliasů (`normalize.ts` vedle čte i backfill skript
 * v Node bez překladu).
 */

import { normalizePhone } from './normalize'

/**
 * Adresa, kterou je bezpečné vložit do `mailto:` před `?`.
 *
 * Záměrně užší, než co dovoluje RFC 5322: `&`, `%`, `?` a `#` do adresy
 * nepustí, i když jsou v místní části technicky povolené. Skutečná adresa
 * je takhle psaná vždycky a mírnější poštovní klienti si `a&subject=x@b.cz`
 * mohou vyložit jako adresu s parametrem.
 */
const MAILTO_SAFE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** Telefon jako `+420777123456`, nebo `null`, když to telefon není. */
export function telDigits(phone: string | null | undefined): string | null {
  return normalizePhone(phone)
}

export function telHref(phone: string | null | undefined): string | null {
  const number = telDigits(phone)
  return number === null ? null : `tel:${number}`
}

/**
 * `sms:+420…?&body=…` — tvar, který rozumí iPhone i Android. Bez textu jen
 * otevře novou zprávu.
 */
export function smsHref(phone: string | null | undefined, text?: string | null): string | null {
  const number = telDigits(phone)
  if (number === null) return null
  return text ? `sms:${number}?&body=${encodeURIComponent(text)}` : `sms:${number}`
}

export function mailtoHref(
  email: string | null | undefined,
  message?: { subject?: string | null; body?: string | null },
): string | null {
  const address = (email ?? '').trim()
  if (!MAILTO_SAFE.test(address)) return null
  const params: string[] = []
  if (message?.subject) params.push(`subject=${encodeURIComponent(message.subject)}`)
  if (message?.body) params.push(`body=${encodeURIComponent(message.body)}`)
  return params.length > 0 ? `mailto:${address}?${params.join('&')}` : `mailto:${address}`
}

/**
 * `https://wa.me/420…?text=…`. WhatsApp chce mezinárodní tvar bez `+`;
 * české devítimístné číslo dostane předvolbu z `normalizePhone`.
 */
export function whatsappHref(phone: string | null | undefined, text?: string | null): string | null {
  const number = telDigits(phone)
  if (number === null) return null
  const digits = number.slice(1)
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}

/** Telefon k přečtení: `+420 777 123 456` (české číslo po trojicích). */
export function formatPhone(phone: string | null | undefined): string | null {
  const number = telDigits(phone)
  if (number === null) return null
  if (number.startsWith('+420') && number.length === 13) {
    const rest = number.slice(4)
    return `+420 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`
  }
  return number
}
