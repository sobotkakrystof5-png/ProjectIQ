import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Plány asistenta (AD14, R-111) proti skutečnému Postgresu (PGlite).
 *
 * Testuje se to, co drží „asistent koná, člověk vrací":
 * - vratné akce se provedou hned, faktura a zprávy čekají na klepnutí,
 * - s cizím textem v kontextu nebo při nejistotě se nic neprovede samo,
 * - prohlížeč posílá jen `id`, plán i údaje pro „Zpět" se berou z databáze,
 * - pozměněný řádek se neprovede, dvojklik neudělá akci dvakrát,
 * - „Zpět" vrátí každý krok jen jednou.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({
  getAdminSession: async () => ({ email: 'admin@example.cz' }),
  adminActorEmail: async () => 'admin@example.cz',
  requireAuth: async () => {},
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: async () => false,
  recordApiRequest: async () => {},
}))

const runSpy = vi.fn()
const undoSpy = vi.fn()
vi.mock('@/lib/admin/suggestion-apply', () => ({
  runAction: (action: unknown) => runSpy(action),
  undoStep: (token: unknown) => undoSpy(token),
}))

const proposeSpy = vi.fn()
vi.mock('@/lib/ai/propose', () => ({
  proposeAction: (input: unknown) => proposeSpy(input),
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { applySuggestion, proposeSuggestion, rejectSuggestion, undoSuggestion } from '@/app/ai-actions'
import {
  expireOldSuggestions,
  loadSuggestion,
  saveSuggestion,
  resetSuggestionsReadyForTests,
} from '@/lib/admin/suggestions'
import { suggestionSchema, type Action, type Suggestion } from '@/lib/ai/suggestion-schema'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const MEETING: Action = {
  kind: 'schedule_event',
  title: 'Schůzka s Novákem',
  date: '2026-11-19',
  time: '14:00',
  durationMinutes: 60,
  contactName: 'Jan Novák',
  phone: '+420777123456',
  email: null,
  note: null,
}
const INVOICE: Action = {
  kind: 'issue_invoice',
  project: { id: null, hint: 'Novák' },
  counterpartyName: null,
  description: 'Web',
  amount: 20000,
}

const plan = (actions: Action[], confidence = 0.9): Suggestion => ({
  actions,
  reply: 'Zapíšu schůzku.',
  confidence,
  assumptions: ['„ve čtvrtek" = 19. 11. 2026'],
  missing: [],
})

const EVENT_UNDO = { type: 'event_created', id: '22222222-2222-4222-8222-222222222222' }

async function insert(suggestion: Suggestion = plan([MEETING])): Promise<string> {
  const id = await saveSuggestion({
    authorEmail: 'admin@example.cz',
    source: 'panel',
    inputText: 'schůzka s Novákem ve čtvrtek ve dvě',
    model: 'test-model',
    suggestion,
    tokensIn: 100,
    tokensOut: 50,
  })
  if (!id) throw new Error('Plán se neuložil')
  return id
}

function proposed(suggestion: Suggestion, untrustedContext = false) {
  proposeSpy.mockResolvedValue({ suggestion, model: 'test-model', tokensIn: 1, tokensOut: 1, untrustedContext })
}

beforeAll(async () => {
  db = new PGlite()
  const migration = read('110_ai_navrhy.sql')
  await db.exec(migration)
  // Idempotence: druhý běh nesmí spadnout ani nic změnit.
  await db.exec(migration)
  setAdminDbForTests(pgliteAdminDriver(db))
  resetSuggestionsReadyForTests()
  // Asistent hlídá termíny v minulosti (R-113). Pevné „teď" před termíny
  // z testu, ať test nezačne padat, až 19. 11. 2026 projde. Jen `Date` —
  // časovače PGlite běží dál.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T09:00:00Z'))
})

afterAll(async () => {
  vi.useRealTimers()
  setAdminDbForTests(null)
  resetSuggestionsReadyForTests()
  await db.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM ai_suggestions')
  runSpy.mockReset()
  undoSpy.mockReset()
  proposeSpy.mockReset()
  runSpy.mockResolvedValue({ ok: true, message: 'Termín v kalendáři', href: '/dashboard/calendar', undo: EVENT_UNDO })
  undoSpy.mockResolvedValue({ ok: true })
})

describe('věta → provedení', () => {
  it('vratnou akci provede hned a uloží, jak ji vrátit', async () => {
    proposed(plan([MEETING]))
    const out = await proposeSuggestion({ text: 'schůzka s Novákem ve čtvrtek ve dvě' })

    expect(out.ok).toBe(true)
    if (!out.ok || !out.id) return
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(out.steps).toEqual([expect.objectContaining({ index: 0, ok: true, canUndo: true })])
    // Údaj pro „Zpět" do prohlížeče nejde. Id záznamu ve shrnutí kola být
    // smí (R-113): model ho v dalším kole potřebuje, aby „posuň to" sáhlo
    // na správný termín — jak krok vrátit, ale leží jen v databázi.
    expect(JSON.stringify(out.steps)).not.toContain(EVENT_UNDO.id)
    expect(JSON.stringify(out)).not.toContain('"undo"')
    expect(out.turn).toContain(`termín ${EVENT_UNDO.id}`)

    const row = await loadSuggestion(out.id)
    expect(row?.status).toBe('applied')
    expect(row?.steps[0].undo).toEqual(EVENT_UNDO)
  })

  it('fakturu nechá čekat, i když vedle ní běží vratná akce', async () => {
    proposed(plan([MEETING, INVOICE]))
    const out = await proposeSuggestion({ text: 'schůzka a vystav fakturu' })

    expect(out.ok).toBe(true)
    if (!out.ok || !out.id) return
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(runSpy.mock.calls[0][0]).toEqual(MEETING)
    expect((await loadSuggestion(out.id))?.status).toBe('pending')
    expect(out.actions[1].cls).toBe('confirm')
  })

  it('s cizím textem v kontextu neprovede nic samo', async () => {
    proposed(plan([MEETING]), true)
    const out = await proposeSuggestion({ text: 'zapiš schůzku' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.guarded).toBe(true)
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('při nejistotě neprovede nic samo', async () => {
    proposed(plan([MEETING], 0.3))
    const out = await proposeSuggestion({ text: 'něco s Novákem' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.unsure).toBe(true)
    expect(runSpy).not.toHaveBeenCalled()
  })
})

describe('nejdřív se zeptat (R-113)', () => {
  it('termín bez času nic neprovede, neuloží a zeptá se', async () => {
    proposed(plan([{ ...MEETING, time: null }]))
    const out = await proposeSuggestion({ text: 'schůzka s Novákem ve čtvrtek' })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(runSpy).not.toHaveBeenCalled()
    expect(out.needsInfo).toBe(true)
    expect(out.id).toBeNull()
    expect(out.missing).toContain('čas termínu')
    expect(out.reply).toContain('čas termínu')
    expect(out.turn).toContain('čeká na doplnění')
    const rows = await db.query('SELECT count(*)::int AS n FROM ai_suggestions')
    expect((rows.rows[0] as { n: number }).n).toBe(0)
  })

  it('zadrží celý plán, i když je v něm i úplná akce', async () => {
    proposed(plan([{ kind: 'create_contact', companyName: 'Novák', contactName: null, phone: '777123456', email: null, note: null }, { ...MEETING, date: null }]))
    const out = await proposeSuggestion({ text: 'přidej Nováka a zapiš ho na schůzku' })
    expect(out.ok && out.needsInfo).toBe(true)
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('historii a příznak cizího textu přijme a cizí text vypne samostatné provádění', async () => {
    proposed(plan([MEETING]))
    const out = await proposeSuggestion({
      text: 've dvě, telefon 777 123 456',
      history: [
        { role: 'user', content: 'schůzka s Novákem ve čtvrtek' },
        { role: 'assistant', content: 'V kolik hodin?' },
      ],
      tainted: true,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(proposeSpy.mock.calls[0][0]).toMatchObject({ history: [{ role: 'user' }, { role: 'assistant' }] })
    expect(runSpy).not.toHaveBeenCalled()
    expect(out.guarded).toBe(true)
    expect(out.tainted).toBe(true)
  })
})

describe('čas (R-113)', () => {
  it('termín, který už proběhl, se neprovede sám, ale jde zapsat klepnutím', async () => {
    proposed(plan([{ ...MEETING, date: '2026-11-17', time: '08:00' }]))
    const out = await proposeSuggestion({ text: 'zapiš schůzku s Novákem dnes v osm' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(runSpy).not.toHaveBeenCalled()
    expect(out.pastTime).toBe(true)
    expect(out.id).not.toBeNull()
    expect(out.missing[0]).toContain('už proběhl')
  })

  it('dnešní termín, který teprve bude, proběhne sám', async () => {
    proposed(plan([{ ...MEETING, date: '2026-11-17', time: '16:00' }]))
    const out = await proposeSuggestion({ text: 'zapiš schůzku s Novákem dnes ve čtyři' })
    expect(out.ok && out.pastTime).toBe(false)
    expect(runSpy).toHaveBeenCalledTimes(1)
  })
})

describe('klepnutí', () => {
  it('provede přesně to, co leží v databázi', async () => {
    const id = await insert()
    const result = await applySuggestion(id)

    expect(result.ok).toBe(true)
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(runSpy.mock.calls[0][0]).toEqual(MEETING)
    expect((await loadSuggestion(id))?.status).toBe('applied')
  })

  it('jen jednu akci, když se klepne u ní', async () => {
    const id = await insert(plan([MEETING, INVOICE]))
    const result = await applySuggestion(id, 1)

    expect(result).toEqual({
      ok: true,
      steps: [expect.objectContaining({ index: 1 })],
      pending: [0],
      turn: expect.any(String),
    })
    expect(runSpy.mock.calls[0][0]).toEqual(INVOICE)
    expect((await loadSuggestion(id))?.status).toBe('pending')
  })

  it('pozměněný plán v databázi se neprovede', async () => {
    const id = await insert()
    await db.query(`UPDATE ai_suggestions SET proposal = $1::jsonb WHERE id = $2`, [
      JSON.stringify({ actions: [{ kind: 'run_sql', sql: 'DELETE FROM projects' }], reply: '', confidence: 1, assumptions: [], missing: [] }),
      id,
    ])
    expect(await applySuggestion(id)).toEqual({ ok: false, error: 'Plán už neplatí. Řekněte to prosím znovu.' })
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('pole mimo meze neprojde', async () => {
    const id = await insert()
    await db.query(`UPDATE ai_suggestions SET proposal = $1::jsonb WHERE id = $2`, [
      JSON.stringify(plan([{ ...MEETING, durationMinutes: 99999 } as Action])),
      id,
    ])
    expect((await applySuggestion(id)).ok).toBe(false)
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('dvojklik neudělá akci dvakrát', async () => {
    const id = await insert()
    const [first, second] = await Promise.all([applySuggestion(id), applySuggestion(id)])
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('identifikátor, který není UUID, skončí českou hláškou, ne pádem', async () => {
    for (const bogus of ['', 'abc', "1' OR '1'='1", '../../etc/passwd']) {
      expect(await applySuggestion(bogus)).toEqual({ ok: false, error: 'Plán už neplatí. Řekněte to prosím znovu.' })
    }
    expect(await rejectSuggestion('neni-uuid')).toEqual({ ok: false })
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('zahozený plán už nejde provést', async () => {
    const id = await insert()
    expect(await rejectSuggestion(id)).toEqual({ ok: true })
    expect(await applySuggestion(id)).toEqual({ ok: false, error: 'Tenhle plán už je vyřízený.' })
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('když akce selže, plán zůstane otevřený a jde to zkusit znovu', async () => {
    runSpy.mockResolvedValueOnce({ ok: false, error: 'Chybí den nebo čas termínu.' })
    const id = await insert()

    const first = await applySuggestion(id)
    expect(first).toMatchObject({ ok: true, pending: [0] })
    expect((await loadSuggestion(id))?.status).toBe('pending')

    const second = await applySuggestion(id)
    expect(second).toMatchObject({ ok: true, pending: [] })
    expect(runSpy).toHaveBeenCalledTimes(2)
  })
})

describe('zpět', () => {
  it('vrátí krok podle údajů z databáze a jen jednou', async () => {
    proposed(plan([MEETING]))
    const out = await proposeSuggestion({ text: 'schůzka' })
    if (!out.ok || !out.id) throw new Error('plán se neprovedl')

    const [first, second] = await Promise.all([undoSuggestion(out.id), undoSuggestion(out.id)])
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    expect(undoSpy).toHaveBeenCalledTimes(1)
    expect(undoSpy).toHaveBeenCalledWith(EVENT_UNDO)
    expect((await loadSuggestion(out.id))?.steps[0].undone).toBe(true)
  })

  it('když se vrátit nepovede, krok zůstane vratný a s hláškou', async () => {
    proposed(plan([MEETING]))
    const out = await proposeSuggestion({ text: 'schůzka' })
    if (!out.ok || !out.id) throw new Error('plán se neprovedl')
    undoSpy.mockResolvedValueOnce({ ok: false, error: 'Termín už v kalendáři není.' })

    expect(await undoSuggestion(out.id)).toEqual({ ok: false, error: 'Termín už v kalendáři není.' })
    const step = (await loadSuggestion(out.id))?.steps[0]
    expect(step?.undone).toBe(false)
    expect(step?.error).toBe('Termín už v kalendáři není.')
  })
})

describe('expirace', () => {
  it('nevyřízený plán po sedmi dnech propadne, čerstvý zůstane', async () => {
    const old = await insert()
    const fresh = await insert()
    await db.query(`UPDATE ai_suggestions SET created_at = now() - interval '8 days' WHERE id = $1`, [old])

    expect(await expireOldSuggestions()).toBe(1)
    expect((await loadSuggestion(old))?.status).toBe('expired')
    expect((await loadSuggestion(fresh))?.status).toBe('pending')
  })

  it('propadlý plán už nejde provést', async () => {
    const id = await insert()
    await db.query(`UPDATE ai_suggestions SET created_at = now() - interval '30 days' WHERE id = $1`, [id])
    await expireOldSuggestions()
    expect(await applySuggestion(id)).toEqual({ ok: false, error: 'Tenhle plán už je vyřízený.' })
  })
})

describe('schéma plánu', () => {
  it('přijme každý druh akce', () => {
    const ref = { id: null, hint: 'Novák' }
    const actions = [
      MEETING,
      INVOICE,
      { kind: 'create_contact', companyName: 'Firma', contactName: null, phone: null, email: null, note: null },
      { kind: 'move_event', event: { ...ref, date: null }, date: '2026-11-20', time: null, durationMinutes: null },
      { kind: 'cancel_event', event: { ...ref, date: '2026-11-19' } },
      { kind: 'create_project', clientName: 'Novák', clientEmail: null, clientPhone: null, serviceType: 'web', description: null, price: 30000, deadline: null },
      { kind: 'update_project_status', project: ref, status: 'done' },
      { kind: 'add_note', target: 'lead', ref, noteText: 'Volal.' },
      { kind: 'add_payment', paymentType: 'zaloha', project: ref, amount: 5000, date: null, note: null },
      { kind: 'add_cost', name: 'Hosting', amount: 300, costType: 'fixed_monthly', category: 'hosting', project: null, note: null },
      { kind: 'mark_invoice_paid', invoice: { id: null, hint: '2026014' }, paidOn: null },
      { kind: 'cancel_invoice', invoice: { id: null, hint: '2026014' } },
      { kind: 'send_message', channel: 'sms', ref, phone: '+420777123456', email: null, subject: null, body: 'Dobrý den.' },
    ]
    // Po jedné — v jednom plánu jich smí být nejvýš osm.
    for (const action of actions) {
      expect(suggestionSchema.safeParse(plan([action as Action])).success, action.kind).toBe(true)
    }
    expect(suggestionSchema.safeParse({ ...plan([]), reply: 'Na co se ptáte?' }).success).toBe(true)
  })

  it('neznámý druh akce odmítne', () => {
    const bad = { ...plan([]), actions: [{ kind: 'run_sql', sql: 'DELETE FROM projects' }] }
    expect(suggestionSchema.safeParse(bad).success).toBe(false)
  })

  it('neplatné datum a čas odmítne', () => {
    expect(suggestionSchema.safeParse(plan([{ ...MEETING, date: '19. 11. 2026', time: '14h' } as Action])).success).toBe(false)
  })

  it('víc než osm akcí odmítne', () => {
    expect(suggestionSchema.safeParse(plan(Array(9).fill(MEETING))).success).toBe(false)
  })
})
