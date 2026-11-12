import { describe, expect, it } from 'vitest'
import { optimisticReducer, type OptimisticChange } from '@/components/LeadsTable'
import type { LeadNote } from '@/lib/types'

/**
 * AD08: akce na jedno kliknutí v Hovorech se ukážou hned (`useOptimistic`).
 *
 * Reducer je čistá funkce, takže se dá ověřit bez prohlížeče. Vrácení při
 * chybě netestuje — to dělá React sám: jak transition skončí, optimistická
 * hodnota se zahodí a zůstane `leads`.
 */

type Lead = Parameters<typeof optimisticReducer>[0][number]

const lead = (id: string, answered: boolean | null = null): Lead => ({
  id,
  company_name: 'Firma ' + id,
  contact_name: null,
  phone: null,
  email: null,
  lead_status: 'cold',
  next_action: null,
  next_action_date: null,
  next_action_time: null,
  next_action_type: null,
  notes: null,
  estimated_value: null,
  call_answered: answered,
  reminder_day_before_sent: false,
  reminder_2h_before_sent: false,
  portfolio_sent_at: null,
  calendar_event_id: null,
  created_at: new Date('2026-11-01'),
  updated_at: null,
  note_preview: [] as LeadNote[],
  notes_count: 0,
}) as Lead

const list = [lead('a'), lead('b', true), lead('c')]

const apply = (changes: OptimisticChange[]) => changes.reduce(optimisticReducer, list)

describe('optimistické akce v Hovorech', () => {
  it('přesun do čekání a smazání řádek hned odeberou', () => {
    expect(apply([{ type: 'remove', id: 'b' }]).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('dovoláno / nedovoláno / neurčeno se přepne hned', () => {
    expect(apply([{ type: 'answered', id: 'a', value: true }])[0].call_answered).toBe(true)
    expect(apply([{ type: 'answered', id: 'b', value: false }])[1].call_answered).toBe(false)
    expect(apply([{ type: 'answered', id: 'b', value: null }])[1].call_answered).toBe(null)
  })

  it('nic jiného se nemění a původní seznam zůstává nedotčený', () => {
    const next = apply([{ type: 'answered', id: 'a', value: true }])
    expect(next[1]).toBe(list[1])
    expect(next[2]).toBe(list[2])
    expect(list[0].call_answered).toBe(null)
  })

  it('změna neznámého řádku seznam nerozbije', () => {
    expect(apply([{ type: 'remove', id: 'neexistuje' }]).map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(apply([{ type: 'answered', id: 'neexistuje', value: true }])).toHaveLength(3)
  })

  it('dvě kliknutí za sebou se skládají', () => {
    const next = apply([
      { type: 'answered', id: 'a', value: false },
      { type: 'remove', id: 'c' },
    ])
    expect(next.map((l) => l.id)).toEqual(['a', 'b'])
    expect(next[0].call_answered).toBe(false)
  })
})
