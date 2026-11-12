import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'
import {
  invoiceSums, issueInvoice, loadInvoiceDoc, loadIssuerProfile, saveIssuerProfile,
  cancelInvoiceRow, type IssuerProfile,
} from '@/lib/admin/invoicing'
import { loadInvoiceRegistry } from '@/lib/admin/invoices'
import { parseTableParams } from '@/lib/admin-table'
import { invoiceHtml, renderInvoicePdf, spaydPaymentString } from '@/lib/invoice-pdf/render'
import { isValidIco } from '@/lib/ares'

/**
 * Migrace 107 a vystavování faktur (AD12) proti skutečnému Postgresu (PGlite).
 *
 * Dvě věci jsou podstatnější než zbytek: **archiv cizích PDF se nesmí
 * změnit** (dnešní doklady a příjmy z nich jsou daňová čísla) a **číslo
 * faktury musí být jedinečné a souvislé**.
 *
 * Co tenhle test ověřit nemůže: skutečný souběh. PGlite má jediné spojení,
 * takže se transakce stejně seřadí za sebe. Testuje se proto dvojí volání
 * naráz (čísla se nesmí zopakovat), to, že řada nejde zpátky, když se
 * uložené pořadí rozejde se skutečností, a že duplicitu odmítne unikátní
 * index — ta pojistka platí i na Neonu, kde souběh skutečný je.
 */

const ROOT = path.resolve(__dirname, '../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/107_fakturace_vystavovani.sql'), 'utf8')

let db: PGlite

const PROFILE: IssuerProfile = {
  name: 'Testovací dodavatel', address: 'Ulice 1, 100 00 Praha', ico: '29977231', dic: '',
  bank: 'CZ6508000000192000145399', email: 'test@example.cz', phone: '', vatPayer: false,
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params)
  return res.rows[0]
}

function vstup(day: string, name: string, unitPrice = 1000, vatRate: 0 | 12 | 21 = 0) {
  return {
    projectId: null, contactId: null,
    counterparty: { name, address: 'Adresa 2', ico: '', dic: '', email: 'klient@example.cz' },
    issuedOn: day, suppliedOn: day, dueOn: day, currency: 'CZK' as const,
    items: [{ description: 'Web', quantity: 1, unitPrice, vatRate }], note: '',
  }
}

async function vystav(day: string, name: string, unitPrice = 1000) {
  return issueInvoice(vstup(day, name, unitPrice), PROFILE)
}

beforeAll(async () => {
  db = new PGlite()
  // Tabulky tak, jak je nechaly migrace 001–106 — jen to, čeho se AD12 týká.
  await db.exec(`
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL, company text, email text, ico text, dic text,
      merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL, client_email text, description text,
      price numeric, deposit_amount numeric, deposit_paid boolean DEFAULT false,
      source text DEFAULT 'manual', lead_origin text NOT NULL DEFAULT 'vizeon',
      lead_confirmed boolean NOT NULL DEFAULT false,
      lead_pending boolean GENERATED ALWAYS AS
        (source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed) STORED,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      amount numeric NOT NULL, type text NOT NULL, category text, note text, date date NOT NULL,
      user_id uuid, source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_invoice_id uuid, declared boolean DEFAULT false
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      client_name text, client_ico text, client_dic text,
      issued_on date NOT NULL, due_on date, paid_on date,
      amount numeric NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'CZK', note text,
      pdf_data bytea, pdf_filename text, pdf_size integer, ai_extracted jsonb,
      finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(), updated_at timestamptz
    );
    CREATE UNIQUE INDEX invoices_number_key ON invoices (invoice_number);
    INSERT INTO invoices (invoice_number, issued_on, amount, client_name)
    VALUES ('FV-2025-9', '2025-03-03', 1000, 'Starý klient');
  `)

  await db.exec(MIGRATION)
  // Migrace musí jít pustit dvakrát (běhoun ji může zopakovat).
  await db.exec(MIGRATION)

  setAdminDbForTests(pgliteAdminDriver(db))
  await saveIssuerProfile(PROFILE)
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

describe('archiv cizích PDF se nemění', () => {
  it('dosavadní doklad je dál archivem a jde upravit i smazat', async () => {
    const row = await one<{ direction: string; pdf_generated: boolean }>(
      `SELECT direction, pdf_generated FROM invoices WHERE invoice_number = 'FV-2025-9'`,
    )
    expect(row).toEqual({ direction: 'issued', pdf_generated: false })

    await db.exec(`UPDATE invoices SET amount = 1500, invoice_number = 'FV-2025-9b' WHERE invoice_number = 'FV-2025-9'`)
    const upraveny = await one<{ amount: string }>(`SELECT amount FROM invoices WHERE invoice_number = 'FV-2025-9b'`)
    expect(Number(upraveny.amount)).toBe(1500)

    await db.exec(`DELETE FROM invoices WHERE invoice_number = 'FV-2025-9b'`)
    const zbylo = await one<{ pocet: number }>(`SELECT count(*)::int AS pocet FROM invoices WHERE NOT pdf_generated`)
    expect(zbylo.pocet).toBe(0)
  })
})

describe('číslo faktury', () => {
  it('má tvar YYYYNNN a počítá se v rámci roku', async () => {
    const prvni = await vystav('2026-05-05', 'A')
    const druha = await vystav('2026-05-06', 'B')
    const loni = await vystav('2025-12-31', 'C')

    expect(prvni.number).toBe('2026001')
    expect(druha.number).toBe('2026002')
    expect(loni.number).toBe('2025001')
  })

  it('dvě vystavení naráz nedají stejné číslo ani díru v řadě', async () => {
    const [a, b] = await Promise.all([vystav('2026-06-01', 'D'), vystav('2026-06-01', 'E')])
    const cisla = [a.number, b.number].map(Number).sort((x, y) => x - y)
    expect(cisla[0]).toBe(2026003)
    expect(cisla[1]).toBe(2026004)
  })

  it('řada nejde zpátky, i když se uložené pořadí rozejde se skutečností', async () => {
    await db.exec(`UPDATE admin_settings SET invoice_sequences = '{"2026": 1}'::jsonb WHERE id`)
    const dalsi = await vystav('2026-07-07', 'F')
    expect(dalsi.number).toBe('2026005')
  })

  it('duplicitní číslo odmítne databáze, ne aplikace', async () => {
    await expect(
      db.exec(`INSERT INTO invoices (invoice_number, number_seq, direction, issued_on, amount)
               VALUES ('2026001', 2026001, 'issued', '2026-05-05', 1)`),
    ).rejects.toThrow()
  })

  it('přijatá faktura smí nést číslo dodavatele, i když se potká s naší řadou', async () => {
    await db.exec(`INSERT INTO invoices (invoice_number, direction, issued_on, amount)
                   VALUES ('2026001', 'received', '2026-05-05', 500)`)
    const pocet = await one<{ pocet: number }>(`SELECT count(*)::int AS pocet FROM invoices WHERE invoice_number = '2026001'`)
    expect(pocet.pocet).toBe(2)
    await db.exec(`DELETE FROM invoices WHERE direction = 'received'`)
  })
})

describe('vystavený doklad je neměnný', () => {
  it('číslo, částku, položky ani odběratele už nikdo nepřepíše', async () => {
    const id = (await one<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)).id
    for (const sql of [
      `UPDATE invoices SET invoice_number = 'X' WHERE id = $1`,
      `UPDATE invoices SET amount = 1 WHERE id = $1`,
      `UPDATE invoices SET items = '[]'::jsonb WHERE id = $1`,
      `UPDATE invoices SET client_name = 'Někdo jiný' WHERE id = $1`,
      `UPDATE invoices SET issuer = '{}'::jsonb WHERE id = $1`,
      `DELETE FROM invoices WHERE id = $1`,
    ]) {
      await expect(db.query(sql, [id])).rejects.toThrow(/admin_invoice_(immutable|no_delete)/)
    }
  })

  it('datum zaplacení se měnit smí a změna poznámky zahodí uložené PDF', async () => {
    const id = (await one<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026002'`)).id
    await db.query(`UPDATE invoices SET pdf_data = decode('AAAA', 'base64'), pdf_size = 3 WHERE id = $1`, [id])
    await db.query(`UPDATE invoices SET paid_on = '2026-05-20' WHERE id = $1`, [id])
    await db.query(`UPDATE invoices SET note = 'Děkuji za spolupráci.' WHERE id = $1`, [id])

    const row = await one<{ paid_on: string; pdf_prazdne: boolean }>(
      `SELECT paid_on::text, pdf_data IS NULL AS pdf_prazdne FROM invoices WHERE id = $1`, [id],
    )
    expect(row.paid_on).toBe('2026-05-20')
    expect(row.pdf_prazdne).toBe(true)
  })
})

describe('doklad pro PDF', () => {
  it('QR k zaplacení je jen na nezaplacené koruně a variabilní symbol je číslo faktury', async () => {
    const id = (await one<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)).id
    const doc = await loadInvoiceDoc(id)
    expect(doc?.payable).toBe(true)
    expect(spaydPaymentString(doc!)).toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:1000.00*CC:CZK*X-VS:2026001')
    expect(spaydPaymentString({ ...doc!, currency: 'EUR' })).toBeNull()
    expect(spaydPaymentString({ ...doc!, payable: false })).toBeNull()
  })

  it('archivní doklad se negeneruje — PDF k němu patří nahrané', async () => {
    await db.exec(`INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('CIZI-1', '2026-01-01', 100)`)
    const id = (await one<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = 'CIZI-1'`)).id
    expect(await loadInvoiceDoc(id)).toBeNull()
  })
})

describe('PDF vystavené faktury', () => {
  it('doklad nese QR, částku, variabilní symbol a větu o neplátci; vstup od uživatele je escapovaný', async () => {
    const { id } = await issueInvoice({
      ...vstup('2026-10-10', 'Klient s.r.o.', 12000),
      note: '<script>alert(1)</script>',
    }, PROFILE)
    const doc = await loadInvoiceDoc(id)
    const html = await invoiceHtml(doc!, { name: PROFILE.name, logo: null })

    // Částky formátuje `Intl` s pevnou mezerou — porovnává se po jejím sjednocení.
    const text = html.replace(/\u00a0/g, ' ')

    expect(text).toContain('Zaplatit QR kódem')
    expect(text).toContain('<svg')
    expect(text).toContain('Variabilní symbol')
    // Celá částka se tiskne bez haléřů (`formatMoney`).
    expect(text).toContain('Celkem k úhradě <strong class="numbers">12 000 Kč</strong>')
    // Doklad se sází písmem Dílků a na bílém papíře. Dřív si bral `[data-app="ws"]`
    // z tokenů Workspace, které sahají po proměnných z `next/font` — ty v PDF
    // neexistují, takže se celá faktura tiskla v Times na šedém podkladu.
    expect(text).toContain('<body>')
    expect(text).not.toContain('<body data-app')
    expect(text).toContain('font-family:InvoiceSans')
    // Datum na dokladu musí nést rok (ne „čt 12. 11." z aplikace).
    expect(text).toContain('10. 10. 2026')
    expect(text).toContain('Dodavatel není plátce DPH.')
    expect(text).toContain('&lt;script&gt;')
    expect(text).not.toContain('<script>alert(1)</script>')
  })

  // Skutečný tisk přes Chromium — pouští se jen s ADMIN_PDF_SMOKE=1
  // (v CI Chrome není a 30 s na každý běh by bylo zbytečné zdržení).
  it.runIf(process.env.ADMIN_PDF_SMOKE === '1')('se skutečně vykreslí', async () => {
    const { id } = await issueInvoice(vstup('2026-10-11', 'Tiskový klient', 24200), PROFILE)
    const doc = await loadInvoiceDoc(id)
    const pdf = await renderInvoicePdf(doc!, { name: PROFILE.name, logo: null })

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(10000)
    if (process.env.ADMIN_PDF_OUT) {
      const fsp = await import('fs/promises')
      await fsp.writeFile(process.env.ADMIN_PDF_OUT, pdf)
    }
  }, 60000)
})

describe('storno', () => {
  it('doklad zůstane v evidenci, ale přestane být pohledávkou', async () => {
    const vystavena = await vystav('2026-08-08', 'G')
    const result = await cancelInvoiceRow(vystavena.id)
    expect(result).not.toBeNull()

    const row = await one<{ cancelled: boolean; paid_on: string | null }>(
      `SELECT cancelled_at IS NOT NULL AS cancelled, paid_on::text FROM invoices WHERE id = $1`, [vystavena.id],
    )
    expect(row.cancelled).toBe(true)
    expect(row.paid_on).toBeNull()

    const params = parseTableParams({}, { allowed: { vystaveno: { sql: 'i.issued_on', dir: 'desc' } }, defaultSort: 'vystaveno', pageSize: 50, tiebreak: 'i.created_at' })
    const nezaplacene = await loadInvoiceRegistry(params, { year: null, status: 'nezaplacene', query: '' })
    expect(nezaplacene.rows.some((invoice) => invoice.id === vystavena.id)).toBe(false)

    const storno = await loadInvoiceRegistry(params, { year: null, status: 'storno', query: '' })
    expect(storno.rows.map((invoice) => invoice.id)).toContain(vystavena.id)
  })
})

describe('součty a IČO', () => {
  it('položky se počítají v haléřích a DPH se zaokrouhluje po položce', () => {
    expect(invoiceSums([{ description: 'X', quantity: 2.5, unitPrice: 100, vatRate: 21 }])).toEqual({ amount: 302.5, vat: 52.5 })
    expect(invoiceSums([
      { description: 'A', quantity: 1, unitPrice: 0.1, vatRate: 0 },
      { description: 'B', quantity: 1, unitPrice: 0.2, vatRate: 0 },
    ]).amount).toBe(0.3)
  })

  it('IČO s chybnou kontrolní číslicí se do rejstříku vůbec neposílá', () => {
    expect(isValidIco('29977231')).toBe(true)
    expect(isValidIco('29977232')).toBe(false)
    expect(isValidIco('1234')).toBe(false)
    expect(isValidIco('abcdefgh')).toBe(false)
  })
})

describe('fakturační údaje', () => {
  it('rozepsaný profil se neztratí, ale fakturovat se s ním nedá', async () => {
    await db.exec(`UPDATE admin_settings SET issuer_profile = '{"name":"Rozepsané"}'::jsonb WHERE id`)
    const rozepsany = await loadIssuerProfile()
    expect(rozepsany.name).toBe('Rozepsané')
    expect(rozepsany.ico).toBe('')

    await expect(issueInvoice(vstup('2026-09-09', 'H'), rozepsany)).rejects.toThrow(/fakturační údaje/)

    await saveIssuerProfile(PROFILE)
    expect((await loadIssuerProfile()).ico).toBe('29977231')
  })

  it('neplátce DPH nemůže účtovat DPH', async () => {
    await expect(issueInvoice(vstup('2026-09-09', 'I', 1000, 21), PROFILE)).rejects.toThrow(/DPH/)
  })
})
