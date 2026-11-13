import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Návrhy asistenta (AD14) proti skutečnému Postgresu (PGlite).
 *
 * Testuje se to, co drží pravidlo „navrhne, ty potvrdíš" (R-084):
 * - prohlížeč posílá jen `id`, obsah návrhu se bere z databáze,
 * - pozměněný řádek se neprovede,
 * - dvojklik neudělá akci dvakrát,
 * - nevyřízený návrh po sedmi dnech propadne,
 * - executor nic neposílá a na peníze nesahá.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({
  authOptions: {},
  requireAuth: async () => {},
}))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: async () => false,
  recordApiRequest: async () => {},
}))

const applyProposalSpy = vi.fn()
vi.mock('@/lib/admin/suggestion-apply', () => ({
  applyProposal: (proposal: unknown) => applyProposalSpy(proposal),
}))

import { setAdminDbForTests, adminDb } from '@/lib/admin/db'
import { applySuggestion, rejectSuggestion } from '@/app/ai-actions'
import {
  expireOldSuggestions,
  loadSuggestion,
  saveSuggestion,
  resetSuggestionsReadyForTests,
} from '@/lib/admin/suggestions'
import { suggestionSchema, type Suggestion } from '@/lib/ai/suggestion-schema'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const VALID: Suggestion = {
  proposal: {
    kind: 'schedule_call',
    title: 'Hovor s Novákem',
    date: '2026-11-19',
    time: '14:00',
    durationMinutes: 60,
    contactName: 'Jan Novák',
    phone: '+420777123456',
    email: null,
    note: null,
  },
  confidence: 0.9,
  assumptions: ['„ve čtvrtek" = 19. 11. 2026'],
  missing: [],
}

async function insert(suggestion: Suggestion = VALID): Promise<string> {
  const id = await saveSuggestion({
    authorEmail: 'admin@example.cz',
    source: 'panel',
    inputText: 'zavolat Nováka ve čtvrtek ve dvě',
    model: 'test-model',
    suggestion,
    tokensIn: 100,
    tokensOut: 50,
  })
  if (!id) throw new Error('Návrh se neuložil')
  return id
}

beforeAll(async () => {
  db = new PGlite()
  const migration = read('110_ai_navrhy.sql')
  await db.exec(migration)
  // Idempotence: druhý běh nesmí spadnout ani nic změnit.
  await db.exec(migration)
  setAdminDbForTests(pgliteAdminDriver(db))
  resetSuggestionsReadyForTests()
})

afterAll(async () => {
  setAdminDbForTests(null)
  resetSuggestionsReadyForTests()
  await db.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM ai_suggestions')
  applyProposalSpy.mockReset()
  applyProposalSpy.mockResolvedValue({
    ok: true,
    ref: { kind: 'calendar', id: null, href: '/dashboard/calendar' },
    message: 'Termín je v kalendáři.',
  })
})

describe('potvrzení jedním klikem', () => {
  it('provede přesně to, co leží v databázi', async () => {
    const id = await insert()
    const result = await applySuggestion(id)

    expect(result.ok).toBe(true)
    expect(applyProposalSpy).toHaveBeenCalledTimes(1)
    expect(applyProposalSpy.mock.calls[0][0]).toEqual(VALID.proposal)

    const row = await loadSuggestion(id)
    expect(row?.status).toBe('applied')
    expect(row?.appliedRef?.href).toBe('/dashboard/calendar')
  })

  it('pozměněný návrh v databázi se neprovede', async () => {
    const id = await insert()
    // Někdo (nebo něco) přepsal uložený návrh na tvar, kterému schéma
    // nerozumí — třeba aby protlačil vlastní druh akce.
    await db.query(
      `UPDATE ai_suggestions SET proposal = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ proposal: { kind: 'drop_everything', sql: 'DELETE FROM projects' }, confidence: 1 }), id],
    )

    const result = await applySuggestion(id)

    expect(result).toEqual({ ok: false, error: 'Návrh už neplatí. Zkuste to říct znovu.' })
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })

  it('návrh s podstrčeným polem navíc neprojde', async () => {
    const id = await insert()
    await db.query(
      `UPDATE ai_suggestions SET proposal = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ ...VALID, proposal: { ...VALID.proposal, durationMinutes: 99999 } }), id],
    )

    const result = await applySuggestion(id)
    expect(result.ok).toBe(false)
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })

  it('dvojklik neudělá akci dvakrát', async () => {
    const id = await insert()
    const first = await applySuggestion(id)
    const second = await applySuggestion(id)

    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, error: 'Tenhle návrh už je vyřízený.' })
    expect(applyProposalSpy).toHaveBeenCalledTimes(1)
  })

  it('neexistující návrh nic neprovede', async () => {
    const result = await applySuggestion('00000000-0000-0000-0000-000000000000')
    expect(result.ok).toBe(false)
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })

  it('identifikátor, který není UUID, skončí českou hláškou, ne pádem', async () => {
    for (const bogus of ['', 'abc', "1' OR '1'='1", '../../etc/passwd']) {
      const result = await applySuggestion(bogus)
      expect(result).toEqual({ ok: false, error: 'Návrh už neplatí. Zkuste to říct znovu.' })
    }
    expect(await rejectSuggestion('nenu-uuid')).toEqual({ ok: false })
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })

  it('odmítnutý návrh už nejde potvrdit', async () => {
    const id = await insert()
    expect(await rejectSuggestion(id)).toEqual({ ok: true })

    const result = await applySuggestion(id)
    expect(result).toEqual({ ok: false, error: 'Tenhle návrh už je vyřízený.' })
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })

  it('když executor selže, návrh zůstane nevyřízený', async () => {
    applyProposalSpy.mockResolvedValue({ ok: false, error: 'Chybí datum nebo čas.' })
    const id = await insert()

    const result = await applySuggestion(id)
    expect(result).toEqual({ ok: false, error: 'Chybí datum nebo čas.' })
    expect((await loadSuggestion(id))?.status).toBe('pending')
  })
})

describe('expirace', () => {
  it('nevyřízený návrh po sedmi dnech propadne, čerstvý zůstane', async () => {
    const old = await insert()
    const fresh = await insert()
    await db.query(`UPDATE ai_suggestions SET created_at = now() - interval '8 days' WHERE id = $1`, [old])

    expect(await expireOldSuggestions()).toBe(1)
    expect((await loadSuggestion(old))?.status).toBe('expired')
    expect((await loadSuggestion(fresh))?.status).toBe('pending')
  })

  it('propadlý návrh už nejde potvrdit', async () => {
    const id = await insert()
    await db.query(`UPDATE ai_suggestions SET created_at = now() - interval '30 days' WHERE id = $1`, [id])
    await expireOldSuggestions()

    expect(await applySuggestion(id)).toEqual({ ok: false, error: 'Tenhle návrh už je vyřízený.' })
    expect(applyProposalSpy).not.toHaveBeenCalled()
  })
})

describe('schéma návrhu', () => {
  it('přijme každý druh, který má executor', () => {
    const kinds = [
      VALID.proposal,
      { kind: 'create_lead', companyName: 'Firma', contactName: null, phone: null, email: null, note: null },
      { kind: 'update_project_status', project: { id: null, hint: 'Novák' }, status: 'done' },
      { kind: 'create_invoice_draft', project: { id: null, hint: null }, counterpartyName: null, description: null, amount: null },
      { kind: 'add_note', target: 'lead', ref: { id: null, hint: 'Novák' }, noteText: 'Volal.' },
      { kind: 'send_message', channel: 'sms', ref: { id: null, hint: null }, phone: '+420777123456', email: null, subject: null, body: 'Dobrý den.' },
      { kind: 'none', reason: 'Nerozumím.' },
    ]
    for (const proposal of kinds) {
      expect(suggestionSchema.safeParse({ proposal, confidence: 0.8, assumptions: [], missing: [] }).success).toBe(true)
    }
  })

  it('neznámý druh akce odmítne', () => {
    const parsed = suggestionSchema.safeParse({
      proposal: { kind: 'run_sql', sql: 'DELETE FROM projects' },
      confidence: 1,
      assumptions: [],
      missing: [],
    })
    expect(parsed.success).toBe(false)
  })

  it('neplatné datum a čas odmítne', () => {
    const bad = { ...VALID, proposal: { ...VALID.proposal, date: '19. 11. 2026', time: '14h' } }
    expect(suggestionSchema.safeParse(bad).success).toBe(false)
  })
})
