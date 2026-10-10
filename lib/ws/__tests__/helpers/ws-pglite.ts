import fs from 'fs'
import path from 'path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import type { WsDriver, WsRow } from '../../db'

// Testovací Postgres (PGlite = Postgres 18 ve WASM, Neon běží na 18.6).
// Migrace se pouští jako superuser (= vlastník tabulek jako na Neonu),
// aplikace jako ws_app — přesně jako v produkci, jen bez sítě.

const ROOT = path.resolve(__dirname, '../../../..')
const MIGRATIONS_DIR = path.join(ROOT, 'migrations')

export const WS_MIGRATIONS = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{3}_ws_.*\.sql$/.test(f))
  .sort()

/** Tabulky bez dat účtů a bez RLS (migrace 073, 075). Nová tabulka sem patří jen s důvodem. */
export const WS_SYSTEM_TABLES = ['rate_limits', 'stripe_events', 'webhook_events']

/** Globální obsah bez dat účtů (novinky ZakazIQ, migrace 081): ws_app jen čte. */
export const WS_GLOBAL_TABLES = ['product_news']

const read = (file: string) => fs.readFileSync(file, 'utf8')

export async function applyWsMigrations(db: PGlite): Promise<void> {
  for (const file of WS_MIGRATIONS) await db.exec(read(path.join(MIGRATIONS_DIR, file)))
  await db.exec(read(path.join(ROOT, 'scripts', 'ws-grants.sql')))
}

/** Otisk schématu ws — po druhém průchodu migrací musí být stejný. */
export async function schemaFingerprint(db: PGlite): Promise<Record<string, number>> {
  const { rows } = await db.query<Record<string, number>>(`
    SELECT
      (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'ws') AS tables,
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'ws') AS indexes,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'ws') AS policies,
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'ws') AS constraints,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'ws' AND NOT t.tgisinternal) AS triggers,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ws') AS functions
  `)
  return rows[0]
}

/** Deterministické UUID: u('a', 3) → aaaaaaaa-0000-4000-8000-000000000003. */
export const u = (account: 'a' | 'b' | 'c', n: number) =>
  `${account.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`

export const ids = (L: 'a' | 'b' | 'c') => ({
  account: u(L, 1),
  member: u(L, 2),
  business: u(L, 3),
  service: u(L, 4),
  staff: u(L, 5),
  field: u(L, 6),
  stage: u(L, 7),
  customer: u(L, 8),
  request: u(L, 9),
  job: u(L, 10),
  appointment: u(L, 11),
  program: u(L, 12),
  card: u(L, 13),
  integration: u(L, 14),
  invoice: u(L, 15),
})

/** Jeden řádek do každé tabulky s daty účtu (jako vlastník, mimo RLS). */
export async function seedAccount(db: PGlite, L: 'a' | 'b'): Promise<void> {
  const i = ids(L)
  await db.exec(`
    INSERT INTO ws.accounts (id, clerk_org_id, name) VALUES ('${i.account}', 'org_${L}', 'Firma ${L}');
    INSERT INTO ws.members (id, account_id, clerk_user_id, role) VALUES ('${i.member}', '${i.account}', 'user_${L}', 'owner');
    INSERT INTO ws.businesses (id, account_id, name, slug) VALUES ('${i.business}', '${i.account}', 'Byznys ${L}', 'byznys-${L}');
    INSERT INTO ws.business_modules (account_id, business_id, module, enabled) VALUES ('${i.account}', '${i.business}', 'calendar', true);
    INSERT INTO ws.services (id, account_id, business_id, name) VALUES ('${i.service}', '${i.account}', '${i.business}', 'Služba');
    INSERT INTO ws.staff (id, account_id, business_id, member_id, name) VALUES ('${i.staff}', '${i.account}', '${i.business}', '${i.member}', 'Pracovník');
    INSERT INTO ws.service_staff (account_id, business_id, service_id, staff_id) VALUES ('${i.account}', '${i.business}', '${i.service}', '${i.staff}');
    INSERT INTO ws.opening_hours (account_id, business_id, weekday, opens, closes) VALUES ('${i.account}', '${i.business}', 1, '09:00', '17:00');
    INSERT INTO ws.field_definitions (id, account_id, business_id, key, label, type) VALUES ('${i.field}', '${i.account}', '${i.business}', 'poznamka', 'Poznámka', 'text');
    INSERT INTO ws.stages (id, account_id, business_id, name, type) VALUES ('${i.stage}', '${i.account}', '${i.business}', 'Nová', 'new');
    INSERT INTO ws.customers (id, account_id, name, phone, email) VALUES ('${i.customer}', '${i.account}', 'Zákazník', '+420600000001', 'zakaznik@example.cz');
    INSERT INTO ws.web_integrations (id, account_id, business_id, public_key, allowed_origins) VALUES ('${i.integration}', '${i.account}', '${i.business}', 'pk_${L.repeat(24)}', ARRAY['https://${L}.example.cz']);
    INSERT INTO ws.requests (id, account_id, business_id, customer_id, service_id, integration_id, source) VALUES ('${i.request}', '${i.account}', '${i.business}', '${i.customer}', '${i.service}', '${i.integration}', 'web');
    INSERT INTO ws.jobs (id, account_id, business_id, customer_id, request_id, stage_id, title) VALUES ('${i.job}', '${i.account}', '${i.business}', '${i.customer}', '${i.request}', '${i.stage}', 'Zakázka');
    INSERT INTO ws.appointments (id, account_id, business_id, staff_id, customer_id, job_id, request_id, service_id, starts_at, ends_at)
      VALUES ('${i.appointment}', '${i.account}', '${i.business}', '${i.staff}', '${i.customer}', '${i.job}', '${i.request}', '${i.service}', '2026-10-01 09:00+02', '2026-10-01 10:00+02');
    INSERT INTO ws.loyalty_programs (id, account_id, business_id, enabled) VALUES ('${i.program}', '${i.account}', '${i.business}', true);
    INSERT INTO ws.loyalty_cards (id, account_id, business_id, program_id, customer_id, stamps) VALUES ('${i.card}', '${i.account}', '${i.business}', '${i.program}', '${i.customer}', 1);
    INSERT INTO ws.loyalty_events (account_id, business_id, card_id, appointment_id, kind, delta) VALUES ('${i.account}', '${i.business}', '${i.card}', '${i.appointment}', 'stamp', 1);
    INSERT INTO ws.segment_rules (business_id, account_id) VALUES ('${i.business}', '${i.account}');
    INSERT INTO ws.customer_segments (account_id, business_id, customer_id, segment) VALUES ('${i.account}', '${i.business}', '${i.customer}', 'new');
    INSERT INTO ws.segment_history (account_id, business_id, customer_id, to_segment) VALUES ('${i.account}', '${i.business}', '${i.customer}', 'new');
    INSERT INTO ws.invoices (id, account_id, business_id, customer_id, job_id, number, amount) VALUES ('${i.invoice}', '${i.account}', '${i.business}', '${i.customer}', '${i.job}', '2026001', 1000);
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, occurred_on, invoice_id) VALUES ('${i.account}', '${i.business}', 'income', 1000, '2026-10-01', '${i.invoice}');
    INSERT INTO ws.tax_settings (account_id) VALUES ('${i.account}');
    INSERT INTO ws.subscriptions (account_id, stripe_subscription_id, status) VALUES ('${i.account}', 'sub_${L}', 'trialing');
    INSERT INTO ws.message_settings (account_id, business_id, type) VALUES ('${i.account}', '${i.business}', 'reminder');
    INSERT INTO ws.outbound_messages (account_id, business_id, customer_id, type, to_address) VALUES ('${i.account}', '${i.business}', '${i.customer}', 'reminder', 'zakaznik@example.cz');
    INSERT INTO ws.notifications (account_id, business_id, member_id, type, title) VALUES ('${i.account}', '${i.business}', '${i.member}', 'new_request', 'Nová poptávka');
    INSERT INTO ws.audit_log (account_id, business_id, actor, action) VALUES ('${i.account}', '${i.business}', 'user_${L}', 'test');
    INSERT INTO ws.idempotency_keys (account_id, key, request_hash) VALUES ('${i.account}', 'klic-1', 'hash');
    INSERT INTO ws.intake_log (account_id, business_id, integration_id, channel, status, request_id) VALUES ('${i.account}', '${i.business}', '${i.integration}', 'widget', 202, '${i.request}');
    INSERT INTO ws.action_tokens (account_id, business_id, request_id, expires_at) VALUES ('${i.account}', '${i.business}', '${i.request}', now() + interval '72 hours');
  `)
}

/**
 * Čerstvá DB: role ws_app, „admin“ tabulka v public, migrace + práva
 * dvakrát po sobě (idempotence), účty A a B s daty ve všech tabulkách.
 */
export async function createWsTestDb(): Promise<{ db: PGlite; fingerprints: Record<string, number>[] }> {
  const db = await PGlite.create({ extensions: { btree_gist } })
  await db.exec(`
    CREATE ROLE ws_app NOLOGIN;
    CREATE TABLE public.projects (id int);
    INSERT INTO public.projects VALUES (1);
  `)
  await applyWsMigrations(db)
  const first = await schemaFingerprint(db)
  await applyWsMigrations(db)
  const second = await schemaFingerprint(db)
  await seedAccount(db, 'a')
  await seedAccount(db, 'b')
  return { db, fingerprints: [first, second] }
}

/** Ovladač pro lib/ws/db.ts: každá transakce běží jako ws_app (pod RLS). */
export function pgliteDriver(db: PGlite): WsDriver {
  return {
    transaction: (queries) =>
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE ws_app')
        const out: WsRow[][] = []
        for (const x of queries) out.push((await tx.query<WsRow>(x.text, [...x.params])).rows)
        return out
      }),
  }
}

/** Raw SQL jako ws_app s nastaveným účtem (nebo bez něj). */
export async function asApp<T>(db: PGlite, accountId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE ws_app')
    if (accountId) await tx.query(`SELECT set_config('app.account_id', $1, true)`, [accountId])
    return fn(tx)
  })
}

/** Kód chyby Postgresu, nebo null, když dotaz prošel. */
export async function pgCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}
