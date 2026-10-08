# S06 — Databáze a oddělení účtů

## Cíl
Schéma `ws` v Neonu se všemi tabulkami Workspace, vlastní DB role, RLS, `lib/ws/db.ts`,
`lib/ws/context.ts` a testy, že účty navzájem nevidí data. Žádné UI.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`. Přečti `docs/workspace/PLAN.md` sekce
Datový model, Segmenty, Nastavení, E-maily. Projdi stávající `migrations/` (poslední je 063)
a `scripts/apply-migrations.js`.

## Kroky
1. Navrhni migrace `064`–`07x` (rozděl logicky: účty a byznysy · služby, pracovníci, otevírací
   doba · kolonky a stavy · zákazníci · poptávky, zakázky, termíny · věrnost · segmenty ·
   peníze · napojení webu a klíče · předplatné a webhooky · e-maily a notifikace · audit, rate
   limit, idempotence). **Ukaž mi návrh tabulek (názvy, sloupce, klíče, indexy) a počkej na OK.**
2. Po schválení napiš migrace idempotentně podle skillu. Povinné:
   - `account_id` všude, `business_id` u dat byznysu, indexy na ně;
   - `appointments` s `EXCLUDE USING gist` per `staff_id` (rozšíření `btree_gist`);
   - `customers` unikátní (account, telefon) a (account, e-mail), kde nejsou NULL;
   - `loyalty_events` unikátní (card_id, appointment_id) — 1 návštěva = max. 1 razítko;
   - `stripe_events`, `webhook_events`, `idempotency_keys` s PK na ID události;
   - `web_integrations` s `public_key` (unikátní) a `secret_hash`, `allowed_origins text[]`;
   - RLS politiky na `account_id = current_setting('app.account_id', true)::uuid`.
3. Role `ws_app` s právy jen na schéma `ws` (skript `scripts/ws-create-role.sql` + návod v
   `docs/workspace/SETUP.md`; heslo nikdy do repa). Admin role dostane `SELECT` na `ws`.
4. `lib/ws/db.ts` (`sqlWs` z `DATABASE_URL_WS`, transakce s `set_config('app.account_id')`),
   `lib/ws/context.ts` (`requireWorkspace`, `requireBusiness`, `requireRole`; Clerk zatím
   za rozhraním, S07 ho napojí), `lib/ws/result.ts`.
5. **Šablony oborů** `lib/ws/templates/*.ts`: kadeřnictví a kosmetika, zámečnictví, studnařství,
   likvidace azbestu, autoservis, úklid, stavba, vlastní. Každá: služby (příklad bez cen nebo
   s `[DOPLNIT]`), kolonky, stavy s typy, výchozí funkce, hranice segmentů, věrnost.
6. **Testy (Vitest + testovací Neon branch nebo lokální Postgres):** účet A nevidí nic z účtu B
   v žádné tabulce; překryv termínů selže; druhé razítko za stejnou návštěvu selže; duplicitní
   Stripe událost se zpracuje jednou. Jak spouštět, zapiš do `SETUP.md`.

## Hotovo, když
- Migrace projdou dvakrát po sobě bez chyby (idempotence).
- Testy oddělení účtů a pravidel prochází.
- Tabulky v `public` nezměněné (`git diff` migrací < 064 prázdný).

## Konec sezení
`zakaziq-memory` → Konec sezení, schéma shrň do `memory/memory.md` → Rozhodnutí. Commit `ws/db: schéma a oddělení účtů`.
