/**
 * Značka pozvánky u události v kalendáři: dostal klient pozvánku na schůzku?
 *
 * Čte stav odeslání (`calendar_events.invite_status`, migrace 115) a od R-146
 * i doručení podle webhooku Resendu (`email_deliveries`, migrace 135).
 * „Odešla" = e-mail převzal Resend, ale zprávu o doručení zatím nemáme
 * (webhook ještě nedorazil, nebo není nastavený). „Dorazila" = poštovní
 * server klienta e-mail přijal; jestli ho klient otevřel, nevíme.
 *
 * Bez `server-only`: počítá to kalendář v prohlížeči.
 */

import { isUndelivered } from '@/lib/admin/email-delivery'

export type InviteMark = 'delivered' | 'sent' | 'sending' | 'undelivered' | 'failed' | 'missing'

export type InviteMarkInput = {
  eventType: string
  meetUrl: string | null
  inviteStatus: string | null
  /** Stav z webhooku Resendu (`email_deliveries.status`), bez něj null. */
  delivery?: string | null
  /** Kontakt z dvojice v Hovorech (R-010). */
  contactEmail: string | null
  contactPhone: string | null
  endsAt: string | Date
}

export const INVITE_MARK_LABELS: Record<InviteMark, string> = {
  delivered: 'Pozvánka dorazila',
  sent: 'Pozvánka odešla',
  sending: 'Pozvánka se odesílá',
  undelivered: 'Pozvánka nedorazila',
  failed: 'Pozvánka neodešla',
  missing: 'Bez pozvánky',
}

const filled = (value: string | null): boolean => value !== null && value.trim() !== ''

/**
 * `null` = žádná značka. Má ji jen událost s klientem: schůzka s Meetem, nebo
 * událost, u které je klientův telefon či e-mail. Soukromá událost bez kontaktu
 * a blokace značku nemají, jinak by „Bez pozvánky" svítilo i u zubaře.
 *
 * U proběhlé události zůstane jen „odešla" a „dorazila" jako historie. Co
 * nedorazilo a schůzka už je za námi, se napravit nedá, takže by to jen rušilo.
 */
export function inviteMarkOf(input: InviteMarkInput, now: Date = new Date()): InviteMark | null {
  if (input.eventType !== 'manual') return null
  const upcoming = new Date(input.endsAt).getTime() > now.getTime()

  if (input.inviteStatus === 'sent') {
    if (isUndelivered(input.delivery)) return upcoming ? 'undelivered' : null
    // Stížnost na spam znamená, že e-mail do schránky dorazil.
    if (input.delivery === 'delivered' || input.delivery === 'complained') return 'delivered'
    return 'sent'
  }
  if (!upcoming) return null
  if (input.inviteStatus === 'pending' || input.inviteStatus === 'sending') return 'sending'
  if (input.inviteStatus === 'failed') return 'failed'

  const withClient = filled(input.meetUrl) || filled(input.contactEmail) || filled(input.contactPhone)
  return withClient ? 'missing' : null
}

/** Pozvánku jde poslat znovu: neodešla, nebo nedorazila. */
export function inviteNeedsResend(mark: InviteMark | null | undefined): boolean {
  return mark === 'failed' || mark === 'undelivered'
}

export type InviteSummary = Record<InviteMark, number>

/** Kolik schůzek má kterou značku — pro souhrn nad kalendářem. */
export function summarizeInviteMarks(marks: (InviteMark | null | undefined)[]): InviteSummary {
  const summary: InviteSummary = { delivered: 0, sent: 0, sending: 0, undelivered: 0, failed: 0, missing: 0 }
  for (const mark of marks) if (mark) summary[mark] += 1
  return summary
}
