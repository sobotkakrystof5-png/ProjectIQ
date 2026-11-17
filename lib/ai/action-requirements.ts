import type { Action } from '@/lib/ai/suggestion-schema'

/**
 * Co musí akce mít, než ji asistent provede (R-113).
 *
 * Model má pokyn doptat se dřív, než něco udělá (`lib/ai/prompts.ts`), ale
 * pokyn v promptu není pojistka. Tahle funkce je: když akce nemá povinný
 * údaj, **celý plán se zadrží**, nic se neprovede a asistent se zeptá.
 * Člověk odpoví v chatu a další kolo sestaví plán znovu, už úplný.
 *
 * Proč celý plán, ne jen neúplná akce: „přidej Nováka a zapiš ho na
 * čtvrtek" bez času by jinak zapsal kontakt hned a termín v dalším kole by
 * ho zapsal podruhé (termín s člověkem zakládá kontakt sám).
 *
 * Povinné je jen to, bez čeho záznam v tabulce nedává smysl nebo by byl
 * vymyšlený. Údaje „hodilo by se" (e-mail k telefonu, termín dokončení)
 * řeší prompt — na ty se asistent zeptá jednou a když je člověk nemá,
 * pokračuje bez nich.
 *
 * Soubor je čistý (bez databáze), aby šel testovat.
 */

const has = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const hasRef = (ref: { id: string | null; hint: string | null } | null | undefined): boolean =>
  Boolean(ref && (has(ref.id) || has(ref.hint)))

/** Chybějící povinné údaje akce, česky pro člověka. Prázdné pole = akce je úplná. */
export function actionGaps(action: Action): string[] {
  const gaps: string[] = []
  switch (action.kind) {
    case 'create_contact':
      if (!has(action.companyName)) gaps.push('jméno nebo firma kontaktu')
      if (!has(action.phone) && !has(action.email)) gaps.push(`telefon (nebo e-mail) na ${action.companyName || 'kontakt'}`)
      break
    case 'schedule_event':
      if (!has(action.title)) gaps.push('o jaký termín jde')
      if (!action.date) gaps.push('den termínu')
      if (!action.time) gaps.push('čas termínu')
      break
    case 'move_event':
      if (!hasRef(action.event) && !action.event.date) gaps.push('který termín přesunout')
      if (!action.date && !action.time && !action.durationMinutes) gaps.push('kam termín přesunout (den nebo čas)')
      break
    case 'cancel_event':
      if (!hasRef(action.event) && !action.event.date) gaps.push('který termín zrušit')
      break
    case 'create_project':
      if (!has(action.clientName)) gaps.push('jméno klienta')
      if (!has(action.serviceType)) gaps.push('druh práce (web, e-shop, logo…)')
      if (action.price === null) gaps.push('cena zakázky')
      if (!has(action.clientPhone) && !has(action.clientEmail)) gaps.push(`telefon (nebo e-mail) na ${action.clientName || 'klienta'}`)
      break
    case 'update_project_status':
      if (!hasRef(action.project)) gaps.push('o kterou zakázku jde')
      break
    case 'add_note':
      if (!hasRef(action.ref)) gaps.push(action.target === 'project' ? 'ke které zakázce poznámka patří' : 'ke kterému kontaktu poznámka patří')
      if (!has(action.noteText)) gaps.push('text poznámky')
      break
    case 'add_payment':
      if (action.amount === null) gaps.push('částka')
      if (action.paymentType === 'zaloha' && !hasRef(action.project)) gaps.push('ke které zakázce záloha patří')
      break
    case 'add_cost':
      if (!has(action.name)) gaps.push('za co náklad je')
      if (action.amount === null) gaps.push('částka nákladu')
      break
    case 'mark_invoice_paid':
    case 'cancel_invoice':
      if (!hasRef(action.invoice)) gaps.push('která faktura (číslo nebo odběratel)')
      break
    case 'issue_invoice':
      if (!hasRef(action.project) && !has(action.counterpartyName)) gaps.push('komu fakturu vystavit')
      break
    case 'send_message':
      if (!hasRef(action.ref) && !has(action.phone) && !has(action.email)) gaps.push('komu zprávu poslat')
      if (!has(action.body)) gaps.push('text zprávy')
      break
    case 'update_contact': {
      if (!hasRef(action.ref)) gaps.push('který kontakt upravit')
      const changes = [
        action.companyName,
        action.contactName,
        action.phone,
        action.email,
        action.leadStatus,
        action.nextAction,
        action.nextActionDate,
        action.nextActionTime,
        action.nextActionType,
      ].some(has)
      if (!changes && action.estimatedValue === null) gaps.push('co u kontaktu změnit')
      // Domluvený den bez času by se v kalendáři ukázal jako celý den.
      if (action.nextActionDate && !action.nextActionTime) gaps.push('čas dalšího kroku')
      break
    }
    case 'update_project': {
      if (!hasRef(action.project)) gaps.push('kterou zakázku upravit')
      const changes = [action.clientName, action.clientEmail, action.clientPhone, action.serviceType, action.description, action.deadline].some(has)
      if (!changes && action.price === null) gaps.push('co u zakázky změnit')
      break
    }
    case 'update_event':
      if (!hasRef(action.event) && !action.event.date) gaps.push('který termín upravit')
      if (![action.title, action.note, action.contactName, action.phone, action.email].some(has)) gaps.push('co u termínu změnit')
      break
    case 'remember':
      if (!has(action.text)) gaps.push('co si mám zapamatovat')
      if (action.scope === 'project' && !hasRef(action.project)) gaps.push('ke které zakázce si to zapamatovat')
      break
  }
  return gaps
}

/** Chybějící údaje celého plánu, bez opakování. */
export function planGaps(actions: Action[]): string[] {
  return [...new Set(actions.flatMap(actionGaps))]
}

/** Otázka pro člověka z chybějících údajů — když ji model sám nepoložil. */
export function gapsQuestion(gaps: string[]): string {
  if (gaps.length === 0) return ''
  if (gaps.length === 1) return `Než to zapíšu, potřebuju ještě: ${gaps[0]}.`
  return `Než to zapíšu, potřebuju ještě: ${gaps.slice(0, -1).join(', ')} a ${gaps[gaps.length - 1]}.`
}
