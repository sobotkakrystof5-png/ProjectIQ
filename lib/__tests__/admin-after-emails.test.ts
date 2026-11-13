import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AD08: žádná akce adminu nečeká na SMTP. E-maily a oznámení se plánují
 * přes `after()` z `next/server`, takže odejdou až po odeslání odpovědi.
 *
 * Test to pozná takhle: `after` je zmocněné a nasbírané callbacky **nespustí**.
 * Když akce dobehne a `sendBrandedEmail` zatím nebyl zavolaný, je e-mail
 * mimo akci. Teprve ruční spuštění callbacků ověří, že se e-mail opravdu
 * pošle (a komu).
 */

const sqlMock = vi.fn()
const sendBrandedMock = vi.fn()
const createNotificationMock = vi.fn()
const afterCallbacks: (() => unknown)[] = []

vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/server', () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('@/lib/email', () => ({ sendBrandedEmail: (...a: unknown[]) => sendBrandedMock(...a) }))
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => createNotificationMock(...a) }))
vi.mock('@/lib/invoices', () => ({ parseInvoiceForm: vi.fn(), insertInvoice: vi.fn() }))
// Od AD13 ukládá zakázka i datum platby přes dávkovaný `lib/admin/db.ts`.
// Bez migrace 109 se jen zjistí, že sloupce nejsou, a nic se nezapisuje.
vi.mock('@/lib/admin/db', () => ({
  adminDb: Object.assign(vi.fn(), { batch: async () => [[]] }),
}))
// Dotazník má od AD16 vlastní modul a odklad 15 s — test čeká na rozhodnutí,
// ne na časovač. Co posílá a komu, hlídá `admin-hodnoceni.test.ts`.
const sendSurveyMock = vi.fn()
vi.mock('@/lib/admin/surveys', () => ({
  SURVEY_SEND_DELAY_MS: 0,
  sendSurveyRequest: (...a: unknown[]) => sendSurveyMock(...a),
}))

import { confirmWebLead, updateProject } from '@/app/actions'
import { closeProject } from '@/app/closed-actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function queueSql(answers: unknown[][]) {
  const calls: string[] = []
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    calls.push(strings.join('?'))
    return answers.shift() ?? []
  })
  return calls
}

/** Spustí to, co akce odložila na „po odpovědi". */
async function runAfter() {
  const queued = afterCallbacks.splice(0)
  for (const cb of queued) await cb()
  return queued.length
}

const payload = {
  client_name: 'Novák',
  client_email: 'novak@example.cz',
  client_phone: null,
  service_type: null,
  description: 'Web',
  focus: null,
  project_url: null,
  status: 'in_progress' as const,
  progress: 50,
  price: null,
  paid: false,
  deadline: null,
  notes: null,
  estimated_costs: null,
  deposit_amount: null,
  deposit_paid: false,
  invoiced_on_ico: false,
}

beforeEach(() => {
  sqlMock.mockReset()
  sendBrandedMock.mockReset()
  sendSurveyMock.mockReset()
  createNotificationMock.mockReset()
  afterCallbacks.length = 0
  sendBrandedMock.mockResolvedValue(true)
  createNotificationMock.mockResolvedValue(undefined)
  process.env.VIZEON_ADMIN_EMAIL = 'admin@example.cz'
})

describe('uložení zakázky nečeká na e-mail', () => {
  it('updateProject skončí bez odeslání a e-mail i oznámení odloží', async () => {
    queueSql([
      [{ status: 'new', paid: false, deposit_paid: false, invoiced_on_ico: false }],
      [{ public_token: 'tok' }],
    ])

    await updateProject(PROJECT_ID, payload)

    // Akce je hotová — a SMTP se zatím nikdo nedotkl.
    expect(sendBrandedMock).not.toHaveBeenCalled()
    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(2)

    await runAfter()
    expect(sendBrandedMock).toHaveBeenCalledTimes(1)
    expect(sendBrandedMock.mock.calls[0][0]).toMatchObject({ to: 'novak@example.cz' })
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('zakázka bez e-mailu klienta neplánuje nic k odeslání', async () => {
    queueSql([
      [{ status: 'in_progress', paid: false, deposit_paid: false, invoiced_on_ico: false }],
      [{ public_token: 'tok' }],
    ])

    await updateProject(PROJECT_ID, { ...payload, client_email: null })

    expect(afterCallbacks).toHaveLength(0)
    expect(await runAfter()).toBe(0)
    expect(sendSurveyMock).not.toHaveBeenCalled()
  })
})

describe('potvrzení poptávky', () => {
  it('odpoví hned, oba e-maily odejdou po odpovědi a v pořadí klient → admin', async () => {
    queueSql([[{
      client_name: 'Novák',
      client_email: 'novak@example.cz',
      service_type: 'Web',
      description: null,
      public_token: 'tok',
      project_url: null,
      lead_origin: 'vizeon',
    }]])

    await confirmWebLead(PROJECT_ID)

    expect(sendBrandedMock).not.toHaveBeenCalled()
    // Jeden callback na oba e-maily — pořadí uvnitř zůstává zachované.
    expect(afterCallbacks).toHaveLength(1)

    await runAfter()
    expect(sendBrandedMock).toHaveBeenCalledTimes(2)
    expect(sendBrandedMock.mock.calls[0][0]).toMatchObject({ to: 'novak@example.cz' })
    expect(sendBrandedMock.mock.calls[1][0]).toMatchObject({ to: 'admin@example.cz' })
  })
})

describe('uzavření zakázky (AD11)', () => {
  it('dotazník se zařadí až po odpovědi', async () => {
    queueSql([
      [{
        client_name: 'Novák', client_email: 'novak@example.cz', description: 'Web',
        status: 'in_progress', closed_at: null, estimated_costs: null, survey_token: 'surv',
      }],
      [],
    ])

    const result = await closeProject(PROJECT_ID, {
      project_type: 'client',
      closed_on: '2026-11-12',
      difficulty: 3,
      time_invested: null,
      estimated_hours: null,
      include_costs: false,
    })

    expect(result).toEqual({ previousStatus: 'in_progress', skippedCostsDueToExisting: false })
    expect(sendSurveyMock).not.toHaveBeenCalled()

    await runAfter()
    // Uzavření posílá dotazník i na databázi bez migrace 112 — dělalo to tak
    // i před AD16, takže se klient o dotazník nasazením nepřipraví.
    expect(sendSurveyMock).toHaveBeenCalledWith(PROJECT_ID, { fallbackWithoutColumn: true })
  })

  it('už uzavřenou zakázku neuzavře podruhé', async () => {
    queueSql([
      [{
        client_name: 'Novák', client_email: 'novak@example.cz', description: 'Web',
        status: 'done', closed_at: '2026-11-01', estimated_costs: null, survey_token: 'surv',
      }],
    ])

    await expect(
      closeProject(PROJECT_ID, {
        project_type: 'client',
        closed_on: '2026-11-12',
        difficulty: 3,
        time_invested: null,
        estimated_hours: null,
        include_costs: false,
      }),
    ).rejects.toThrow('už uzavřená')
    expect(afterCallbacks).toHaveLength(0)
  })

  it('vlastní projekt bez klienta dotazník neposílá', async () => {
    queueSql([
      [{
        client_name: 'Interní nástroj', client_email: 'ja@example.cz', description: null,
        status: 'in_progress', closed_at: null, estimated_costs: null, survey_token: 'surv',
      }],
      [],
    ])

    await closeProject(PROJECT_ID, {
      project_type: 'personal',
      closed_on: '2026-11-12',
      difficulty: 8,
      time_invested: 20,
      estimated_hours: null,
      include_costs: false,
    })

    expect(afterCallbacks).toHaveLength(0)
    expect(await runAfter()).toBe(0)
    expect(sendSurveyMock).not.toHaveBeenCalled()
  })
})
