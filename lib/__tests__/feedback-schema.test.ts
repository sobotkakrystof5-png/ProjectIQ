import { describe, it, expect } from 'vitest'
import { feedbackSchema, bookingSchema } from '../feedback-schema'

describe('feedbackSchema', () => {
  it('accepts a valid NPS without content', () => {
    expect(feedbackSchema.safeParse({ nps: 7 }).success).toBe(true)
  })

  it('rejects NPS outside 1-10', () => {
    expect(feedbackSchema.safeParse({ nps: 0 }).success).toBe(false)
    expect(feedbackSchema.safeParse({ nps: 11 }).success).toBe(false)
  })

  it('rejects non-integer NPS', () => {
    expect(feedbackSchema.safeParse({ nps: 5.5 }).success).toBe(false)
  })

  it('rejects content over 2000 chars', () => {
    expect(feedbackSchema.safeParse({ nps: 5, content: 'a'.repeat(2001) }).success).toBe(false)
  })
})

describe('bookingSchema', () => {
  const base = {
    clientWish: 'Konzultace ke smlouvě',
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    channel: 'whatsapp' as const,
    clientEmail: 'klient@example.com',
  }

  it('accepts a valid booking', () => {
    expect(bookingSchema.safeParse(base).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(bookingSchema.safeParse({ ...base, clientEmail: 'not-an-email' }).success).toBe(false)
  })

  it('rejects an invalid date string', () => {
    expect(bookingSchema.safeParse({ ...base, scheduledAt: 'not-a-date' }).success).toBe(false)
  })

  it('requires channelOtherText when channel is "other"', () => {
    const result = bookingSchema.safeParse({ ...base, channel: 'other', channelOtherText: '' })
    expect(result.success).toBe(false)
  })

  it('accepts channel "other" with channelOtherText filled in', () => {
    const result = bookingSchema.safeParse({ ...base, channel: 'other', channelOtherText: 'Signal' })
    expect(result.success).toBe(true)
  })
})
