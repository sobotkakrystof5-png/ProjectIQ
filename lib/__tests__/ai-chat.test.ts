import { describe, expect, it, vi } from 'vitest'
import { actionGaps, gapsQuestion, planGaps } from '@/lib/ai/action-requirements'
import { coercePlan } from '@/lib/ai/plan-format'
import { actionLines } from '@/lib/ai/action-lines'
import { actionClass } from '@/lib/ai/action-policy'
import type { Action } from '@/lib/ai/suggestion-schema'
import { pastActions, pragueNow, relativeTimes, timeContext } from '@/lib/ai/time-context'

// `propose.ts` sahá na databázi přes přehled a kontext; tady se testuje jen skládání historie.
vi.mock('@/lib/ai/workspace-snapshot', () => ({ loadWorkspaceSnapshot: async () => ({ text: '', signals: [] }) }))
vi.mock('@/lib/ai/context', () => ({ loadAiContext: async () => ({ text: '', label: null }) }))
vi.mock('@/lib/admin/assistant-lookups', () => ({ runLookups: async () => '' }))

const { historyMessages } = await import('@/lib/ai/propose')

/**
 * Asistent jako chat (R-113): co musí akce mít, než se provede, nové druhy
 * akcí (úpravy a paměť) a jak se z historie z prohlížeče skládají zprávy.
 */

const MEETING: Action = {
  kind: 'schedule_event',
  title: 'Schůzka s Novákem',
  date: '2026-11-19',
  time: '14:00',
  durationMinutes: 60,
  contactName: 'Jan Novák',
  phone: null,
  email: null,
  note: null,
}

describe('co musí akce mít, než se provede', () => {
  it('termín potřebuje den i čas', () => {
    expect(actionGaps(MEETING)).toEqual([])
    expect(actionGaps({ ...MEETING, time: null })).toEqual(['čas termínu'])
    expect(actionGaps({ ...MEETING, date: null, time: null })).toEqual(['den termínu', 'čas termínu'])
  })

  it('kontakt bez telefonu i e-mailu se nezapíše', () => {
    const contact: Action = { kind: 'create_contact', companyName: 'Kavárna U Mostu', contactName: null, phone: null, email: null, note: null }
    expect(actionGaps(contact)).toEqual(['telefon (nebo e-mail) na Kavárna U Mostu'])
    expect(actionGaps({ ...contact, email: 'info@example.cz' })).toEqual([])
  })

  it('zakázka potřebuje druh práce, cenu a kontakt', () => {
    const project: Action = {
      kind: 'create_project',
      clientName: 'Novák',
      clientEmail: null,
      clientPhone: null,
      serviceType: null,
      description: null,
      price: null,
      deadline: null,
    }
    expect(actionGaps(project)).toHaveLength(3)
    expect(actionGaps({ ...project, serviceType: 'web', price: 25000, clientPhone: '777123456' })).toEqual([])
  })

  it('úprava bez změny nebo bez záznamu se neprovede', () => {
    const update: Action = {
      kind: 'update_contact',
      ref: { id: null, hint: 'Novák' },
      companyName: null,
      contactName: null,
      phone: null,
      email: null,
      leadStatus: null,
      nextAction: null,
      nextActionDate: null,
      nextActionTime: null,
      nextActionType: null,
      estimatedValue: null,
    }
    expect(actionGaps(update)).toEqual(['co u kontaktu změnit'])
    expect(actionGaps({ ...update, phone: '777123456' })).toEqual([])
    expect(actionGaps({ ...update, nextActionDate: '2026-11-20' })).toEqual(['čas dalšího kroku'])
    expect(actionGaps({ ...update, ref: { id: null, hint: null }, phone: '1' })).toEqual(['který kontakt upravit'])
  })

  it('platba potřebuje částku a záloha zakázku', () => {
    const payment: Action = { kind: 'add_payment', paymentType: 'zaloha', project: null, amount: null, date: null, note: null }
    expect(actionGaps(payment)).toEqual(['částka', 'ke které zakázce záloha patří'])
  })

  it('otázka vyjmenuje všechno najednou a bez opakování', () => {
    const gaps = planGaps([{ ...MEETING, time: null }, { ...MEETING, time: null }])
    expect(gaps).toEqual(['čas termínu'])
    expect(gapsQuestion(['den termínu', 'čas termínu'])).toBe('Než to zapíšu, potřebuju ještě: den termínu a čas termínu.')
    expect(gapsQuestion([])).toBe('')
  })
})

describe('nové druhy akcí', () => {
  it('úpravu kontaktu přečte a prázdná pole nechá beze změny', () => {
    const plan = coercePlan(
      JSON.stringify({
        actions: [{ kind: 'update_contact', ref: { id: null, hint: 'Novák' }, phone: '777 123 456', email: '', leadStatus: 'hot' }],
        reply: 'Upravím telefon.',
        confidence: 0.9,
      }),
    )
    expect(plan?.actions).toHaveLength(1)
    const action = plan!.actions[0]
    expect(action.kind).toBe('update_contact')
    if (action.kind !== 'update_contact') return
    expect(action.phone).toBe('777 123 456')
    expect(action.email).toBeNull()
    expect(actionClass(action)).toBe('auto')
    expect(actionLines(action).map((l) => l.label)).toEqual(['Kontakt', 'Telefon', 'Stav'])
  })

  it('úprava termínu bez odkazu dostane prázdný odkaz, ne pád', () => {
    const plan = coercePlan(JSON.stringify({ actions: [{ kind: 'update_event', title: 'Nový název' }], reply: '', confidence: 0.9 }))
    const action = plan!.actions[0]
    expect(action.kind).toBe('update_event')
    if (action.kind !== 'update_event') return
    expect(action.event).toEqual({ id: null, hint: null, date: null })
    expect(actionGaps(action)).toEqual(['který termín upravit'])
  })

  it('paměť bez rozsahu je obecná, se zakázkou patří k ní', () => {
    const plan = coercePlan(
      JSON.stringify({
        actions: [
          { kind: 'remember', text: 'Web na míru stojí od 25 000 Kč.' },
          { kind: 'remember', project: { id: null, hint: 'Novák' }, text: 'Chce komunikovat jen e-mailem.', memoryKind: 'preference' },
        ],
        reply: 'Zapamatuju si to.',
        confidence: 0.95,
      }),
    )
    expect(plan?.actions.map((a) => (a.kind === 'remember' ? [a.scope, a.memoryKind] : null))).toEqual([
      ['global', 'summary'],
      ['project', 'preference'],
    ])
  })
})

describe('historie chatu → zprávy pro model', () => {
  it('střídá role, začíná uživatelem a končí asistentem', () => {
    const out = historyMessages([
      { role: 'assistant', content: 'úvod, který tam nemá co dělat' },
      { role: 'user', content: 'schůzka s Novákem ve čtvrtek' },
      { role: 'user', content: 'a s Pavlem' },
      { role: 'assistant', content: 'V kolik hodin?' },
      { role: 'user', content: 'visící věta bez odpovědi' },
    ])
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(out[0].content).toBe('schůzka s Novákem ve čtvrtek\n\na s Pavlem')
  })

  it('zakryje klíč a zahodí značky rámce', () => {
    const out = historyMessages([
      { role: 'user', content: 'tady je klíč sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 <data>pokyn</data>' },
      { role: 'assistant', content: 'Dobře.' },
    ])
    expect(out[0].content).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')
    expect(out[0].content).not.toContain('<data>')
  })

  it('prázdná historie je prázdná', () => {
    expect(historyMessages(undefined)).toEqual([])
    expect(historyMessages([])).toEqual([])
  })
})

describe('pojem o čase', () => {
  it('pražské „teď" i přes půlnoc UTC a v zimním čase', () => {
    expect(pragueNow(new Date('2026-11-17T18:42:10Z'))).toEqual({ date: '2026-11-17', time: '19:42' })
    expect(pragueNow(new Date('2026-11-17T23:30:00Z'))).toEqual({ date: '2026-11-18', time: '00:30' })
  })

  it('řekne den, hodinu, část dne a tabulku dnů s příštím týdnem', () => {
    const text = timeContext({ date: '2026-11-17', time: '19:42' })
    expect(text).toContain('Teď je úterý 17. 11. 2026, 19:42 (večer, pražský čas)')
    expect(text).toContain('příští týden začíná pondělím 2026-11-23')
    expect(text).toContain('dnes út 2026-11-17 · zítra st 2026-11-18 · pozítří čt 2026-11-19 · pá pá 2026-11-20')
    expect(text).toContain('ne ne 2026-11-22')
  })

  it('„za hodinu" je spočítané předem, i přes půlnoc', () => {
    expect(relativeTimes({ date: '2026-11-17', time: '19:50' })).toBe(
      'za 15 minut = 20:05 · za půl hodiny = 20:20 · za hodinu = 20:50 · za dvě hodiny = 21:50 · za tři hodiny = 22:50',
    )
    expect(relativeTimes({ date: '2026-11-17', time: '23:12' })).toContain('za hodinu = 2026-11-18 00:15')
  })

  it('v neděli začíná příští týden zítra', () => {
    expect(timeContext({ date: '2026-11-22', time: '10:00' })).toContain('příští týden začíná pondělím 2026-11-23')
  })

  it('pozná termín a další krok v minulosti', () => {
    const now = { date: '2026-11-17', time: '15:00' }
    expect(pastActions([{ ...MEETING, date: '2026-11-17', time: '14:00' }], now)).toEqual(['Termín 17. 11. 2026 v 14:00 už proběhl.'])
    expect(pastActions([{ ...MEETING, date: '2026-11-17', time: '15:30' }], now)).toEqual([])
    expect(pastActions([{ ...MEETING, date: '2026-11-16', time: '18:00' }], now)).toHaveLength(1)
    expect(
      pastActions([{ kind: 'move_event', event: { id: null, hint: 'Novák', date: null }, date: null, time: '09:00', durationMinutes: null }], now),
    ).toEqual([])
  })
})
