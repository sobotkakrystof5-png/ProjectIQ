# ZakazIQ Workspace — nastavení databáze a Stripe

> Jak rozjet schéma `ws` v Supabase Postgresu, jak spouštět testy oddělení účtů a jak nastavit Stripe pro předplatné. Pravidla jsou v `AGENTS.md` → B3 a B5, proč je to takhle v `memory/memory.md` → R-035, R-036, R-038, R-039.

> Založení Supabase projektu, přenos dat z Neonu a Auth nastavení jsou v [`docs/supabase/SETUP.md`](../supabase/SETUP.md). Tady je jen role `ws_app` a migrace schématu `ws`.

## Co v databázi je

- **Schéma `ws`** — tabulky Workspace a navazující funkce/indexy (migrace `064`–`091`). Admin tabulky v `public` se nemění.
- **Role `ws_app`** — jediná role, kterou se aplikace Workspace připojuje (`DATABASE_URL_WS`). Platí pro ni Row Level Security, do `public` nevidí.
- **Vlastník tabulek** (`postgres.<project_ref>`, `DATABASE_URL`) — pouští migrace a čte `ws` pro admin stránku `/dashboard/klienti`. RLS pro něj neplatí.

## První nastavení (jednou)

Pořadí je důležité: role se zakládá **až po migracích**.

### 1. Migrace

```bash
node scripts/apply-migration.js \
  064_ws_zaklad.sql 065_ws_sluzby_pracovnici.sql 066_ws_kolonky_stavy.sql \
  067_ws_zakaznici.sql 068_ws_poptavky_zakazky_terminy.sql 069_ws_vernost.sql \
  070_ws_segmenty.sql 071_ws_penize.sql 072_ws_napojeni_webu.sql \
  073_ws_predplatne_webhooky.sql 074_ws_emaily_upozorneni.sql 075_ws_audit_limity.sql 076_ws_verejne_api.sql \
  077_ws_vernost_skupiny.sql 078_ws_vernost_odmena.sql 079_ws_sluzby_rozestupy.sql \
  080_ws_penize_provoz.sql 081_ws_emaily_odkazy_novinky.sql \
  082_ws_klientsky_portal.sql 083_ws_admin_klienti_novinky.sql 084_ws_gdpr.sql \
  085_ws_kontext_jednim_dotazem.sql 086_ws_indexy_rychlost.sql \
  087_ws_objednavka_pracovnik_a_portal.sql 088_ws_faktury_profil_a_zpet.sql \
  089_ws_rucni_zpravy_zakaznikum.sql 090_ws_rezervace_vice_sluzeb.sql \
  091_ws_skupinove_lekce.sql
```

Jde to i ručně v SQL editoru Supabase rolí vlastníka (`postgres`), obsah souborů po jednom, v tomhle pořadí. Migrace jsou idempotentní, opakované spuštění nic nerozbije.

### 2. Role `ws_app`

```bash
node scripts/ws-create-role.js
```

Skript:
1. založí roli `ws_app` přes SQL s náhodným heslem,
2. pustí `scripts/ws-grants.sql` (práva na `ws`, nic v `public`),
3. zapíše `DATABASE_URL_WS` do `.env.local` — **heslo nevypisuje**,
4. přihlásí se jako `ws_app` a ověří: role nemá `BYPASSRLS`, do `public.projects` nevidí, bez nastaveného účtu nevidí žádný řádek.

> **Role `ws_app` nesmí mít `BYPASSRLS` ani být členem role, která ho má** (`postgres`, `service_role`). Row Level Security by pro ni neplatila a druhá pojistka oddělení účtů by zmizela. Skript `scripts/ws-create-role.js` to kontroluje.

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

Testy Workspace běží proti **PGlite** (Postgres 18 ve WASM, `@electric-sql/pglite`, jen vývojová závislost) — bez Dockeru, bez Supabase, bez sítě. Každý testovací soubor si vytvoří čistou databázi (`lib/ws/__tests__/helpers/ws-pglite.ts`):

1. role `ws_app` a jedna „admin“ tabulka `public.projects`,
2. migrace `0NN_ws_*.sql` + `ws-grants.sql` **dvakrát po sobě** (kontrola idempotence),
3. účty A a B s jedním řádkem v každé tabulce,
4. dotazy aplikace běží jako `ws_app` s `app.account_id`, stejně jako v produkci.

Co se testuje:

| Soubor | Co |
|---|---|
| `ws-schema.test.ts` | idempotence; každá tabulka s daty účtu má RLS a politiku; účet A nevidí, nezmění ani nesmaže nic z účtu B v **žádné** tabulce; složené cizí klíče (cizí zákazník, cizí pracovník); `ws_app` nevidí do `public`; překryv termínů; jedno razítko za návštěvu; duplicitní Stripe událost; unikátní zákazník, číslo faktury, slug |
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

**Lokálně** — Stripe CLI přeposílá události na dev server. Omezený klíč z `.env.local` na `stripe listen` nestačí (403), CLI musí být přihlášené do sandboxu ZakazIQ vlastním profilem: `stripe login --project-name zakaziq` a ke každému příkazu `--project-name zakaziq`.

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed
```

Vypíše podpisový klíč `whsec_…` → `STRIPE_WEBHOOK_SECRET` v `.env.local` (platí, dokud běží `stripe listen` se stejným přihlášením).

**Produkce** — Developers → Webhooks → Add endpoint `https://www.zakaziq.cz/api/stripe/webhook` (s `www` — holá `zakaziq.cz` přesměrovává a Stripe přesměrování nenásleduje), stejné události, podpisový klíč → `STRIPE_WEBHOOK_SECRET` ve Vercelu. Bez klíče route vrací 503 (fail-closed).

### 6. Ruční test (sandbox)

1. **Úspěšná cesta:** landing → Registrace → obor a název → krok 2 → „Pokračovat k platbě“ → karta `4242 4242 4242 4242`, libovolné datum v budoucnu a CVC → návrat na `/w?vitejte=1`. `/w/ucet` ukáže „Zkušební doba“ a datum první platby.
2. **Konec zkušební doby:** `stripe subscriptions update sub_… --trial-end now` → `invoice.paid` → `/w/ucet` „Aktivní“, v Dokladech první doklad.
3. **Neúspěšná platba:** v `/w/ucet` → Spravovat předplatné → změnit kartu na `4000 0000 0000 0341` (uloží se, ale platba selže) → `stripe subscriptions update sub_… --trial-end now` → pruh „Platba se nepovedla“, `/w/ucet` „Platba se nepovedla“. Úpravy dál fungují (lhůta 7 dní).
4. **Po lhůtě:** v DB posunout `past_due_since` o 8 dní zpět, nebo nechat Stripe předplatné zrušit → pruh „Účet jde teď jen prohlížet“, mutační akce vrací hlášku.
5. **Zrušení účtu (R-074):** `/w/ucet` → Zrušit účet → předplatné má ve Stripe „Cancels …“, aplikace dál funguje a ukazuje „Účet se zavře“. `stripe subscriptions cancel sub_…` (simulace konce období) → webhook účet zavře (byznysy archivované, lhůta 30 dní). „Nechat účet“ před koncem období vrátí předplatné.
6. **Zrušení předplatného:** Customer Portal → Zrušit předplatné → `/w/ucet` „Předplatné jste zrušili. Skončí …“. Okamžitě: `stripe subscriptions cancel sub_…` → jen čtení, data zůstanou. „Obnovit předplatné“ otevře Checkout **bez** zkušební doby.

Na delší scénáře (obnova po měsíci, opakované pokusy o platbu) jsou v dashboardu Stripe **Test clocks**.

### 7. Live

Před spuštěním (S19) totéž v live módu: produkt a cena, omezený klíč, Customer Portal, e-maily, šablona faktury, webhook endpoint. Live klíče a `whsec_…` jen do Vercelu (Production). Sandbox klíče zůstávají v Preview a lokálně.

## Peníze (S14): migrace 080

Po 078/079 aplikována `migrations/080_ws_penize_provoz.sql` na produkčním Neonu 2026-10-19. Přidává sloupce, unikátní platbu za fakturu a SECURITY INVOKER funkce; EXECUTE pro ws_app uděluje sama. Nevkládá ukázková data. Při starších duplicitních platbách index bezpečně selže a data se nemažou.

Postup a odhad daní: [MONEY.md](MONEY.md). Pro lokální PDF je potřeba Chrome/CHROME_PATH, pro Vercel kompletní @sparticuz/chromium včetně bin/chromium.br. Nová env není potřeba; AI používá existující serverový ANTHROPIC_API_KEY. Fakturu e-mailem s PDF posílá od S15 fronta (níže).

## E-maily (S15): migrace 081 a Resend

### 1. Migrace

Po 080 ručně aplikovat `migrations/081_ws_emaily_odkazy_novinky.sql` v SQL editoru (dřív Neon, od R-080 Supabase) rolí vlastníka, potom znovu `scripts/ws-grants.sql` (odebere ws_app zápis do `ws.product_news`, dá EXECUTE na `ws.accounts_with_due_messages`). Data nemění. Bez 081 nefungují odkazy z e-mailů, připomínky ani přehledy (fronta potřebuje `dedupe_key`).

### 2. Doména v Resendu

1. Resend → Domains → Add domain `zakaziq.cz`, region EU (Irsko). Odesílá se z adresy `rezervace@zakaziq.cz`, jako jméno odesílatele se ukazuje název firmy klienta.
2. Do DNS `zakaziq.cz` přidat přesně záznamy, které Resend ukáže (hodnoty DKIM jsou pro každý účet jiné):
   - **DKIM**: TXT `resend._domainkey` = veřejný klíč z Resendu.
   - **SPF** (na odesílací poddoméně Resendu, standardně `send`): MX `send` → `feedback-smtp.eu-west-1.amazonses.com` (priorita 10) a TXT `send` = `v=spf1 include:amazonses.com ~all`.
   - **DMARC**: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:info@vizeon.cz` (po pár týdnech bez problémů zpřísnit na `p=quarantine`).
3. Počkat na „Verified“, pak nastavit `WS_EMAIL_FROM=rezervace@zakaziq.cz` (`.env.local`, Vercel Production i Preview). Bez ní fronta nic neodesílá a zprávy čekají — po zapnutí odejdou jen ty, kterým ještě neprošla platnost (připomínky po termínu se zruší).
4. `RESEND_API_KEY` je sdílený s adminem (waitlist). Pro Workspace stačí klíč s právem Sending access na doménu `zakaziq.cz`.

### 3. Webhook nedoručených e-mailů

Resend → Webhooks → Add endpoint `https://www.zakaziq.cz/api/resend/webhook`, události `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`. Podpisový klíč (`whsec_…`) do `RESEND_WEBHOOK_SECRET` (Vercel). Bez něj endpoint vrací 503 a nedoručené e-maily zůstanou ve frontě jako odeslané.

### 4. Cron a ruční test

Cron `/api/cron/ws-email` běží denně v 5:00 UTC (7:00 letního času, 6:00 zimního) s `CRON_SECRET`. Ručně: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/ws-email`. Zkušební e-mail kteréhokoli typu jde poslat z Nastavení › E-maily a upozornění na adresu přihlášeného člena.

## Admin: Klienti a Novinky (S17): migrace 083

Po 082 aplikovat `migrations/083_ws_admin_klienti_novinky.sql` rolí vlastníka a znovu `scripts/ws-grants.sql` (odebere `ws_app` práva na `ws.account_admin_notes`; migrace to dělá i sama). Data nemění. Na Neonu ověřeno čtením 2026-10-10: sloupce novinek, tabulka poznámek s RLS a bez práv `ws_app`.

- `/dashboard/klienti` a `/dashboard/novinky` čtou `ws` přes `DATABASE_URL` (stejná proměnná jako zbytek adminu), nová env není potřeba.
- Pozvání klienta: vlastník vytvoří pozvánku v `ws.account_invites` (kód se ukládá jen jako hash s `WS_KEY_PEPPER`) a přijetí ji uplatní `ws.redeem_account_invite`. E-mail posílá aplikace přes Resend s přihlašovacím odkazem ze Supabase `generateLink`; odkaz vede na `NEXT_PUBLIC_APP_URL` + `/w/pozvanka/[kod]`.
- Klíče pro web potřebují `WS_KEY_PEPPER` jako Nastavení › Napojený web.
- Novinky e-mailem odcházejí přes frontu S15 — bez `WS_EMAIL_FROM` čekají ve frontě.

## GDPR (S18): migrace 084

Po 083 aplikovat `migrations/084_ws_gdpr.sql` rolí vlastníka a znovu `scripts/ws-grants.sql` (dá `ws_app` právo spouštět `ws.anonymize_expired_invoices()` a `ws.purge_closed_accounts()`; migrace to dělá i sama). Data nemění, jen přidá sloupce a funkce.

- Cron `/api/cron/ws-gdpr` je ve `vercel.json`, potřebuje jen `CRON_SECRET` (už existuje). Clerk klíč není potřeba.
- Ověření po migraci: `SELECT proname FROM pg_proc WHERE pronamespace = 'ws'::regnamespace AND proname IN ('erase_customer','close_account','reopen_account','anonymize_expired_invoices','purge_closed_accounts')` vrátí 5 řádků.

## Fakturace (RD10): migrace 088

Po 087, při již aplikované základní migraci peněz 080, byla `migrations/088_ws_faktury_profil_a_zpet.sql` aplikována na produkčním Neonu 2026-10-19. Přidá profil dodavatele k účtu a původ platby k faktuře, nahradí `ws.money_pay` a přidá `ws.money_unpay`. Funkce jsou `SECURITY INVOKER`; migrace jim odebere `PUBLIC` a při existující roli `ws_app` přidá `EXECUTE`. Po založení role nebo při opakovaném nastavení práv spusťte `node scripts/ws-create-role.js` (znovu použije `scripts/ws-grants.sql`). Data nemaže.

RD16 přidává migraci 089 (rozšíření povolených typů zákaznických šablon), RD08 migraci 090 (více služeb v jedné rezervaci) a RD09 migraci 091 (kapacita skupinových lekcí). Migrace 080 a 087–091 byly aplikovány na produkčním Neonu 2026-10-19 v pořadí `080 → 087 → 088 → 089 → 090 → 091`; přítomnost klíčových tabulek, sloupců a funkce `ws.money_unpay()` byla ověřena čtením katalogu 2026-10-19. Migrace 084 byla na produkci aplikována 2026-10-31 (Kryštof) a na testovací DB téhož dne.

