/**
 * Předvyplnění odběratele po výběru zakázky (R-153). Bez `server-only`,
 * protože podle toho rozhoduje formulář v prohlížeči.
 *
 * Pravidlo je stejné jako u propisu kontaktu (R-141): nová hodnota nahradí
 * prázdné pole nebo hodnotu, kterou tam formulář sám vyplnil z předchozí
 * zakázky. Co jste napsali ručně, zůstane.
 */

export type PrefillParty = { name: string; address: string; ico: string; dic: string; phone: string }

export const EMPTY_PARTY: PrefillParty = { name: '', address: '', ico: '', dic: '', phone: '' }

export function followField(current: string, auto: string, next: string): string {
  const now = current.trim()
  return now === '' || now === auto.trim() ? next : current
}

export function followParty(current: PrefillParty, auto: PrefillParty, next: PrefillParty): PrefillParty {
  return {
    name: followField(current.name, auto.name, next.name),
    address: followField(current.address, auto.address, next.address),
    ico: followField(current.ico, auto.ico, next.ico),
    dic: followField(current.dic, auto.dic, next.dic),
    phone: followField(current.phone, auto.phone, next.phone),
  }
}

/** Odkud jsou údaje odběratele — formulář to napíše pod nadpis. */
export type PrefillSources = { lastInvoice: boolean; registry: boolean }

export function prefillNote(sources: PrefillSources): string {
  const base = sources.lastInvoice
    ? 'Odběratele jsem vyplnil z minulé faktury tomuto klientovi.'
    : 'Odběratele jsem vyplnil ze zakázky a kontaktu.'
  return sources.registry ? `${base} Sídlo jsem doplnil z rejstříku firem.` : base
}
