import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

/**
 * AD11: změna stavu zakázky je jeden klik se „Zpět" a klient dostane
 * **jeden** e-mail.
 *
 * `AGENTS-ADMIN.md` dřív tvrdilo, že to nejde, protože „Zpět" by e-mail
 * poslal podruhé. Řeší to odklad: e-mail jde v `after()` se zpožděním
 * a těsně před odesláním se stav načte z databáze znovu. Tenhle test obě
 * větve ověřuje — stav zůstal (e-mail odejde) a stav se vrátil (neodejde).
 */

const sqlMock = vi.fn()
const sendBrandedMock = vi.fn()
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
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }))
vi.mock('@/lib/invoices', () => ({ parseInvoiceForm: vi.fn(), insertInvoice: vi.fn() }))

import { setProjectStatus, undoProjectStatus } from '@/app/actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function queueSql(answers: unknown[][]) {
  sqlMock.mockImplementation(async () => answers.shift() ?? [])
}

const zakazka = {
  status: 'in_progress',
  client_name: 'Novák',
  client_email: 'novak@example.cz',
  progress: 50,
  project_url: null,
  public_token: 'tok',
}

/** Spustí odložené callbacky a přetočí čas, aby se dočkaly konce odkladu. */
async function runAfter() {
  const queued = afterCallbacks.splice(0)
  const running = queued.map((cb) => cb())
  await vi.advanceTimersByTimeAsync(20_000)
  await Promise.all(running)
  return queued.length
}

beforeEach(() => {
  vi.useFakeTimers()
  sqlMock.mockReset()
  sendBrandedMock.mockReset()
  afterCallbacks.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('změna stavu jedním klikem', () => {
  it('akce nečeká na e-mail a vrátí předchozí stav pro „Zpět"', async () => {
    queueSql([[zakazka], []])
    const result = await setProjectStatus(PROJECT_ID, 'review')

    expect(result).toEqual({ previousStatus: 'in_progress' })
    expect(sendBrandedMock).not.toHaveBeenCalled()
    // Oznámení do zvonku a e-mail klientovi — obojí až po odpovědi.
    expect(afterCallbacks).toHaveLength(2)
  })

  it('když stav zůstane, odejde klientovi právě jeden e-mail', async () => {
    queueSql([
      [zakazka],
      [],
      // Kontrola těsně před odesláním: stav je pořád ten nový.
      [{ status: 'review', progress: 50 }],
    ])
    await setProjectStatus(PROJECT_ID, 'review')
    await runAfter()

    expect(sendBrandedMock).toHaveBeenCalledTimes(1)
    expect(sendBrandedMock.mock.calls[0][0]).toMatchObject({ to: 'novak@example.cz' })
    expect(sendBrandedMock.mock.calls[0][0]).toMatchObject({
      fields: [
        { label: 'Stav', value: 'Čeká na schválení' },
        { label: 'Postup', value: '50%' },
      ],
    })
  })

  it('po „Zpět" e-mail neodejde vůbec', async () => {
    queueSql([
      [zakazka],
      [],
      // Mezitím běželo `undoProjectStatus`, takže kontrola vidí starý stav.
      [{ status: 'in_progress', progress: 50 }],
    ])
    const { previousStatus } = await setProjectStatus(PROJECT_ID, 'review')
    await undoProjectStatus(PROJECT_ID, previousStatus)
    await runAfter()

    expect(sendBrandedMock).not.toHaveBeenCalled()
  })

  it('zakázka smazaná během odkladu e-mail nepošle', async () => {
    queueSql([[zakazka], [], []])
    await setProjectStatus(PROJECT_ID, 'done')
    await runAfter()

    expect(sendBrandedMock).not.toHaveBeenCalled()
  })

  it('stejný stav znovu nic nedělá', async () => {
    queueSql([[zakazka]])
    const result = await setProjectStatus(PROJECT_ID, 'in_progress')

    expect(result).toEqual({ previousStatus: 'in_progress' })
    expect(afterCallbacks).toHaveLength(0)
  })

  it('neznámý stav neprojde', async () => {
    queueSql([[zakazka]])
    await expect(setProjectStatus(PROJECT_ID, 'hotovo' as never)).rejects.toThrow('Neznámý stav')
    await expect(undoProjectStatus(PROJECT_ID, 'hotovo' as never)).rejects.toThrow('Neznámý stav')
  })

  it('zakázka bez e-mailu klienta neplánuje odeslání', async () => {
    queueSql([[{ ...zakazka, client_email: null }], []])
    await setProjectStatus(PROJECT_ID, 'done')

    // Zbyde jen oznámení do zvonku.
    expect(afterCallbacks).toHaveLength(1)
    await runAfter()
    expect(sendBrandedMock).not.toHaveBeenCalled()
  })
})
