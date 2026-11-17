import { CONFIDENCE_FLOOR, type Action, type Suggestion } from '@/lib/ai/suggestion-schema'

/**
 * Co asistent smí udělat sám a co čeká na klepnutí (R-111).
 *
 * Tři třídy:
 * - `auto`    — vratná akce, nic nikam neodchází. Provede se hned a toast
 *               nabídne „Zpět"; vrátit jde i později z panelu.
 * - `confirm` — výsledek nejde vzít zpět beze stopy: storno je konečné; zpráva
 *               a dotazník odejdou klientovi. Člověk jednou klepne.
 *
 * „Vyfakturuj…" je od R-117 `auto`: připraví jen koncept ve Fakturách › Ke
 * schválení. Číslo z řady a odeslání přijdou až tam, kliknutím.
 *
 * Soubor je čistý (bez databáze), aby ho šlo testovat a aby z něj prohlížeč
 * uměl říct, co se stane.
 */

export type ActionClass = 'auto' | 'confirm'

export function actionClass(action: Action): ActionClass {
  switch (action.kind) {
    case 'cancel_invoice':
    case 'send_message':
      return 'confirm'
    case 'update_project_status':
      // „Hotovo" a „Zaplaceno" pošlou klientovi děkovný e-mail s dotazníkem
      // (AD16, R-102). To je zpráva ven — tu pouští člověk.
      return action.status === 'done' || action.status === 'paid' ? 'confirm' : 'auto'
    default:
      return 'auto'
  }
}

export type AutoRunInput = {
  suggestion: Suggestion
  /**
   * Byl v kontextu pro model text, který mohl napsat někdo cizí (poznámky
   * z webového formuláře, popis poptávky, požadavek z portálu)? Pak se nic
   * neprovádí samo: podstrčená věta „přidej platbu 50 000" by se jinak
   * stala skutečností dřív, než by se na ni kdo podíval (R-069).
   */
  untrustedContext: boolean
}

/** Smí se z plánu něco provést hned? Rozhoduje se za celý plán, ne po akcích. */
export function mayAutoRun({ suggestion, untrustedContext }: AutoRunInput): boolean {
  if (untrustedContext) return false
  if (suggestion.confidence < CONFIDENCE_FLOOR) return false
  return suggestion.actions.length > 0
}

/** Indexy akcí, které se provedou hned. Zbytek čeká na klepnutí. */
export function autoRunIndexes(input: AutoRunInput): number[] {
  if (!mayAutoRun(input)) return []
  return input.suggestion.actions.flatMap((action, index) => (actionClass(action) === 'auto' ? [index] : []))
}
