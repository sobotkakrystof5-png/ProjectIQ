import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sqlMock, rateLimitMock, recordRequestMock, revalidateMock, headersMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  rateLimitMock: vi.fn(),
  recordRequestMock: vi.fn(),
  revalidateMock: vi.fn(),
  headersMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ sql: sqlMock }))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: rateLimitMock, recordApiRequest: recordRequestMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('next/headers', () => ({ headers: headersMock }))

import { submitContactForm } from '../actions'

const initialContactFormState = { status: 'idle', message: '' } as const

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData()
  data.set('name', fields.name ?? 'Jana Nováková')
  data.set('email', fields.email ?? 'jana@example.cz')
  data.set('message', fields.message ?? 'Ráda bych se zeptala na ZakazIQ.')
  data.set('form_started_at', fields.form_started_at ?? String(Date.now() - 3_000))
  if (fields.company_website !== undefined) data.set('company_website', fields.company_website)
  return data
}

describe('submitContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sqlMock.mockResolvedValue([])
    rateLimitMock.mockResolvedValue(false)
    recordRequestMock.mockResolvedValue(undefined)
    headersMock.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.8' }))
  })

  it('validates fields on the server', async () => {
    const result = await submitContactForm(initialContactFormState, form({ email: 'not-an-email' }))

    expect(result.status).toBe('error')
    expect(sqlMock).not.toHaveBeenCalled()
    expect(rateLimitMock).not.toHaveBeenCalled()
  })

  it('silently drops a filled honeypot', async () => {
    const result = await submitContactForm(initialContactFormState, form({ company_website: 'https://spam.example' }))

    expect(result.status).toBe('success')
    expect(sqlMock).not.toHaveBeenCalled()
    expect(rateLimitMock).not.toHaveBeenCalled()
  })

  it('silently drops submissions made under two seconds', async () => {
    const result = await submitContactForm(initialContactFormState, form({ form_started_at: String(Date.now() - 500) }))

    expect(result.status).toBe('success')
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('rate-limits by IP before storing the request', async () => {
    rateLimitMock.mockResolvedValue(true)
    const result = await submitContactForm(initialContactFormState, form())

    expect(result.status).toBe('error')
    expect(rateLimitMock).toHaveBeenCalledWith('landing_contact', '203.0.113.8', 15, 5)
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('stores a validated message in Hovory with an email follow-up due tomorrow', async () => {
    const result = await submitContactForm(initialContactFormState, form())

    expect(result.status).toBe('success')
    expect(recordRequestMock).toHaveBeenCalledWith('landing_contact', '203.0.113.8')
    expect(sqlMock).toHaveBeenCalledOnce()
    expect(revalidateMock).toHaveBeenCalledWith('/dashboard/calls')
  })
})
