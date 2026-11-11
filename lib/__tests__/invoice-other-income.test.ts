import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { INCOME_JOIN, OTHER_INCOME_COUNT } from '@/lib/invoices'

// AD06: „jiné příjmy zakázky" (`other_income_count`) se počítaly korelovaným
// COUNT(*) pro každý řádek výpisu faktur. Teď se příjmy sečtou jednou přes
// GROUP BY a od součtu se odečte vlastní transakce faktury.
//
// Je to příznak dvojího započtení peněz, takže se nestačí spolehnout, že to
// „vypadá stejně": test pouští **oba** dotazy nad stejnými daty a porovnává
// je řádek po řádku.

let db: PGlite

const OLD_COUNT = `
  COALESCE((
    SELECT COUNT(*) FROM finance_transactions t
    WHERE t.source_project_id = i.project_id
      AND t.type = 'income'
      AND t.user_id IS NULL
      AND (i.finance_transaction_id IS NULL OR t.id <> i.finance_transaction_id)
  ), 0)::int AS other_income_count
`

const run = async (select: string, join: string) =>
  (
    await db.query<{ invoice_number: string; other_income_count: number }>(`
      SELECT i.invoice_number, ${select}
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      ${join}
      ORDER BY i.invoice_number
    `)
  ).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_project_id uuid REFERENCES projects(id),
      type text NOT NULL,
      user_id uuid,
      amount numeric NOT NULL DEFAULT 0
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text NOT NULL,
      project_id uuid REFERENCES projects(id),
      finance_transaction_id uuid REFERENCES finance_transactions(id),
      created_at timestamptz DEFAULT now()
    );
  `)

  // Případy, na kterých se oba dotazy můžou rozejít:
  // A: zakázka s jediným příjmem, který faktura vlastní (→ 0)
  // B: zakázka se dvěma příjmy, jeden vlastní faktura (→ 1)
  // C: faktura bez vazby na ledger, zakázka má dva příjmy (→ 2)
  // D: zakázka bez příjmů (→ 0)
  // E: faktura bez zakázky (→ 0)
  // F: vlastní transakce patří jiné zakázce, než na které je faktura (→ 2)
  // G: příjem jiného uživatele a výdaj se nepočítají, zbylý příjem faktura vlastní (→ 0)
  await db.exec(`
    INSERT INTO projects (id, client_name) VALUES
      ('11111111-1111-1111-1111-111111111111', 'A'),
      ('22222222-2222-2222-2222-222222222222', 'B'),
      ('33333333-3333-3333-3333-333333333333', 'C'),
      ('44444444-4444-4444-4444-444444444444', 'D'),
      ('66666666-6666-6666-6666-666666666666', 'F'),
      ('77777777-7777-7777-7777-777777777777', 'G');

    INSERT INTO finance_transactions (id, source_project_id, type, user_id) VALUES
      ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'income', NULL),
      ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'income', NULL),
      ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'income', NULL),
      ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'income', NULL),
      ('cccccccc-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'income', NULL),
      ('66666666-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'income', NULL),
      ('66666666-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', 'income', NULL),
      ('77777777-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', 'income', NULL),
      ('77777777-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', 'income', '88888888-8888-8888-8888-888888888888'),
      ('77777777-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777', 'expense', NULL);

    INSERT INTO invoices (invoice_number, project_id, finance_transaction_id) VALUES
      ('A', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
      ('B', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001'),
      ('C', '33333333-3333-3333-3333-333333333333', NULL),
      ('D', '44444444-4444-4444-4444-444444444444', NULL),
      ('E', NULL, NULL),
      ('F', '66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000001'),
      ('G', '77777777-7777-7777-7777-777777777777', '77777777-0000-0000-0000-000000000001');
  `)
})

describe('other_income_count — dávkový přepis dává stejná čísla jako korelovaný dotaz', () => {
  it('nový dotaz s GROUP BY vrací řádek po řádku totéž co ten původní', async () => {
    const before = await run(OLD_COUNT, '')
    const after = await run(OTHER_INCOME_COUNT, INCOME_JOIN)
    expect(after).toEqual(before)
  })

  it('a jsou to čísla, která dávají smysl', async () => {
    const rows = await run(OTHER_INCOME_COUNT, INCOME_JOIN)
    const byNumber = Object.fromEntries(rows.map((r) => [r.invoice_number, r.other_income_count]))
    expect(byNumber).toEqual({
      A: 0, // jediný příjem patří téhle faktuře
      B: 1, // druhý příjem zakázky faktura nezastupuje
      C: 2, // faktura ledger nezaložila, zakázka má dva příjmy
      D: 0, // zakázka bez příjmů
      E: 0, // faktura bez zakázky
      F: 2, // vlastní transakce patří jiné zakázce, takže se neodečítá
      G: 0, // cizí příjem ani výdaj se nepočítají; zbylý příjem faktura vlastní
    })
  })
})
