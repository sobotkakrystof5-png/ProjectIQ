import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Šablona e-mailu s fakturou (R-139).
 *
 * Co se slibuje: výchozí text je přesně ten dosavadní, proměnné se dosazují
 * jedním průchodem (cizí `{cislo}` ve jménu odběratele se nerozbalí),
 * překlep v proměnné se neuloží, předmět je vždy jeden řádek a čtení šablony
 * nikdy nespadne — ani bez migrace 129, ani s poškozeným záznamem.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import {
  DEFAULT_INVOICE_EMAIL_TEMPLATE,
  EXAMPLE_INVOICE_EMAIL_VALUES,
  formatInvoiceAmount,
  invoiceEmailTemplateSchema,
  invoiceEmailValues,
  renderInvoiceEmail,
  unknownVariables,
} from '@/lib/admin/invoice-email-template'
import { loadInvoiceEmailTemplate, saveInvoiceEmailTemplate } from '@/lib/admin/invoice-email-settings'

const flat = (value: string) => value.replace(/[  ]/g, ' ')

const values = invoiceEmailValues({
  number: '2026012',
  amount: 12500,
  currency: 'CZK',
  dueOn: '2026-12-04',
  counterpartyName: 'Jan Novák',
  issuerName: 'Kryštof Sobotka',
})

describe('dosazení do šablony', () => {
  it('výchozí šablona dá přesně dosavadní text e-mailu', () => {
    const { subject, text } = renderInvoiceEmail(DEFAULT_INVOICE_EMAIL_TEMPLATE, values)
    expect(subject).toBe('Faktura 2026012')
    expect(text).toBe(
      'Dobrý den,\n\nposílám fakturu 2026012 se splatností 4. 12. 2026.\nNajdete ji v příloze.\n\nDěkuju,\nKryštof Sobotka',
    )
  })

  it('dosadí všech pět proměnných, i opakovaně a s mezerami v závorce', () => {
    const { subject, text } = renderInvoiceEmail(
      { subject: '{cislo} / {odberatel}', body: '{ cislo } {castka} {splatnost} {odberatel} {dodavatel} {cislo}' },
      values,
    )
    expect(subject).toBe('2026012 / Jan Novák')
    expect(flat(text)).toBe('2026012 12 500 Kč 4. 12. 2026 Jan Novák Kryštof Sobotka 2026012')
  })

  it('hodnota se nerozbaluje podruhé a `$&` v jménu nic nedělá', () => {
    const tricky = invoiceEmailValues({
      number: '2026012',
      amount: 100,
      currency: 'CZK',
      dueOn: '2026-12-04',
      counterpartyName: 'Firma {cislo} $& $1',
      issuerName: 'Já',
    })
    const { text } = renderInvoiceEmail({ subject: 'x', body: 'Pro: {odberatel}' }, tricky)
    expect(text).toBe('Pro: Firma {cislo} $& $1')
  })

  it('předmět je vždy jeden řádek, i když jméno odběratele obsahuje odřádkování', () => {
    const evil = { ...values, odberatel: 'Jan\r\nBcc: cizi@example.cz' }
    const { subject } = renderInvoiceEmail({ subject: 'Faktura pro {odberatel}', body: 'x' }, evil)
    expect(subject).toBe('Faktura pro Jan Bcc: cizi@example.cz')
    expect(subject).not.toMatch(/[\r\n]/)
  })

  it('neznámá proměnná v už uloženém záznamu zůstane jak je, odeslání nespadne', () => {
    const { text } = renderInvoiceEmail({ subject: 'x', body: 'Cena {cena}' }, values)
    expect(text).toBe('Cena {cena}')
  })

  it('částka: haléře jen když jsou, jinak celé číslo', () => {
    expect(flat(formatInvoiceAmount(12500, 'CZK'))).toBe('12 500 Kč')
    expect(flat(formatInvoiceAmount(12500.5, 'CZK'))).toBe('12 500,50 Kč')
    expect(flat(formatInvoiceAmount(1200, 'EUR'))).toBe('1 200 €')
  })

  it('ukázkové hodnoty mají všech pět proměnných', () => {
    expect(Object.keys(EXAMPLE_INVOICE_EMAIL_VALUES).sort()).toEqual(
      ['castka', 'cislo', 'dodavatel', 'odberatel', 'splatnost'],
    )
  })
})

describe('co se do šablony uložit nesmí', () => {
  it('pozná překlep v proměnné a řekne, co jde použít', () => {
    expect(unknownVariables('Dobrý den, {cena} a {cislo} a {cena}')).toEqual(['cena'])
    const result = invoiceEmailTemplateSchema.safeParse({ subject: 'Faktura {cislo}', body: 'Cena {cena}' })
    expect(result.success).toBe(false)
    const message = result.success ? '' : result.error.issues[0].message
    expect(message).toContain('{cena}')
    expect(message).toContain('{castka}')
  })

  it('odmítne prázdný předmět, prázdný text, víceřádkový předmět a příliš dlouhý text', () => {
    expect(invoiceEmailTemplateSchema.safeParse({ subject: ' ', body: 'x' }).success).toBe(false)
    expect(invoiceEmailTemplateSchema.safeParse({ subject: 'x', body: '  ' }).success).toBe(false)
    expect(invoiceEmailTemplateSchema.safeParse({ subject: 'a\nb', body: 'x' }).success).toBe(false)
    expect(invoiceEmailTemplateSchema.safeParse({ subject: 'x', body: 'a'.repeat(4001) }).success).toBe(false)
  })

  it('výchozí šablona projde, `\\r\\n` z formuláře se sjednotí na `\\n`', () => {
    expect(invoiceEmailTemplateSchema.safeParse(DEFAULT_INVOICE_EMAIL_TEMPLATE).success).toBe(true)
    const parsed = invoiceEmailTemplateSchema.parse({ subject: 'x', body: 'a\r\nb' })
    expect(parsed.body).toBe('a\nb')
  })
})

describe('uložení a čtení v databázi', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_name text NOT NULL,
        client_email text,
        description text,
        price numeric,
        deposit_amount numeric,
        deposit_paid boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'new',
        project_type text NOT NULL DEFAULT 'client',
        contact_id uuid,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        display_name text NOT NULL,
        company text, ico text, dic text, merged_into uuid
      );
      CREATE TABLE finance_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        amount numeric NOT NULL,
        type text NOT NULL,
        category text NOT NULL,
        note text,
        date date NOT NULL DEFAULT current_date,
        declared boolean NOT NULL DEFAULT false,
        source_project_id uuid,
        created_at timestamptz DEFAULT now()
      );
    `)
    await db.exec(read('053_invoices.sql'))
    await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
    await db.exec(read('107_fakturace_vystavovani.sql'))
  })

  afterAll(async () => {
    await db.close()
  })

  it('bez migrace 129 a bez uložené šablony se čte výchozí text', async () => {
    const loaded = await loadInvoiceEmailTemplate()
    expect(loaded.custom).toBe(false)
    expect(loaded.template).toEqual(DEFAULT_INVOICE_EMAIL_TEMPLATE)
  })

  it('bez migrace 129 se uložení odmítne srozumitelnou hláškou', async () => {
    const saved = await saveInvoiceEmailTemplate({ subject: 'x', body: 'y' })
    expect(saved.ok).toBe(false)
    expect(saved.ok ? '' : saved.error).toContain('migrace 129')
  })

  it('po migraci (a po jejím druhém běhu) se uloží a přečte zpět', async () => {
    const migration = read('129_faktury_sablona_emailu.sql')
    await db.exec(migration)
    await db.exec(migration)

    const template = { subject: 'Faktura {cislo} pro {odberatel}', body: 'Ahoj,\n\nposílám {cislo}.\n\n{dodavatel}' }
    expect(await saveInvoiceEmailTemplate(template)).toEqual({ ok: true })
    const loaded = await loadInvoiceEmailTemplate()
    expect(loaded.custom).toBe(true)
    expect(loaded.template).toEqual(template)

    // Druhé uložení řádek přepíše, nezaloží druhý.
    expect(await saveInvoiceEmailTemplate({ subject: 'Nový', body: 'Text' })).toEqual({ ok: true })
    expect((await loadInvoiceEmailTemplate()).template).toEqual({ subject: 'Nový', body: 'Text' })
    const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM admin_settings`)
    expect(count.rows[0].n).toBe(1)
  })

  it('poškozený záznam v databázi nezastaví odeslání — čte se výchozí text', async () => {
    await db.exec(`UPDATE admin_settings SET invoice_email_template = '{"subject":"jen předmět"}'::jsonb WHERE id = true`)
    const loaded = await loadInvoiceEmailTemplate()
    expect(loaded.custom).toBe(false)
    expect(loaded.template).toEqual(DEFAULT_INVOICE_EMAIL_TEMPLATE)
  })
})
