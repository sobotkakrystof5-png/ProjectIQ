# ZakazIQ Workspace — nastavení databáze a Stripe

> Jak rozjet schéma `ws` v Neonu, jak spouštět testy oddělení účtů a jak nastavit Stripe pro předplatné. Pravidla jsou v `AGENTS.md` → B3 a B5, proč je to takhle v `memory/memory.md` → R-035, R-036, R-038, R-039.

## Co v databázi je

- **Schéma `ws`** — všechny tabulky Workspace (migrace `064`–`075`). Admin tabulky v `public` se nemění.
- **Role `ws_app`** — jediná role, kterou se aplikace Workspace připojuje (`DATABASE_URL_WS`). Platí pro ni Row Level Security, do `public` nevidí.
- **Vlastník tabulek** (`neondb_owner`, `DATABASE_URL`) — pouští migrace a čte `ws` pro admin stránku `/dashboard/klienti`. RLS pro něj neplatí.

## První nastavení (jednou)

Pořadí je důležité: role se zakládá **až po migracích**.

### 1. Migrace

```bash
node scripts/apply-migration.js \
  064_ws_zaklad.sql 065_ws_sluzby_pracovnici.sql 066_ws_kolonky_stavy.sql \
  067_ws_zakaznici.sql 068_ws_poptavky_zakazky_terminy.sql 069_ws_vernost.sql \
  070_ws_segmenty.sql 071_ws_penize.sql 072_ws_napojeni_webu.sql \
  073_ws_predplatne_webhooky.sql 074_ws_emaily_upozorneni.sql 075_ws_audit_limity.sql
```

Jde to i ručně v Neon SQL editoru (obsah souborů po jednom, v tomhle pořadí). Migrace jsou idempotentní, opakované spuštění nic nerozbije.

### 2. Role `ws_app`

```bash
node scripts/ws-create-role.js
```

Skript:
1. založí roli `ws_app` přes SQL s náhodným heslem,
2. pustí `scripts/ws-grants.sql` (práva na `ws`, nic v `public`),
3. zapíše `DATABASE_URL_WS` do `.env.local` — **heslo nevypisuje**,
4. přihlásí se jako `ws_app` a ověří: role nemá `BYPASSRLS`, do `public.projects` nevidí, bez nastaveného účtu nevidí žádný řádek.

> **Roli nezakládejte v Neon konzoli.** Role z konzole dostanou členství v `neon_superuser`, který má `BYPASSRLS` — Row Level Security by pro ně neplatila a druhá pojistka oddělení účtů by zmizela.

### 3. Vercel

Hodnotu `DATABASE_URL_WS` zkopírujte z `.env.local` do Vercelu (Production i Preview). Do repa ani do chatu ji nedávejte.

## Další migrace

Nová migrace `ws` (076+) se pouští stejně přes `apply-migration.js`. Nové tabulky dostanou práva pro `ws_app` samy (`ALTER DEFAULT PRIVILEGES` ve `ws-grants.sql`). Po přidání nové `SECURITY DEFINER` funkce nebo tabulky jen pro čtení/zápis (jako `audit_log`) doplňte `ws-grants.sql` a pusťte znovu `node scripts/ws-create-role.js` — heslo nezmění, jen nastaví práva.

## Výměna hesla

```bash
node scripts/ws-create-role.js --rotate
```

Nastaví nové heslo a přepíše `DATABASE_URL_WS` v `.env.local`. Potom aktualizujte hodnotu ve Vercelu a redeployujte. Rotaci zapište do `.claude/security/AUDIT-LOG.md`.

## Testy

```bash
npm test                                  # vše
npx vitest run lib/ws/__tests__           # jen Workspace
```

Testy Workspace běží proti **PGlite** (Postgres 18 ve WASM, `@electric-sql/pglite`, jen vývojová závislost) — bez Dockeru, bez Neonu, bez sítě. Každý testovací soubor si vytvoří čistou databázi (`lib/ws/__tests__/helpers/ws-pglite.ts`):

1. role `ws_app` a jedna „admin“ tabulka `public.projects`,
2. migrace `0NN_ws_*.sql` + `ws-grants.sql` **dvakrát po sobě** (kontrola idempotence),
3. účty A a B s jedním řádkem v každé tabulce,
4. dotazy aplikace běží jako `ws_app` s `app.account_id`, stejně jako v produkci.

Co se testuje:

| Soubor | Co |
|---|---|
| `ws-schema.test.ts` | idempotence; každá tabulka s daty účtu má RLS a politiku; účet A nevidí, nezmění ani nesmaže nic z účtu B v **žádné** tabulce; složené cizí klíče (cizí zákazník, cizí pracovník); `ws_app` nevidí do `public`; překryv termínů; jedno razítko za návštěvu; duplicitní Stripe/Clerk událost; unikátní zákazník, číslo faktury, slug |
| `ws-db-context.test.ts` | `lib/ws/db.ts` (`q`, `wsDb`, transakce, kontext nezůstane viset) a `lib/ws/context.ts` (`requireWorkspace`, `requireBusiness`, role) |
| `ws-templates.test.ts` | každá šablona oboru jde vložit do DB jako `ws_app`, žádné vymyšlené ceny |

**Nová tabulka v `ws`** = doplnit řádek do `seedAccount()` v helperu. Test „testovací data pokrývají každou tabulku" jinak spadne — tak se nestane, že nová tabulka unikne kontrole oddělení účtů. Tabulka bez dat účtů patří do `WS_SYSTEM_TABLES` jen s důvodem (a bez osobních údajů).

## Stripe — předplatné 249 Kč (S08)

Jeden produkt, jedna měsíční cena. Prvních 14 dní zdarma, karta se zadává hned ve Stripe Checkoutu (R-038), zkušební doba běží ve Stripe. Kód: `lib/ws/billing.ts`, `lib/ws/stripe-webhook.ts`, `app/api/stripe/webhook/route.ts`, `app/w/novy` (krok 2), `app/w/predplatne` (návrat z Checkoutu), `app/w/ucet`.

Vývoj běží v **samostatném sandboxu „ZakazIQ“** — ne ve sdíleném test módu a ne v sandboxu jiného projektu (R-039).

### 1. Sandbox a CLI

1. Dashboard Stripe → přepínač účtů vlevo nahoře → **Sandboxes** → **Create sandbox** → název `ZakazIQ`.
2. `stripe login` a v prohlížeči vybrat sandbox ZakazIQ.
3. Ověřit: `stripe whoami --format json` → `display_name` je `ZakazIQ`. Příkazy níže jdou vždy do toho účtu, do kterého je CLI přihlášené.

### 2. Produkt a cena

```bash
stripe products create --name "ZakazIQ" --description "Přehled podnikání pro malé firmy"
stripe prices create --product prod_… --currency czk --unit-amount 24900 \
  --recurring.interval month --nickname "ZakazIQ měsíčně"
```

ID ceny (`price_…`) → `STRIPE_PRICE_MONTHLY`. Bez Stripe Tax a bez `tax_behavior` — provozovatel je neplátce DPH, 249 Kč je konečná cena (R-018). Když se stane plátcem, řeší se nová cena.

### 3. Klíče

- **`STRIPE_SECRET_KEY`** — omezený klíč (`rk_…`), ne `sk_…`. Developers → API keys → Create restricted key, práva:
  - Customers: **Write** · Checkout Sessions: **Write** · Customer portal: **Write**
  - Subscriptions: **Read** · Invoices: **Read**
  - vše ostatní **None**
- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** — `pk_…`. Kód ho zatím nepotřebuje (Checkout je přesměrování), proměnná je připravená.
- Klíče jen do `.env.local` a Vercelu, nikdy do repa ani do chatu.

### 4. Nastavení v dashboardu (sandbox i později live)

| Kde | Co |
|---|---|
| Settings → Business → Public details | Název, adresa, IČO `[DOPLNIT]`, e-mail podpory `[DOPLNIT]` |
| Settings → Branding | Logo ZakazIQ, barva `#23478b` (navy-700) |
| Settings → Payment methods | Karta zapnutá, Apple Pay a Google Pay zapnuté (v Checkoutu bez ověřování domény). Kód `payment_method_types` neposílá, metody řídí tohle nastavení |
| Settings → Billing → Customer portal | Zapnout: změna platební metody, historie faktur, změna fakturačních údajů (adresa, DIČ), **zrušení předplatného ke konci období**. Vypnout: změna tarifu. Odkazy na podmínky a ochranu údajů (`/podminky`, `/ochrana-udaju`) |
| Settings → Billing → Subscriptions and emails | **Připomínka 7 dní před koncem zkušební doby: zapnout** (landing to v Dotazech slibuje). E-mail o neúspěšné platbě s odkazem na Customer Portal: zapnout. Smart Retries: zapnout. Po vyčerpání pokusů: **zrušit předplatné** (účet pak přejde na jen čtení) |
| Settings → Emails | Potvrzení úspěšné platby (účtenka): zapnout |
| Settings → Billing → Invoice template | Patička „Nejsem plátce DPH.“, IČO a adresa provozovatele `[DOPLNIT]`, předčíslí faktur `ZIQ` |

### 5. Webhook

Události: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed` (seznam je i v `HANDLED_EVENTS` v `lib/ws/stripe-webhook.ts`).

**Lokálně** — Stripe CLI přeposílá události na dev server:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed
```

Vypíše podpisový klíč `whsec_…` → `STRIPE_WEBHOOK_SECRET` v `.env.local` (platí, dokud běží `stripe listen` se stejným přihlášením).

**Produkce** — Developers → Webhooks → Add endpoint `https://zakaziq.cz/api/stripe/webhook`, stejné události, podpisový klíč → `STRIPE_WEBHOOK_SECRET` ve Vercelu. Bez klíče route vrací 503 (fail-closed).

### 6. Ruční test (sandbox)

1. **Úspěšná cesta:** landing → Registrace → obor a název → krok 2 → „Pokračovat k platbě“ → karta `4242 4242 4242 4242`, libovolné datum v budoucnu a CVC → návrat na `/w?vitejte=1`. `/w/ucet` ukáže „Zkušební doba“ a datum první platby.
2. **Konec zkušební doby:** `stripe subscriptions update sub_… --trial-end now` → `invoice.paid` → `/w/ucet` „Aktivní“, v Dokladech první doklad.
3. **Neúspěšná platba:** v `/w/ucet` → Spravovat předplatné → změnit kartu na `4000 0000 0000 0341` (uloží se, ale platba selže) → `stripe subscriptions update sub_… --trial-end now` → pruh „Platba se nepovedla“, `/w/ucet` „Platba se nepovedla“. Úpravy dál fungují (lhůta 7 dní).
4. **Po lhůtě:** v DB posunout `past_due_since` o 8 dní zpět, nebo nechat Stripe předplatné zrušit → pruh „Účet jde teď jen prohlížet“, mutační akce vrací hlášku.
5. **Zrušení:** Customer Portal → Zrušit předplatné → `/w/ucet` „Předplatné jste zrušili. Skončí …“. Okamžitě: `stripe subscriptions cancel sub_…` → jen čtení, data zůstanou. „Obnovit předplatné“ otevře Checkout **bez** zkušební doby.

Na delší scénáře (obnova po měsíci, opakované pokusy o platbu) jsou v dashboardu Stripe **Test clocks**.

### 7. Live

Před spuštěním (S19) totéž v live módu: produkt a cena, omezený klíč, Customer Portal, e-maily, šablona faktury, webhook endpoint. Live klíče a `whsec_…` jen do Vercelu (Production). Sandbox klíče zůstávají v Preview a lokálně.
