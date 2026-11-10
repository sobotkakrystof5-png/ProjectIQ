---
name: zakaziq-workspace-backend
description: Backendové vzory ZakazIQ Workspace — schéma ws a oddělení účtů (account_id, requireWorkspace, RLS), idempotentní migrace od 064, server actions se Zodem, veřejné API pro poptávky z webů (schema/requests, veřejný a tajný klíč), Supabase Auth a členství v účtu (ws.members, pozvánky), Stripe předplatné 249 Kč a webhooky, fronta e-mailů, cron. Použij vždy, když píšeš migraci, dotaz do databáze, server action, route handler, webhook, cron, práci s klíči nebo cokoli, co čte či zapisuje data klientů.
---

# Backend ZakazIQ Workspace

Cíl: žádný klient nikdy neuvidí data jiného klienta, žádná poptávka se neztratí, admin konzole
zůstane netknutá. Každý vzor níže slouží jednomu z těch tří cílů.

## 1. Struktura

```
lib/ws/
  db.ts             sqlWs (DATABASE_URL_WS) — jediný vstup do schématu ws
  context.ts        requireWorkspace(), requireBusiness(), requireRole()
  result.ts         ok() / fail() — tvar výsledku akcí
  time.ts           kopie lib/prague-time.ts (Europe/Prague)
  fields.ts         Zod schéma z field_definitions
  keys.ts           generování a ověření veřejných a tajných klíčů
  billing.ts        hasActiveSubscription(), Stripe helpery
  email/            React Email šablony + fronta
  segments.ts       výpočet segmentů
  loyalty.ts        pravidla razítek
app/w/[business]/** obrazovky + actions.ts
app/api/public/v1/  schema, requests (veřejné)
app/api/stripe/webhook, app/api/cron/ws-*
migrations/064_ws_*.sql …
```

## 2. Kontext a oddělení účtů

```ts
// lib/ws/context.ts
export type WsContext = { userId: string; accountId: string; role: 'owner' | 'staff' }

export const requireWorkspace = cache(async (): Promise<WsContext> => {
  const identity = await requireIdentity()                 // Supabase Auth (lib/supabase/server.ts)
  // Účet a role z členství; SECURITY DEFINER funkce, protože účet ještě neznáme.
  const [row] = await wsSystem`SELECT account_id, role FROM ws.membership_for_user(${identity.userId})`
  if (!row?.account_id) redirect('/w/novy')
  return { userId: identity.userId, accountId: row.account_id, role: roleOf(row.role) }
})

export async function requireBusiness(ctx: WsContext, slug: string) {
  const [b] = await sqlWs`SELECT * FROM ws.businesses WHERE account_id = ${ctx.accountId} AND slug = ${slug}`
  if (!b) notFound()                                        // cizí slug = 404, nikdy 403
  return b
}
```

Pravidla:
- `account_id` se bere **jen** z `requireWorkspace()`. Nikdy z formuláře, URL ani těla požadavku.
- Každý `SELECT/UPDATE/DELETE` v `ws` má `WHERE account_id = ${ctx.accountId}`.
- Cizí záznam = `notFound()`; neprozrazuj, že existuje.
- RLS: politiky na `account_id = current_setting('app.account_id')::uuid`; v transakci
  `SELECT set_config('app.account_id', $1, true)`. Je to pojistka, aplikační filtr zůstává.
- Test: pro každou novou tabulku test „účet A nevidí řádky účtu B".

## 3. Migrace

```sql
-- migrations/0NN_ws_<co>.sql  (sekvenčně od 064, idempotentně)
CREATE SCHEMA IF NOT EXISTS ws;
CREATE TABLE IF NOT EXISTS ws.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  business_id uuid REFERENCES ws.businesses(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text, email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS customers_account_idx ON ws.customers(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uq ON ws.customers(account_id, phone) WHERE phone IS NOT NULL;
ALTER TABLE ws.customers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY customers_account ON ws.customers USING (account_id = current_setting('app.account_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- Nikdy neměň starou migraci ani tabulky v `public`.
- Kolize termínů: `CREATE EXTENSION IF NOT EXISTS btree_gist;` + 
  `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled')`.
- Peníze `numeric(12,2)` + `currency text NOT NULL DEFAULT 'CZK'`.
- Seznam tabulek a sloupců je v `docs/workspace/PLAN.md`, sekce Datový model.

## 4. Server actions

```ts
'use server'
const input = z.object({ requestId: z.string().uuid() })
export async function confirmRequest(raw: unknown): Promise<Result<{ appointmentId: string }>> {
  const ctx = await requireWorkspace()
  const parsed = input.safeParse(raw)
  if (!parsed.success) return fail('Něco v údajích nesedí. Zkuste to prosím znovu.')
  try {
    const id = await confirmRequestTx(ctx, parsed.data.requestId)   // jedna transakce
    revalidatePath('/w')
    void notifyCustomerConfirmed(ctx, id)                           // nikdy neblokuje výsledek
    return ok({ appointmentId: id })
  } catch (e) {
    if (isOverlap(e)) return fail('Tenhle čas už je obsazený. Vyberte prosím jiný.')
    log.error('confirmRequest', { accountId: ctx.accountId, e })
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}
```

Chybové hlášky česky, lidsky, bez technických slov a bez ID.

## 5. Veřejné API pro poptávky

- `GET /api/public/v1/schema?key=pk_…` → služby, kolonky, volné termíny (cache 60 s).
- `POST /api/public/v1/requests`
  - veřejný klíč `pk_…` v těle/URL + kontrola `Origin` proti `web_integrations.allowed_origins`
    (widget, objednávací stránka);
  - nebo tajný klíč `Authorization: Bearer sk_…` (server-server, weby z Claude Code, e-shopy) —
    bez CORS, ověření `timingSafeEqual` proti uloženému hashi (SHA-256 + pepper z env).
- Pořadí: rate limit (vzor `lib/api-rate-limit.ts`) → klíč → Zod z `field_definitions` →
  najít/založit zákazníka (telefon, pak e-mail) → uložit poptávku → `202 { success: true, id }`
  → teprve potom notifikace a e-maily (`after()` / fronta).
- Chyby: `{ success: false, code, error }` s kódy `RATE_LIMITED`, `UNAUTHORIZED`,
  `VALIDATION_ERROR`, `SLOT_TAKEN`, `SUBSCRIPTION_INACTIVE` (poptávka se i tak uloží, jen se
  neposílají e-maily zákazníkovi).
- Idempotence: volitelná hlavička `Idempotency-Key`, uložená 24 h.

## 6. Supabase Auth

- Žádné organizace. Účet = `ws.accounts`, jeden vlastněný účet na uživatele (unikátní index).
- Členství v `ws.members` (`user_id` = Supabase Auth user id). Účet a roli vrací `ws.membership_for_user(user_id)`.
- Přihlášení: e-mail + heslo a Google. Uživatel bez účtu jde na `/w/novy` (obor, název) → Stripe.
- Pozvánky vlastníka: admin (`/dashboard/klienti`) vytvoří kód v `ws.account_invites` (ukládá se jen hash s `WS_KEY_PEPPER`), uplatní ho `ws.redeem_account_invite`. E-mail s přihlašovacím odkazem posílá aplikace přes Resend (Supabase `generateLink`).
- Webhook identity neexistuje. Změny členství se řeší v DB a v aplikaci, ne přes externí události.

## 7. Stripe

- Jeden produkt, `STRIPE_PRICE_MONTHLY`. Checkout session na serveru s
  `client_reference_id = accountId` a `metadata.account_id`.
- `/api/stripe/webhook`: ověřit podpis (`constructEvent` s raw body), uložit `event.id` do
  `ws.stripe_events` (PK) — duplicitní událost skončí na unique a vrátí 200.
  Zpracovat: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
  `invoice.paid`, `invoice.payment_failed`.
- `hasActiveSubscription(accountId)`: `active` nebo `trialing`, nebo `past_due` do 7 dní.
  Jinak režim jen pro čtení (akce vrací `fail('Předplatné je pozastavené…')` s odkazem na Portal).
- Customer Portal pro kartu, faktury a zrušení. Testy v test módu včetně neúspěšné platby.

## 8. E-maily a cron

- Odeslání jen přes frontu `ws.outbound_messages` (status, attempts, next_attempt_at).
- Cron `app/api/cron/ws-*` ověřuje `CRON_SECRET` (vzor `verifyCronSecret` v `lib/api-auth.ts`).
- Přehledy: ranní (7:00 Europe/Prague), týdenní (pondělí), měsíční (1. den); segmenty denně.

## 9. Co převzít z admin kódu (kopírovat, neměnit originál)

| Odkud | Kam | Úprava |
|---|---|---|
| `lib/web-booking.ts`, `lib/api-auth.ts`, `lib/api-rate-limit.ts` | `lib/ws/intake/*` | klíče z DB místo env, business z klíče |
| `lib/prague-time.ts` | `lib/ws/time.ts` | beze změny logiky |
| migrace 008/043/044 (overlap guard) | nová migrace `ws` | per `staff_id` |
| `lib/invoices.ts`, `lib/invoice-ai.ts`, `lib/tax*.ts` | `lib/ws/money/*` | `account_id`, měny zvlášť, daň jen jako odhad |
| `lib/email.ts` | `lib/ws/email/*` | Resend, React Email, Dílky |
| `app/p/[token]`, `app/portal-actions.ts` | `app/(portal)/z/[token]` | tabulky `ws`, vzhled Dílky |
