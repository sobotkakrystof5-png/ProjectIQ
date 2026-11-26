/**
 * Doručení e-mailů z adminu podle webhooku Resendu (R-146) — čistá část bez
 * databáze. Používá ji webhook i kalendář v prohlížeči, proto bez `server-only`.
 *
 * Webhook Resendu je na celý účet: chodí do něj i e-maily Growth OS, který
 * posílá ze stejné domény vizeon.cz. Naše e-maily proto nesou štítek
 * `zakaziq=admin` (`sendVizeonMail`) a všechno bez něj se zahodí.
 */

export type DeliveryStatus = 'delayed' | 'delivered' | 'complained' | 'bounced' | 'failed' | 'suppressed'

/** Štítek, který dostane každý e-mail z `sendVizeonMail`. */
export const ADMIN_MAIL_TAG = { name: 'zakaziq', value: 'admin' } as const

const EVENT_STATUS: Record<string, DeliveryStatus> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.complained': 'complained',
  'email.bounced': 'bounced',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
}

/** Resend webhooky, které má endpoint dostávat (návod pro nastavení v Resendu). */
export const WEBHOOK_EVENTS = Object.keys(EVENT_STATUS)

/** E-mail ke klientovi nedorazil: vrátil se, Resend ho neposlal, nebo nedoručil. */
export function isUndelivered(status: string | null | undefined): boolean {
  return status === 'bounced' || status === 'failed' || status === 'suppressed'
}

export type DeliveryEvent = {
  providerId: string
  status: DeliveryStatus
  eventAt: Date
  /** Jen u vrácení: Permanent / Transient / Undetermined. */
  bounceType: string | null
}

const PROVIDER_ID = /^[A-Za-z0-9-]{1,100}$/
const BOUNCE_TYPE = /^[A-Za-z]{1,40}$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Resend posílá štítky jako objekt; pro jistotu bereme i pole `{ name, value }`. */
function hasAdminTag(tags: unknown): boolean {
  if (Array.isArray(tags)) {
    return tags.some((t) => isObject(t) && t.name === ADMIN_MAIL_TAG.name && t.value === ADMIN_MAIL_TAG.value)
  }
  return isObject(tags) && tags[ADMIN_MAIL_TAG.name] === ADMIN_MAIL_TAG.value
}

function parseTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time) : null
}

/**
 * Událost z webhooku → co uložit. `null` = netýká se nás (jiný druh události,
 * e-mail bez našeho štítku, nečitelné id). Payload je po ověření podpisu
 * od Resendu, ale i tak se z něj nebere nic jiného než id, stav, čas a druh
 * vrácení — adresa a text odpovědi serveru zůstávají venku.
 */
export function parseResendEvent(evt: unknown, now: Date = new Date()): DeliveryEvent | null {
  if (!isObject(evt) || typeof evt.type !== 'string') return null
  const status = EVENT_STATUS[evt.type]
  if (!status) return null
  const data = evt.data
  if (!isObject(data) || !hasAdminTag(data.tags)) return null
  const providerId = data.email_id
  if (typeof providerId !== 'string' || !PROVIDER_ID.test(providerId)) return null

  const bounce = isObject(data.bounce) ? data.bounce.type : null
  return {
    providerId,
    status,
    // Čas události je nahoře; `data.created_at` je čas odeslání e-mailu, ne doručení.
    eventAt: parseTime(evt.created_at) ?? now,
    bounceType: status === 'bounced' && typeof bounce === 'string' && BOUNCE_TYPE.test(bounce) ? bounce : null,
  }
}
