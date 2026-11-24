/**
 * Značka pozvánky u události v kalendáři: dostal klient pozvánku na schůzku?
 *
 * Čte jen to, co kalendář už má (`calendar_events.invite_status` z migrace
 * 115), takže na nic nového se neptá. „Odešla" znamená, že e-mail převzal
 * Resend — jestli dorazil do schránky, ZakazIQ neví (webhook Resendu pro
 * vizeon.cz není).
 *
 * Bez `server-only`: počítá to kalendář v prohlížeči.
 */

export type InviteMark = 'sent' | 'sending' | 'failed' | 'missing'

export type InviteMarkInput = {
  eventType: string
  meetUrl: string | null
  inviteStatus: string | null
  /** Kontakt z dvojice v Hovorech (R-010). */
  contactEmail: string | null
  contactPhone: string | null
  endsAt: string | Date
}

export const INVITE_MARK_LABELS: Record<InviteMark, string> = {
  sent: 'Pozvánka odešla',
  sending: 'Pozvánka se odesílá',
  failed: 'Pozvánka neodešla',
  missing: 'Bez pozvánky',
}

const filled = (value: string | null): boolean => value !== null && value.trim() !== ''

/**
 * `null` = žádná značka. Má ji jen událost s klientem: schůzka s Meetem, nebo
 * událost, u které je klientův telefon či e-mail. Soukromá událost bez kontaktu
 * a blokace značku nemají, jinak by „Bez pozvánky" svítilo i u zubaře.
 *
 * U proběhlé události zůstane jen „odešla" jako historie. Co nedorazilo
 * a schůzka už je za námi, se napravit nedá, takže by to jen rušilo.
 */
export function inviteMarkOf(input: InviteMarkInput, now: Date = new Date()): InviteMark | null {
  if (input.eventType !== 'manual') return null
  const upcoming = new Date(input.endsAt).getTime() > now.getTime()

  if (input.inviteStatus === 'sent') return 'sent'
  if (!upcoming) return null
  if (input.inviteStatus === 'pending' || input.inviteStatus === 'sending') return 'sending'
  if (input.inviteStatus === 'failed') return 'failed'

  const withClient = filled(input.meetUrl) || filled(input.contactEmail) || filled(input.contactPhone)
  return withClient ? 'missing' : null
}

export type InviteSummary = Record<InviteMark, number>

/** Kolik schůzek má kterou značku — pro souhrn nad kalendářem. */
export function summarizeInviteMarks(marks: (InviteMark | null | undefined)[]): InviteSummary {
  const summary: InviteSummary = { sent: 0, sending: 0, failed: 0, missing: 0 }
  for (const mark of marks) if (mark) summary[mark] += 1
  return summary
}
