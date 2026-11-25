import { describe, expect, it } from 'vitest'
import { inviteMarkOf, inviteNeedsResend, summarizeInviteMarks, type InviteMarkInput } from '@/lib/admin/invite-mark'

// Značka pozvánky v kalendáři: komu pozvánka na schůzku odešla a komu ne.

const now = new Date('2026-11-24T12:00:00Z')
const tomorrow = '2026-11-25T10:00:00Z'
const yesterday = '2026-11-23T10:00:00Z'

const base: InviteMarkInput = {
  eventType: 'manual',
  meetUrl: null,
  inviteStatus: null,
  contactEmail: null,
  contactPhone: null,
  endsAt: tomorrow,
}

const mark = (patch: Partial<InviteMarkInput>) => inviteMarkOf({ ...base, ...patch }, now)

describe('značka pozvánky', () => {
  it('odeslaná pozvánka je vidět u nadcházející i proběhlé schůzky', () => {
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'sent' })).toBe('sent')
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'sent', endsAt: yesterday })).toBe('sent')
  })

  it('pozvánka v 15s okně na „Zpět" a během odesílání se odesílá', () => {
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'pending' })).toBe('sending')
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'sending' })).toBe('sending')
  })

  it('neodeslaná pozvánka je chyba', () => {
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'failed' })).toBe('failed')
  })

  it('událost s klientem bez pozvánky je „Bez pozvánky"', () => {
    expect(mark({ contactEmail: 'klient@example.cz' })).toBe('missing')
    expect(mark({ contactPhone: '+420000000001' })).toBe('missing')
    // Pozvánku vzal „Zpět" před odesláním, Meet zůstal.
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'cancelled' })).toBe('missing')
  })

  it('soukromá událost bez kontaktu a blokace značku nemají', () => {
    expect(mark({})).toBeNull()
    expect(mark({ contactEmail: '  ' })).toBeNull()
    expect(mark({ eventType: 'block', contactEmail: 'klient@example.cz' })).toBeNull()
  })

  it('u proběhlé události zůstane jen „odešla"', () => {
    expect(mark({ contactEmail: 'klient@example.cz', endsAt: yesterday })).toBeNull()
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'failed', endsAt: yesterday })).toBeNull()
    expect(mark({ meetUrl: 'https://meet.google.com/x', inviteStatus: 'pending', endsAt: yesterday })).toBeNull()
  })

  it('schůzka, která právě běží, se počítá jako nadcházející', () => {
    expect(mark({ contactEmail: 'klient@example.cz', endsAt: '2026-11-24T12:30:00Z' })).toBe('missing')
  })

  it('doručení podle webhooku Resendu (R-146): dorazila, nedorazila, zdržuje se', () => {
    const sent = { meetUrl: 'https://meet.google.com/x', inviteStatus: 'sent' }
    expect(mark({ ...sent, delivery: 'delivered' })).toBe('delivered')
    // Stížnost na spam = do schránky dorazila.
    expect(mark({ ...sent, delivery: 'complained' })).toBe('delivered')
    expect(mark({ ...sent, delivery: 'bounced' })).toBe('undelivered')
    expect(mark({ ...sent, delivery: 'suppressed' })).toBe('undelivered')
    expect(mark({ ...sent, delivery: 'failed' })).toBe('undelivered')
    // Zdržení zatím nic nerozhodlo.
    expect(mark({ ...sent, delivery: 'delayed' })).toBe('sent')
    expect(mark({ ...sent, delivery: null })).toBe('sent')
  })

  it('u proběhlé schůzky zůstane „dorazila", „nedorazila" zmizí', () => {
    const sent = { meetUrl: 'https://meet.google.com/x', inviteStatus: 'sent', endsAt: yesterday }
    expect(mark({ ...sent, delivery: 'delivered' })).toBe('delivered')
    expect(mark({ ...sent, delivery: 'bounced' })).toBeNull()
  })

  it('poslat znovu jde jen pozvánka, která neodešla nebo nedorazila', () => {
    expect(inviteNeedsResend('failed')).toBe(true)
    expect(inviteNeedsResend('undelivered')).toBe(true)
    for (const m of ['delivered', 'sent', 'sending', 'missing', null, undefined] as const) {
      expect(inviteNeedsResend(m)).toBe(false)
    }
  })

  it('souhrn spočítá značky a prázdné vynechá', () => {
    expect(
      summarizeInviteMarks(['sent', 'sent', 'missing', null, undefined, 'failed', 'sending', 'delivered', 'undelivered']),
    ).toEqual({ delivered: 1, sent: 2, sending: 1, undelivered: 1, failed: 1, missing: 1 })
    expect(summarizeInviteMarks([])).toEqual({ delivered: 0, sent: 0, sending: 0, undelivered: 0, failed: 0, missing: 0 })
  })
})
