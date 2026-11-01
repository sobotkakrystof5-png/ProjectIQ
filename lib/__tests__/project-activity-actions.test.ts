import { beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.fn()
const requireAuthMock = vi.fn()
const sendDigestMock = vi.fn()

vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: () => requireAuthMock() }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendActivityDigestEmail: (...a: unknown[]) => sendDigestMock(...a) }))
vi.mock('@/lib/utils', () => ({ getPublicUrl: (t: string) => `https://app.example.cz/p/${t}` }))

import {
  approveActivity,
  approveAllDrafts,
  createActivityDraft,
  rejectActivity,
  updateActivity,
} from '@/app/project-activity-actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ACTIVITY_ID = '22222222-2222-4222-8222-222222222222'
const project = {
  id: PROJECT_ID,
  business: 'vizeon',
  public_token: 'tok',
  client_name: 'Novák',
  client_email: 'novak@example.cz',
}

/** Vrací odpovědi po řadě; text dotazu se sbírá do `calls` pro kontrolu. */
function queueSql(answers: unknown[][]) {
  const calls: string[] = []
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    calls.push(strings.join('?'))
    return answers.shift() ?? []
  })
  return calls
}

beforeEach(() => {
  sqlMock.mockReset()
  requireAuthMock.mockReset()
  sendDigestMock.mockReset()
  requireAuthMock.mockResolvedValue(undefined)
})

describe('oprávnění', () => {
  it('bez přihlášení žádná akce nic nezapíše', async () => {
    requireAuthMock.mockRejectedValue(new Error('Neautorizovaný přístup'))
    const input = { title: 'a', body: 'b', kind: 'done' as const }
    await expect(createActivityDraft(PROJECT_ID, input)).rejects.toThrow()
    await expect(updateActivity(ACTIVITY_ID, input)).rejects.toThrow()
    await expect(approveActivity(ACTIVITY_ID)).rejects.toThrow()
    await expect(approveAllDrafts(PROJECT_ID)).rejects.toThrow()
    await expect(rejectActivity(ACTIVITY_ID)).rejects.toThrow()
    expect(sqlMock).not.toHaveBeenCalled()
  })
})

describe('createActivityDraft', () => {
  it('uloží koncept se zakrytým tajným údajem a příznakem', async () => {
    const insertArgs: unknown[][] = []
    sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?')
      if (text.includes('FROM projects')) return [project]
      if (text.includes('INSERT INTO project_activity')) {
        insertArgs.push(values)
        return [{ id: ACTIVITY_ID }]
      }
      return []
    })
    const res = await createActivityDraft(PROJECT_ID, { title: 'Nová stránka', body: 'Klíč sk-abcdefghijklmnopqrstu je venku.', kind: 'done' })
    expect(res).toEqual({ success: true, id: ACTIVITY_ID })
    const values = insertArgs[0]
    expect(values.join(' ')).not.toContain('sk-abcdefghijklmnopqrstu')
    expect(values).toContain(true)
  })

  it('odmítne prázdný nadpis bez zásahu do DB', async () => {
    const res = await createActivityDraft(PROJECT_ID, { title: ' ', body: 'x', kind: 'done' })
    expect(res.success).toBe(false)
    expect(sqlMock).not.toHaveBeenCalled()
  })
})

describe('approveActivity', () => {
  it('citlivý koncept neschválí a řekne proč', async () => {
    queueSql([[], [{ status: 'draft', contains_sensitive: true }]])
    const res = await approveActivity(ACTIVITY_ID)
    expect(res.success).toBe(false)
    expect(!res.success && res.error).toContain('[skryto]')
    expect(sendDigestMock).not.toHaveBeenCalled()
  })

  it('schválení bez klientova e-mailu e-mail neodešle', async () => {
    queueSql([[{ id: ACTIVITY_ID }], [{ ...project, client_email: null }]])
    const res = await approveActivity(ACTIVITY_ID)
    expect(res).toEqual({ success: true })
    expect(sendDigestMock).not.toHaveBeenCalled()
  })

  it('schválení pošle souhrnný e-mail a selhání e-mailu publikaci nezruší', async () => {
    queueSql([
      [{ id: ACTIVITY_ID }],
      [project],
      [{ id: ACTIVITY_ID, kind: 'done', title: 'Nová stránka' }],
      [],
    ])
    sendDigestMock.mockResolvedValue(false)
    const res = await approveActivity(ACTIVITY_ID)
    expect(res).toEqual({ success: true })
    expect(sendDigestMock).toHaveBeenCalledTimes(1)
    // značka „odesláno“ se po neúspěchu vrací
    const releaseCall = sqlMock.mock.calls.at(-1)?.[0] as TemplateStringsArray
    expect(releaseCall.join('?')).toContain('client_emailed_at = NULL')
  })

  it('výjimka při odeslání e-mailu publikaci nezruší', async () => {
    queueSql([[{ id: ACTIVITY_ID }], [project], [{ id: ACTIVITY_ID, kind: 'done', title: 'T' }], []])
    sendDigestMock.mockRejectedValue(new Error('smtp'))
    const res = await approveActivity(ACTIVITY_ID)
    expect(res).toEqual({ success: true })
  })

  it('už schválená nebo cizí zpráva se nenajde', async () => {
    queueSql([[], []])
    const res = await approveActivity(ACTIVITY_ID)
    expect(res.success).toBe(false)
  })

  it('neplatné id neprojde do DB', async () => {
    const res = await approveActivity('není-uuid')
    expect(res.success).toBe(false)
    expect(sqlMock).not.toHaveBeenCalled()
  })
})

describe('approveAllDrafts', () => {
  it('vrátí počet schválených a ponechaných konceptů', async () => {
    queueSql([[project], [{ id: 'a' }, { id: 'b' }], [{ count: 1 }], [{ id: 'a', kind: 'done', title: 'A' }], []])
    sendDigestMock.mockResolvedValue(true)
    const res = await approveAllDrafts(PROJECT_ID)
    expect(res).toEqual({ success: true, approved: 2, skipped: 1 })
    expect(sendDigestMock).toHaveBeenCalledTimes(1)
  })
})
