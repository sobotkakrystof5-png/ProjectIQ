// Akce, které kostra aplikace (S09) umí ukázat, ale ještě nefungují. Dokud
// je vypnuté, v aplikaci nejsou vidět (R-043). Sezení, které akci postaví,
// ji tady zapne. Bez závislostí — čte ho server i prohlížeč.

export const WS_FEATURES = {
  /** Odkaz na objednávací stránku /r/[slug] — zapne S11, až stránka bude. */
  orderLink: false,
  /** Nová rezervace (panel, ⌘K příkaz „rezervace Tereza pátek 9:00“) — zapne S10. */
  newBooking: false,
  /** Nová faktura — zapne S14. */
  newInvoice: false,
} as const

export type WsFeatures = { readonly [K in keyof typeof WS_FEATURES]: boolean }

export type NewAction = 'booking' | 'invoice' | 'link'

/** Akce v „+ Nová“ a v ⌘K podle zapnutých funkcí byznysu a hotových akcí. */
export function newActions(enabled: ReadonlySet<string>, features: WsFeatures = WS_FEATURES): NewAction[] {
  const actions: NewAction[] = []
  if (features.newBooking && enabled.has('calendar')) actions.push('booking')
  if (features.newInvoice && enabled.has('invoices')) actions.push('invoice')
  if (features.orderLink) actions.push('link')
  return actions
}
