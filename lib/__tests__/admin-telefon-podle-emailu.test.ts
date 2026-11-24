import { afterEach, describe, expect, it } from 'vitest'
import { setAdminDbForTests, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { findPhoneByEmail, pickPhone } from '@/lib/admin/contact-phone'

/**
 * Telefon podle e-mailu v okně schůzky: bez telefonu nejdou SMS připomínky
 * (R-137). Pořadí zdrojů odpovídá propisování údajů z R-141.
 */

afterEach(() => setAdminDbForTests(null))

/** Podstrčená databáze: řádky podle tabulky, ze které dotaz čte. */
function fakeDb(byTable: Record<string, AdminRow[]>, missing: string[] = []) {
  const seen: AdminQuery[] = []
  const rowsFor = (query: AdminQuery): AdminRow[] => {
    const table = /FROM\s+(\w+)/.exec(query.text)?.[1] ?? ''
    if (missing.includes(table)) throw Object.assign(new Error(`relation "${table}" does not exist`), { code: '42P01' })
    return byTable[table] ?? []
  }
  setAdminDbForTests({
    async transaction(queries) {
      seen.push(...queries)
      return queries.map(rowsFor)
    },
  })
  return seen
}

describe('pickPhone', () => {
  it('vezme číslo z nejdůvěryhodnějšího zdroje a převede ho na +420', () => {
    const found = pickPhone([
      { source: 'contacts', phones: [] },
      { source: 'calls', phones: ['777 123 456'] },
      { source: 'outreach', phones: ['+420777123456'] },
    ])
    expect(found).toEqual({ phone: '+420777123456', source: 'calls', ambiguous: false })
  })

  it('upozorní, když je u téhož e-mailu jiné číslo', () => {
    const found = pickPhone([
      { source: 'contacts', phones: ['+420777123456'] },
      { source: 'outreach', phones: ['+420608000111'] },
    ])
    expect(found).toEqual({ phone: '+420777123456', source: 'contacts', ambiguous: true })
  })

  it('přeskočí, co telefon není, a bez čísla vrátí null', () => {
    expect(pickPhone([{ source: 'contacts', phones: ['nevím', null, 12] }])).toBeNull()
    expect(pickPhone([{ source: 'contacts', phones: ['nevím', '00420 777 123 456'] }])?.phone).toBe('+420777123456')
  })
})

describe('findPhoneByEmail', () => {
  it('neplatný e-mail do databáze vůbec nejde', async () => {
    const seen = fakeDb({})
    expect(await findPhoneByEmail('Jan Novák')).toBeNull()
    expect(seen).toHaveLength(0)
  })

  it('hledá e-mail malými písmeny a dá přednost kontaktu', async () => {
    const seen = fakeDb({
      contacts: [{ phone: '+420777123456' }],
      outreach_leads: [{ phone: '+420608000111' }],
    })
    const found = await findPhoneByEmail('  Klient@Firma.CZ ')
    expect(found).toEqual({ phone: '+420777123456', source: 'contacts', ambiguous: true })
    expect(seen.every((query) => query.params.includes('klient@firma.cz'))).toBe(true)
  })

  it('číslo od AI asistenta stačí, když jinde není', async () => {
    fakeDb({ outreach_leads: [{ phone: '+420608000111' }] })
    expect(await findPhoneByEmail('klient@firma.cz')).toEqual({
      phone: '+420608000111',
      source: 'outreach',
      ambiguous: false,
    })
  })

  it('chybějící tabulka dohledání neshodí', async () => {
    fakeDb({ client_leads: [{ phone: '777123456' }] }, ['outreach_leads', 'agent_leads'])
    expect(await findPhoneByEmail('klient@firma.cz')).toEqual({
      phone: '+420777123456',
      source: 'calls',
      ambiguous: false,
    })
  })
})
