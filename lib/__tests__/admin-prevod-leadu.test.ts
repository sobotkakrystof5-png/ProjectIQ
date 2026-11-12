import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Převod kontaktu z Hovorů na zakázku (AD09).
 *
 * Dřív přenesl šest textových polí a zbytek nechal za sebou: firmu, poznámky
 * z hovorů i termín v kalendáři. Test hlídá, že zakázka dostane **kontakt**
 * (ne kopii textu), poznámky, firmu i termín — a že převod skončí na nové
 * zakázce, ne na Dnes.
 */

const sqlMock = vi.fn()
const ensureMock = vi.fn()
const notifyMock = vi.fn()
const redirects: string[] = []
const afterCallbacks: (() => unknown)[] = []

vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirects.push(url)
  },
}))
vi.mock('next/server', () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('@/lib/admin/contacts', () => ({ ensureContact: (...a: unknown[]) => ensureMock(...a) }))
vi.mock('@/app/actions', () => ({ notifyClientOfProjectChange: (...a: unknown[]) => notifyMock(...a) }))
vi.mock('@/lib/email', () => ({ sendPlainEmail: vi.fn() }))
vi.mock('@/lib/admin/leads', () => ({ loadLeadNotes: vi.fn() }))

import { convertLeadToProject } from '@/app/calls-actions'

const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const CONTACT_ID = '33333333-3333-4333-8333-333333333333'
const EVENT_ID = '44444444-4444-4444-8444-444444444444'

const lead = {
  id: LEAD_ID,
  company_name: 'Kavárna Ukázková',
  contact_name: 'Jana Ukázková',
  phone: '777 123 456',
  email: 'jana@example.cz',
  lead_status: 'warm',
  notes: 'Chce nový web do Vánoc.',
  estimated_value: 45000,
  calendar_event_id: EVENT_ID,
}

function queueSql(answers: unknown[][]) {
  const calls: { text: string; params: unknown[] }[] = []
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join('?').replace(/\s+/g, ' '), params })
    return answers.shift() ?? []
  })
  return calls
}

beforeEach(() => {
  sqlMock.mockReset()
  ensureMock.mockReset()
  notifyMock.mockReset()
  redirects.length = 0
  afterCallbacks.length = 0
  ensureMock.mockResolvedValue(CONTACT_ID)
})

describe('convertLeadToProject', () => {
  it('napojí zakázku na kontakt, převezme firmu a poznámky a naváže termín', async () => {
    const calls = queueSql([
      [lead],
      [{ id: PROJECT_ID, public_token: 'token-123', calendar_event_id: EVENT_ID }],
      [],
    ])

    await convertLeadToProject(LEAD_ID)

    // Kontakt se hledá podle telefonu a e-mailu z leadu, ne podle jména.
    expect(ensureMock).toHaveBeenCalledWith({
      name: 'Jana Ukázková',
      company: 'Kavárna Ukázková',
      email: 'jana@example.cz',
      phone: '777 123 456',
      source: 'lead',
    })

    const convert = calls[1]
    expect(convert.text).toContain('INSERT INTO projects')
    expect(convert.text).toContain('contact_id')
    expect(convert.params).toContain(CONTACT_ID)
    // Firma se neztratí, i když se klient jmenuje jménem člověka.
    expect(convert.text).toContain("'Firma: '")
    // Poznámky z hovorů jdou do zakázky.
    expect(convert.text).toContain('INSERT INTO project_notes')

    // Termín z Hovorů se naváže na zakázku vlastním příkazem.
    expect(calls[2].text).toContain('UPDATE calendar_events SET project_id')
    expect(calls[2].params).toEqual([PROJECT_ID, EVENT_ID])
  })

  it('skončí na nové zakázce a e-mail klientovi čeká na odeslání odpovědi', async () => {
    queueSql([[lead], [{ id: PROJECT_ID, public_token: 'token-123', calendar_event_id: null }], []])

    await convertLeadToProject(LEAD_ID)

    expect(redirects).toEqual([`/dashboard/${PROJECT_ID}`])
    // E-mail je mimo akci (AD08): během převodu se ještě neposlal.
    expect(notifyMock).not.toHaveBeenCalled()
    for (const cb of afterCallbacks) await cb()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0]).toMatchObject({ client_name: 'Jana Ukázková', public_token: 'token-123' })
  })

  it('už převedený kontakt podruhé zakázku nezaloží', async () => {
    queueSql([[lead], []])
    await expect(convertLeadToProject(LEAD_ID)).rejects.toThrow('již převeden')
    expect(redirects).toEqual([])
  })

  it('kontakt bez termínu kalendář neřeší', async () => {
    const calls = queueSql([[lead], [{ id: PROJECT_ID, public_token: 'tok', calendar_event_id: null }]])
    await convertLeadToProject(LEAD_ID)
    expect(calls.some((c) => c.text.includes('UPDATE calendar_events'))).toBe(false)
  })
})
