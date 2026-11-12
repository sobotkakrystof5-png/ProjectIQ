import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import {
  ensureContact,
  findContact,
  loadContactDetail,
  loadContactsScreen,
  mergeContact,
  saveContactFields,
  unmergeContact,
} from '@/lib/admin/contacts'
import { parseTableParams } from '@/lib/admin-table'
import { CONTACT_SORT } from '@/lib/admin/contacts'
import { pgliteAdminDriver } from './helpers/admin-pglite'

// Migrace 104 a sloučení kontaktů (AD09) proti skutečnému Postgresu (PGlite).
//
// Tabulky jsou postavené tak, jak je nechaly migrace 001–103 — jen sloupce,
// kterých se kontakty týkají. Testuje se, co migrace slibuje: duplicitu
// nepustí, sloučení nic nemaže a „Zpět" je jedna hodnota.

const ROOT = path.resolve(__dirname, '../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/104_kontakty.sql'), 'utf8')

let db: PGlite

const params = parseTableParams(undefined, { allowed: CONTACT_SORT, defaultSort: 'jmeno', pageSize: 50, tiebreak: 'c.created_at' })

async function contactId(name: string): Promise<string> {
  const res = await db.query<{ id: string }>(`SELECT id::text AS id FROM contacts WHERE display_name = $1`, [name])
  return res.rows[0].id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text,
      client_phone text,
      description text,
      status text NOT NULL DEFAULT 'new',
      progress integer DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text,
      phone text,
      email text,
      lead_status text DEFAULT 'cold',
      notes text,
      estimated_value numeric,
      calendar_event_id uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE completed_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      client_name text,
      company text,
      completed_at date NOT NULL DEFAULT current_date
    );
    CREATE TABLE consultation_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      scheduled_at timestamptz NOT NULL,
      channel text,
      client_email text
    );
    CREATE TABLE agent_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id text NOT NULL,
      client_name text NOT NULL,
      client_email text NOT NULL,
      client_phone text,
      client_company text,
      client_service text NOT NULL DEFAULT 'Web',
      received_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(() => {
  setAdminDbForTests(null)
})

describe('migrace 104 — tabulka contacts', () => {
  it('jde pustit dvakrát po sobě (idempotentní)', async () => {
    await db.exec(MIGRATION)
    await db.exec(MIGRATION)
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM contacts`)
    expect(res.rows[0].n).toBe(0)
  })

  it('telefon mimo E.164 databáze nepustí', async () => {
    await expect(
      db.query(`INSERT INTO contacts (display_name, phone) VALUES ('Špatný telefon', '777123456')`),
    ).rejects.toThrow()
  })

  it('dva nesloučené kontakty nemůžou mít stejný telefon ani e-mail', async () => {
    await db.query(`INSERT INTO contacts (display_name, phone, email) VALUES ('Jan Novák', '+420777123456', 'jan@example.cz')`)
    await expect(
      db.query(`INSERT INTO contacts (display_name, phone) VALUES ('Jan N.', '+420777123456')`),
    ).rejects.toThrow()
    await expect(
      db.query(`INSERT INTO contacts (display_name, email) VALUES ('Jan N.', 'JAN@example.cz')`),
    ).rejects.toThrow()
  })

  it('sloučený kontakt svůj telefon uvolní', async () => {
    const jan = await contactId('Jan Novák')
    await db.query(`INSERT INTO contacts (id, display_name, merged_into) VALUES (gen_random_uuid(), 'Starý zápis', $1)`, [jan])
    // Telefon sloučeného kontaktu už nikomu nestojí v cestě.
    await db.query(`UPDATE contacts SET phone = '+420777123456' WHERE display_name = 'Starý zápis' AND merged_into IS NOT NULL`)
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM contacts WHERE phone = '+420777123456'`)
    expect(res.rows[0].n).toBe(2)
  })
})

describe('snímek zakázky', () => {
  it('napojený kontakt doplní jméno, které v zakázce chybí', async () => {
    const jan = await contactId('Jan Novák')
    await db.query(`INSERT INTO projects (client_name, contact_id) VALUES ('', $1)`, [jan])
    const res = await db.query<{ client_name: string; client_email: string | null }>(
      `SELECT client_name, client_email FROM projects WHERE contact_id = $1`,
      [jan],
    )
    expect(res.rows[0].client_name).toBe('Jan Novák')
    expect(res.rows[0].client_email).toBe('jan@example.cz')
  })

  it('vyplněný text zakázky kontakt nepřepíše', async () => {
    const jan = await contactId('Jan Novák')
    await db.query(`INSERT INTO projects (client_name, description, contact_id) VALUES ('Novák s.r.o.', 'firemní zápis', $1)`, [jan])
    const res = await db.query<{ client_name: string }>(
      `SELECT client_name FROM projects WHERE description = 'firemní zápis'`,
    )
    expect(res.rows[0].client_name).toBe('Novák s.r.o.')
  })

  it('přejmenování kontaktu propadne jen tam, kde zakázka nesla jeho text, a nehýbe updated_at', async () => {
    const jan = await contactId('Jan Novák')
    const before = await db.query<{ updated_at: string }>(
      `SELECT updated_at::text FROM projects WHERE contact_id = $1 AND client_name = 'Jan Novák'`,
      [jan],
    )
    await db.query(`UPDATE contacts SET display_name = 'Jan Novák ml.' WHERE id = $1`, [jan])
    const after = await db.query<{ client_name: string; updated_at: string }>(
      `SELECT client_name, updated_at::text FROM projects WHERE contact_id = $1 ORDER BY client_name`,
      [jan],
    )
    const names = after.rows.map((r) => r.client_name)
    expect(names).toContain('Jan Novák ml.')
    expect(names).toContain('Novák s.r.o.')
    const moved = after.rows.find((r) => r.client_name === 'Jan Novák ml.')
    expect(moved?.updated_at).toBe(before.rows[0].updated_at)
    await db.query(`UPDATE contacts SET display_name = 'Jan Novák' WHERE id = $1`, [jan])
  })
})

describe('sloučení a Zpět', () => {
  it('sloučí dva kontakty a čtení vede na cíl', async () => {
    await db.query(`INSERT INTO contacts (display_name, phone) VALUES ('Jan Novak', '+420777999888')`)
    const jan = await contactId('Jan Novák')
    const dup = await contactId('Jan Novak')
    await db.query(`INSERT INTO client_leads (company_name, contact_name, contact_id) VALUES ('Novák', 'Jan Novak', $1)`, [dup])

    const merged = await mergeContact(dup, jan)
    expect(merged).toEqual({ ok: true, target: jan })

    // Hovor pořád ukazuje na sloučený kontakt, čtení ho ale vede na cíl.
    expect(await findContact('+420777999888', null)).toBe(jan)

    const detail = await loadContactDetail(jan)
    expect(detail?.merged.map((m) => m.display_name)).toContain('Jan Novak')
    // Hovor sloučeného kontaktu se počítá k cíli (rodina kontaktu).
    expect(detail?.contact.hovory).toBe(1)
    expect(detail?.occurrences.some((o) => o.kind === 'hovor')).toBe(true)
  })

  it('sloučený kontakt není v seznamu, ale je v záložce Sloučené', async () => {
    const aktivni = await loadContactsScreen('aktivni', null, params)
    expect(aktivni.rows.map((r) => r.display_name)).not.toContain('Jan Novak')
    const sloucene = await loadContactsScreen('sloucene', null, params)
    expect(sloucene.rows.map((r) => r.display_name)).toContain('Jan Novak')
    expect(sloucene.rows[0].merged_into_name).toBe('Jan Novák')
  })

  it('Zpět sloučení zruší a nic se při tom neztratí', async () => {
    const dup = await contactId('Jan Novak')
    const undone = await unmergeContact(dup)
    expect(undone.ok).toBe(true)

    const row = await db.query<{ merged_into: string | null; phone: string }>(
      `SELECT merged_into::text, phone FROM contacts WHERE id = $1`,
      [dup],
    )
    expect(row.rows[0].merged_into).toBeNull()
    expect(row.rows[0].phone).toBe('+420777999888')
    const leads = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM client_leads WHERE contact_id = $1`, [dup])
    expect(leads.rows[0].n).toBe(1)
  })

  it('sám se sebou ani do neexistujícího kontaktu se sloučit nedá', async () => {
    const jan = await contactId('Jan Novák')
    expect(await mergeContact(jan, jan)).toEqual({ ok: false, error: 'Kontakt nejde sloučit sám se sebou.' })
    const chybi = await mergeContact(jan, '00000000-0000-0000-0000-000000000000')
    expect(chybi.ok).toBe(false)
    const row = await db.query<{ merged_into: string | null }>(`SELECT merged_into::text FROM contacts WHERE id = $1`, [jan])
    expect(row.rows[0].merged_into).toBeNull()
  })

  it('řetěz sloučení zůstává plochý', async () => {
    await db.query(`INSERT INTO contacts (display_name, phone) VALUES ('Trojka', '+420777111222')`)
    const jan = await contactId('Jan Novák')
    const dup = await contactId('Jan Novak')
    const trojka = await contactId('Trojka')
    await mergeContact(dup, jan)
    await mergeContact(trojka, dup) // do už sloučeného → skončí u kořene
    const row = await db.query<{ merged_into: string | null }>(`SELECT merged_into::text FROM contacts WHERE id = $1`, [trojka])
    expect(row.rows[0].merged_into).toBe(jan)
    await unmergeContact(trojka)
    await unmergeContact(dup)
  })
})

describe('kontakt z údajů', () => {
  it('stejný telefon jinak zapsaný najde jeden kontakt', async () => {
    const first = await ensureContact({ name: 'Petr Malý', phone: '+420 606 123 456', source: 'lead' })
    const second = await ensureContact({ name: 'P. Malý', phone: '0606123456', source: 'lead' })
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    const stored = await db.query<{ n: number; phone: string }>(
      `SELECT count(*)::int AS n, min(phone) AS phone FROM contacts WHERE regexp_replace(phone, '\\D', '', 'g') LIKE '%606123456'`,
    )
    expect(stored.rows[0]).toEqual({ n: 1, phone: '+420606123456' })
  })

  it('kontakt bez údajů se nezaloží, kontakt s e-mailem ano', async () => {
    expect(await ensureContact({ name: null, phone: null, email: null })).toBeNull()
    const id = await ensureContact({ name: 'Eva Dvořáková', email: ' EVA@Example.CZ ', source: 'web' })
    expect(id).not.toBeNull()
    const row = await db.query<{ email: string }>(`SELECT email FROM contacts WHERE id = $1`, [id])
    expect(row.rows[0].email).toBe('eva@example.cz')
  })

  it('úprava kontaktu hlásí kolizi jménem, ne kódem chyby', async () => {
    const eva = await contactId('Eva Dvořáková')
    const res = await saveContactFields(eva, {
      display_name: 'Eva Dvořáková',
      company: null,
      email: 'jan@example.cz',
      phone: null,
      ico: null,
      dic: null,
      note: null,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Jan Novák')
  })

  it('telefonu, kterému nerozumíme, to řekne rovnou', async () => {
    const eva = await contactId('Eva Dvořáková')
    const res = await saveContactFields(eva, {
      display_name: 'Eva Dvořáková',
      company: 'Dvořák a spol.',
      email: null,
      phone: 'zavolám jí sám',
      ico: '  123 456 ',
      dic: 'cz123',
      note: null,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('+420 777 123 456')
  })

  it('IČO a DIČ se ukládají v jednom tvaru', async () => {
    const eva = await contactId('Eva Dvořáková')
    const res = await saveContactFields(eva, {
      display_name: 'Eva Dvořáková',
      company: 'Dvořák a spol.',
      email: null,
      phone: null,
      ico: ' 123 456 ',
      dic: 'cz 123 456',
      note: ' ',
    })
    expect(res.ok).toBe(true)
    const row = await db.query<{ ico: string; dic: string; note: string | null }>(
      `SELECT ico, dic, note FROM contacts WHERE id = $1`,
      [eva],
    )
    expect(row.rows[0].ico).toBe('00123456')
    expect(row.rows[0].dic).toBe('CZ123456')
    expect(row.rows[0].note).toBeNull()
  })
})

describe('seznam kontaktů', () => {
  it('hledá podle jména i podle telefonu zapsaného jinak', async () => {
    const podleJmena = await loadContactsScreen('aktivni', 'Malý', params)
    expect(podleJmena.rows.map((r) => r.display_name)).toContain('Petr Malý')
    const podleTelefonu = await loadContactsScreen('aktivni', '606 123 456', params)
    expect(podleTelefonu.rows.map((r) => r.display_name)).toContain('Petr Malý')
  })

  it('jmenovci se ukážou v záložce Možné duplicity', async () => {
    await db.query(`INSERT INTO contacts (display_name, email) VALUES ('Petr Maly', 'petr@example.cz')`)
    await db.query(`INSERT INTO contacts (display_name, email) VALUES ('petr malý', 'petr2@example.cz')`)
    const duplicity = await loadContactsScreen('duplicity', null, params)
    const names = duplicity.rows.map((r) => r.display_name)
    expect(names).toContain('Petr Malý')
    expect(names).toContain('petr malý')
    expect(names).not.toContain('Petr Maly')
  })
})
