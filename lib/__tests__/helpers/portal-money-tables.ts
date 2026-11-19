import fs from 'fs'
import path from 'path'
import type { PGlite } from '@electric-sql/pglite'

/**
 * Tabulky, které migrace 122 (KP13) potřebuje vedle `projects`: faktury
 * (053 + 107) a ledger se sloupcem `source_invoice_id`. Pro testy klientského
 * prostoru, které staví `projects` jen s několika sloupci — doplní i sloupce
 * peněz, na které se odvolávají triggery z 122.
 */
export async function preparePortalMoneyTables(db: PGlite): Promise<void> {
  const root = path.resolve(__dirname, '../../..')
  const read = (file: string) => fs.readFileSync(path.join(root, 'migrations', file), 'utf8')
  await db.exec(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS price numeric,
      ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deposit_amount numeric,
      ADD COLUMN IF NOT EXISTS deposit_paid boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount numeric NOT NULL,
      type text NOT NULL, category text NOT NULL, note text, date date NOT NULL,
      declared boolean NOT NULL DEFAULT false, deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL')
  await db.exec(read('107_fakturace_vystavovani.sql'))
}
