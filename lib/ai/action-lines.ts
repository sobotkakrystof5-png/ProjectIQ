import { LEAD_STATUS_LABELS, STATUS_LABELS, type LeadStatus, type ProjectStatus } from '@/lib/types'
import { SUGGESTION_LABELS, type Action } from '@/lib/ai/suggestion-schema'

/**
 * Řádky, které panel ukáže u akce — ne JSON, ale to, co se opravdu stane.
 * Čistá funkce: volá ji server při sestavení odpovědi a testy.
 */

export type Line = { label: string; value: string }

const NOT_FILLED = 'nedoplněno'

function czDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}. ${m}. ${y}`
}

function when(date: string | null, time: string | null): string {
  return [czDate(date), time].filter(Boolean).join(' v ') || NOT_FILLED
}

function money(amount: number | null): string {
  return amount === null ? NOT_FILLED : `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(amount)} Kč`
}

function refText(ref: { id: string | null; hint: string | null } | null, fallback: string): string {
  return ref?.hint?.trim() || (ref?.id ? fallback : NOT_FILLED)
}

const opt = (label: string, value: string | null | undefined): Line[] => (value ? [{ label, value }] : [])

const COST_TYPES: Record<string, string> = {
  one_time: 'jednorázově',
  fixed_monthly: 'každý měsíc',
  fixed_annual: 'každý rok',
}

export function actionTitle(action: Action): string {
  return SUGGESTION_LABELS[action.kind]
}

export function actionLines(action: Action): Line[] {
  switch (action.kind) {
    case 'create_contact':
      return [
        { label: 'Kontakt', value: action.companyName },
        ...opt('Jméno', action.contactName),
        ...opt('Telefon', action.phone),
        ...opt('E-mail', action.email),
        ...opt('Poznámka', action.note),
      ]
    case 'schedule_event':
      return [
        { label: 'Termín', value: action.title },
        { label: 'Kdy', value: when(action.date, action.time) },
        { label: 'Délka', value: `${action.durationMinutes} min` },
        ...opt('S kým', action.contactName),
        ...opt('Telefon', action.phone),
        ...opt('Poznámka', action.note),
      ]
    case 'move_event':
      return [
        { label: 'Termín', value: [refText(action.event, 'z otevřené obrazovky'), czDate(action.event.date)].filter(Boolean).join(', ') },
        { label: 'Nově', value: action.date || action.time ? when(action.date, action.time) : 'stejný čas' },
        ...opt('Délka', action.durationMinutes ? `${action.durationMinutes} min` : null),
      ]
    case 'cancel_event':
      return [
        { label: 'Termín', value: [refText(action.event, 'z otevřené obrazovky'), czDate(action.event.date)].filter(Boolean).join(', ') },
      ]
    case 'create_project':
      return [
        { label: 'Klient', value: action.clientName },
        ...opt('Druh práce', action.serviceType),
        ...opt('Cena', action.price !== null ? money(action.price) : null),
        ...opt('Termín', czDate(action.deadline)),
        ...opt('Telefon', action.clientPhone),
        ...opt('E-mail', action.clientEmail),
        ...opt('Popis', action.description),
      ]
    case 'update_project_status':
      return [
        { label: 'Zakázka', value: refText(action.project, 'otevřená zakázka') },
        { label: 'Nový stav', value: STATUS_LABELS[action.status as ProjectStatus] ?? action.status },
      ]
    case 'add_note':
      return [
        { label: 'Kam', value: `${action.target === 'project' ? 'Zakázka' : 'Kontakt'}: ${refText(action.ref, 'otevřená obrazovka')}` },
        { label: 'Text', value: action.noteText },
      ]
    case 'add_payment':
      return [
        { label: 'Co', value: action.paymentType === 'zaloha' ? 'Záloha k zakázce' : 'Příjem bez zakázky' },
        ...(action.paymentType === 'zaloha' ? [{ label: 'Zakázka', value: refText(action.project, 'otevřená zakázka') }] : []),
        { label: 'Částka', value: money(action.amount) },
        { label: 'Kdy', value: czDate(action.date) ?? 'dnes' },
        ...opt('Poznámka', action.note),
      ]
    case 'add_cost':
      return [
        { label: 'Za co', value: action.name },
        { label: 'Částka', value: `${money(action.amount)}, ${COST_TYPES[action.costType] ?? action.costType}` },
        ...opt('Zakázka', action.project ? refText(action.project, 'otevřená zakázka') : null),
      ]
    case 'mark_invoice_paid':
      return [
        { label: 'Faktura', value: refText(action.invoice, 'otevřená faktura') },
        { label: 'Zaplaceno', value: czDate(action.paidOn) ?? 'dnes' },
      ]
    case 'issue_invoice':
      return [
        { label: 'Za zakázku', value: action.project ? refText(action.project, 'otevřená zakázka') : 'bez zakázky' },
        ...opt('Odběratel', action.counterpartyName),
        ...opt('Za co', action.description),
        { label: 'Částka', value: action.amount !== null ? money(action.amount) : 'podle zakázky' },
        { label: 'Co se stane', value: 'Připraví koncept ve Fakturách › Ke schválení. Nic neodejde, dokud ho neschválíte.' },
      ]
    case 'cancel_invoice':
      return [
        { label: 'Faktura', value: refText(action.invoice, 'otevřená faktura') },
        { label: 'Pozor', value: 'Storno nejde vzít zpět.' },
      ]
    case 'send_message':
      return [
        { label: 'Čím', value: action.channel === 'email' ? 'E-mailem' : action.channel === 'sms' ? 'SMS' : 'WhatsAppem' },
        // Komu to půjde, musí být vidět vždycky — podstrčená adresa by jinak
        // prošla bez povšimnutí.
        { label: 'Komu', value: (action.channel === 'email' ? action.email : action.phone) ?? refText(action.ref, 'podle kontaktu') },
        ...opt('Předmět', action.subject),
        { label: 'Text', value: action.body },
      ]
    case 'update_contact':
      return [
        { label: 'Kontakt', value: refText(action.ref, 'otevřený kontakt') },
        ...opt('Nový název', action.companyName),
        ...opt('Jméno', action.contactName),
        ...opt('Telefon', action.phone),
        ...opt('E-mail', action.email),
        ...opt('Stav', action.leadStatus ? (LEAD_STATUS_LABELS[action.leadStatus as LeadStatus] ?? action.leadStatus) : null),
        ...opt('Další krok', action.nextAction),
        ...opt('Kdy', action.nextActionDate || action.nextActionTime ? when(action.nextActionDate, action.nextActionTime) : null),
        ...opt('Odhad hodnoty', action.estimatedValue !== null ? money(action.estimatedValue) : null),
      ]
    case 'update_project':
      return [
        { label: 'Zakázka', value: refText(action.project, 'otevřená zakázka') },
        ...opt('Klient', action.clientName),
        ...opt('Druh práce', action.serviceType),
        ...opt('Cena', action.price !== null ? money(action.price) : null),
        ...opt('Termín', czDate(action.deadline)),
        ...opt('Telefon', action.clientPhone),
        ...opt('E-mail', action.clientEmail),
        ...opt('Popis', action.description),
      ]
    case 'update_event':
      return [
        { label: 'Termín', value: [refText(action.event, 'z otevřené obrazovky'), czDate(action.event.date)].filter(Boolean).join(', ') },
        ...opt('Nový název', action.title),
        ...opt('S kým', action.contactName),
        ...opt('Telefon', action.phone),
        ...opt('E-mail', action.email),
        ...opt('Poznámka', action.note),
      ]
    case 'remember':
      return [
        { label: 'Kam', value: action.scope === 'global' ? 'Obecně o firmě' : `Zakázka: ${refText(action.project, 'otevřená zakázka')}` },
        { label: 'Co', value: action.text },
      ]
  }
}
