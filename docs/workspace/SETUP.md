# ZakazIQ Workspace — nastavení databáze

> Jak rozjet schéma `ws` v Neonu a jak spouštět testy oddělení účtů. Pravidla jsou v `AGENTS.md` → B3, proč je to takhle v `memory/memory.md` → R-035, R-036.

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
