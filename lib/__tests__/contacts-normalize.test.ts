import { describe, expect, it } from 'vitest'
import { E164, nameKey, normalizeDic, normalizeEmail, normalizeIco, normalizePhone } from '@/lib/contacts/normalize'
import { groupContacts, type SourceRow } from '@/lib/contacts/group'

// Normalizace a shoda kontaktů (AD09). Zápisy níž jsou ty, které se v datech
// opravdu objevují — ne vymyšlené.

describe('normalizePhone', () => {
  it('srovná běžné české zápisy na jeden tvar', () => {
    for (const raw of [
      '+420777123456',
      '+420 777 123 456',
      '+420 777-123-456',
      '777 123 456',
      '777123456',
      '0777123456',
      '00420777123456',
      '00420 777 123 456',
      '420777123456',
      '0042 777 123 456',
      ' +420 777 123 456 ',
      '(+420) 777 123 456',
    ]) {
      expect(normalizePhone(raw), raw).toBe('+420777123456')
    }
  })

  it('odřízne klapku, ne číslo', () => {
    expect(normalizePhone('+420 777 123 456 klapka 12')).toBe('+420777123456')
    expect(normalizePhone('777123456 kl. 3')).toBe('+420777123456')
    expect(normalizePhone('777 123 456 linka 205')).toBe('+420777123456')
    expect(normalizePhone('+420777123456x12')).toBe('+420777123456')
    expect(normalizePhone('+420 777 123 456, 777 654 321')).toBe('+420777123456')
  })

  it('cizí čísla nechá, jak jsou', () => {
    expect(normalizePhone('+421 905 123 456')).toBe('+421905123456')
    expect(normalizePhone('+49 171 1234567')).toBe('+491711234567')
    expect(normalizePhone('0042 1 905 123 456')).toBe('+421905123456')
  })

  it('co není telefon, vrátí null', () => {
    for (const raw of [null, undefined, '', '   ', 'zavolám sám', '123', '12345', 'info@example.cz']) {
      expect(normalizePhone(raw), String(raw)).toBeNull()
    }
  })

  it('výsledek vždy projde stejným CHECKem jako databáze', () => {
    for (const raw of ['777123456', '+420 777 123 456', '+49 171 1234567']) {
      expect(E164.test(normalizePhone(raw) as string)).toBe(true)
    }
  })
})

describe('normalizeEmail', () => {
  it('trim a malá písmena', () => {
    expect(normalizeEmail('  Jan.Novak@Example.CZ ')).toBe('jan.novak@example.cz')
    expect(normalizeEmail('<jan@example.cz>')).toBe('jan@example.cz')
    expect(normalizeEmail('mailto:jan@example.cz')).toBe('jan@example.cz')
  })

  it('co není e-mail, vrátí null', () => {
    for (const raw of [null, '', 'Jan Novák', 'jan@example', 'jan example.cz', 'a@b,c@d.cz']) {
      expect(normalizeEmail(raw), String(raw)).toBeNull()
    }
  })
})

describe('nameKey', () => {
  it('srovná diakritiku, velikost písmen, tituly a interpunkci', () => {
    expect(nameKey('Jan Novák')).toBe('jan novak')
    expect(nameKey('  JAN   NOVAK ')).toBe('jan novak')
    expect(nameKey('Ing. Jan Novák')).toBe('jan novak')
    expect(nameKey('Novák, Jan')).toBe('novak jan')
    expect(nameKey(null)).toBe('')
  })
})

describe('IČO a DIČ', () => {
  it('IČO je osmimístné, DIČ bez mezer velkými', () => {
    expect(normalizeIco(' 123 456 ')).toBe('00123456')
    expect(normalizeIco('29977231')).toBe('29977231')
    expect(normalizeIco('nevím')).toBeNull()
    expect(normalizeDic('cz 299 772 31')).toBe('CZ29977231')
    expect(normalizeDic('')).toBeNull()
  })
})

const row = (over: Partial<SourceRow> & { id: string }): SourceRow => ({
  table: 'client_leads',
  name: null,
  company: null,
  email: null,
  phone: null,
  seenAt: '2026-11-01',
  ...over,
})

describe('groupContacts', () => {
  it('dva leady se stejným telefonem v jiném zápisu dají jeden kontakt', () => {
    const { contacts, conflicts } = groupContacts([
      row({ id: 'a', name: 'Jan Novák', phone: '+420 777 123 456' }),
      row({ id: 'b', name: 'Jan Novak', phone: '0777123456', email: 'jan@example.cz' }),
    ])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].phone).toBe('+420777123456')
    expect(contacts[0].email).toBe('jan@example.cz')
    expect(contacts[0].rows.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(contacts[0].nameVariants).toEqual([])
    expect(conflicts).toHaveLength(0)
  })

  it('kontakt jen s e-mailem se seskupí podle e-mailu', () => {
    const { contacts } = groupContacts([
      row({ id: 'a', name: 'Eva Dvořáková', email: 'EVA@example.cz' }),
      row({ id: 'b', table: 'projects', name: 'Eva D.', email: 'eva@example.cz' }),
    ])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].email).toBe('eva@example.cz')
    expect(contacts[0].phone).toBeNull()
    expect(contacts[0].nameVariants).toEqual(['Eva D.'])
  })

  it('dokončená zakázka bez telefonu se napojí na kontakt podle e-mailu', () => {
    const { contacts } = groupContacts([
      row({ id: 'a', name: 'Eva Demo', phone: '777123456', email: 'eva@example.cz' }),
      row({ id: 'b', table: 'completed_projects', name: 'Eva Demo', email: 'eva@example.cz' }),
    ])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].rows.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('firemní e-mail u dvou telefonů nikomu nepřipíše', () => {
    const { contacts, conflicts, unassigned } = groupContacts([
      row({ id: 'a', name: 'Jan', phone: '777111222', email: 'info@firma.cz' }),
      row({ id: 'b', name: 'Petr', phone: '777333444', email: 'info@firma.cz' }),
      row({ id: 'c', name: 'Kdosi z firmy', email: 'info@firma.cz' }),
    ])
    expect(contacts).toHaveLength(2)
    expect(contacts.every((c) => c.email === null)).toBe(true)
    expect(unassigned.map((r) => r.id)).toEqual(['c'])
    expect(conflicts.map((c) => c.kind)).toContain('email-u-vic-telefonu')
  })

  it('dva různé e-maily u jednoho telefonu nechá kontakt bez e-mailu a nahlásí to', () => {
    const { contacts, conflicts } = groupContacts([
      row({ id: 'a', name: 'Jan Novák', phone: '777123456', email: 'jan@example.cz' }),
      row({ id: 'b', name: 'Jan Novák', phone: '777123456', email: 'novak@example.cz' }),
    ])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].email).toBeNull()
    expect(contacts[0].emailVariants.sort()).toEqual(['jan@example.cz', 'novak@example.cz'])
    expect(conflicts.map((c) => c.kind)).toContain('vic-emailu-u-telefonu')
  })

  it('řádek bez telefonu a e-mailu zůstane nepřiřazený', () => {
    const { contacts, unassigned, conflicts } = groupContacts([row({ id: 'a', name: 'Někdo' })])
    expect(contacts).toHaveLength(0)
    expect(unassigned.map((r) => r.id)).toEqual(['a'])
    expect(conflicts.map((c) => c.kind)).toContain('bez-udaju')
  })

  it('řádek, který kontakt už má, se znovu nepřiřazuje', () => {
    const { contacts } = groupContacts([
      row({ id: 'a', name: 'Jan', phone: '777123456', contactId: '11111111-1111-1111-1111-111111111111' }),
      row({ id: 'b', name: 'Jan', phone: '777123456' }),
    ])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].rows.map((r) => r.id)).toEqual(['b'])
  })

  it('jméno kontaktu je to nejčastější, firma se dohledá', () => {
    const { contacts } = groupContacts([
      row({ id: 'a', name: 'Jan Novák', company: 'Novák s.r.o.', phone: '777123456' }),
      row({ id: 'b', name: 'Jan Novák', phone: '777123456' }),
      row({ id: 'c', name: 'J. N.', phone: '777123456', seenAt: '2026-11-10' }),
    ])
    expect(contacts[0].displayName).toBe('Jan Novák')
    expect(contacts[0].company).toBe('Novák s.r.o.')
    expect(contacts[0].lastSeenAt).toBe('2026-11-10')
    expect(contacts[0].nameVariants).toEqual(['J. N.'])
  })

  it('kontakt bez jména dostane aspoň telefon, ať je k nalezení', () => {
    const { contacts } = groupContacts([row({ id: 'a', phone: '777123456' })])
    expect(contacts[0].displayName).toBe('+420777123456')
  })
})
