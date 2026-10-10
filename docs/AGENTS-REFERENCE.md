# ZakazIQ — podrobná pravidla a technický přehled

> **Pravidla a technická fakta pro všechny agenty v repu** — Claude Code, Cursor, Codex, Copilot i lidi. Co projekt je, z čeho se skládá a jaká pravidla platí.
>
> **Než začneš pracovat:** přečti [`memory/index.md`](../memory/index.md) → [`memory/memory.md`](../memory/memory.md) (aktuální stav, rozhodnutí, otevřené problémy) a dodržuj [`memory/pravidla.md`](../memory/pravidla.md) — včetně povinnosti zapsat každou dokončenou změnu do changelogu v `memory/memory.md`.
>
> Společné chování a proces pro Codex i ostatní agenty jsou níže. [`CLAUDE.md`](../CLAUDE.md) přidává automatické importy pro Claude Code. **Když se pravidla v těchto dvou souborech rozcházejí, platí `AGENTS.md` a rozpor oprav.** Stav práce a historie sem nepatří.

> Závazná referenční část [AGENTS.md](../AGENTS.md); čti podle oblasti úlohy. Obsah původního dokumentu je zachován, číslování A/B1–B13 zůstává. Stručný vstup a pravidla čtení jsou v kořeni repa (R-047).

## Komunikace a protokol sezení

Kryštof píše česky, rychle a často s překlepy. Vyber smysl zadání, nedoptávej se na pravopis. Odpovídej česky, stručně a věcně; česky piš i nové komentáře v kódu, commity a paměť. Na začátku jednou větou řekni, co uděláš. Během delší práce informuj o podstatných zjištěních. Na konci uveď výsledek, ověření a případné kroky pro Kryštofa.

**Začátek:**
1. Přečti celý kořenový `AGENTS.md` a `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`; tuto referenci čti podle dotčené oblasti. Codex nepovažuje `@soubor` v `CLAUDE.md` za automatický import; paměť musí otevřít výslovně.
2. Zkontroluj aktuální větev a `git status --short`. Navazuj na rozpracované; cizí změny nepřepisuj, nestaguj ani nevracej. Workspace patří na větev `workspace`; v samostatném worktree použij pracovní větev odvozenou z `workspace`.
3. Přečti plán dotčené oblasti podle indexu. Rozsah Workspace určuje `docs/workspace/PLAN.md`, rozhodnutí v paměti mají přednost. Nezaměňuj pracovní kopie plánů v `new - area of zakaziq/` za zdroj pravdy.
4. Načti skilly uvedené v zadání a skilly příslušné oblasti. Před bezpečnostní změnou čti `.claude/security/STATE.md` a relevantní rozhodnutí (B13).

**Během práce:**
- Před úpravou čti dotčený kód. Zadání proveď až do ověřeného výsledku; běžné vratné kroky v jeho rozsahu nevyžadují nové schválení.
- Nové produktové rozhodnutí mimo zadání, změnu záměrného rozhodnutí v paměti, destruktivní operaci nebo nasazení nejdřív předlož Kryštofovi. Už udělený souhlas platí dál.
- Migrace jsou nové a idempotentní. Spuštění proti skutečné DB, seed a změny externích služeb vyžadují výslovné zadání nebo předchozí souhlas; příprava SQL a ověření v PGlite jsou běžná součást práce.
- Před commitem větší změny proveď kontroly B12. Když běží `next dev`, použij `npm run build:check`, aby se nerozbila jeho `.next`. `npm run lint` zatím spouští průvodce; pro typy používej `npx tsc --noEmit`.
- Výsledek ověření hlas přesně: spuštěné kontroly, skutečné chyby a co nebylo ověřeno. Chybějící přístup nenahrazuj vymyšlenými výsledky.

**Konec každé dokončené změny:**
1. Zapiš changelog do `memory/memory.md` podle pravidel paměti; aktualizuj stav, rozhodnutí a otevřené problémy jen tam, kde se změnily.
2. Aktualizuj popis změněných technických faktů v `AGENTS.md`; nový dokument přidej do `memory/index.md`.
3. Změny skillů a bezpečnostní paměti synchronizuj příkazem níže a ověř shodu. Paměť patří do stejného commitu jako změna; commituj pouze vlastní soubory podle sekce Git.

## Codex — projektové prostředí

Konfigurace a postup: [`docs/CODEX.md`](../docs/CODEX.md). `.codex/config.toml` ponechává limit instrukcí 96 KiB jako rezervu. Kořenový `AGENTS.md` je stručný; před úpravou čti příslušnou část této závazné reference, včetně B13 při bezpečnostní práci.

| Co | Kde / příkaz |
|---|---|
| Příprava nového worktree | `bash scripts/codex-setup.sh` (Node.js 24+, `npm ci`, žádné migrace ani kopírování klíčů) |
| Akce lokálního prostředí | `.codex/environments/environment.toml` — vývoj na portu 3001, testy, typy, izolovaný build, kontrola kontextu |
| Projektové skilly pro Codex | `.agents/skills/`; Claude Code používá identický obsah v `.claude/skills/` |
| Globální skilly pro Codex | `~/.agents/skills/` — nejsou součást repa ani automaticky přenositelné na jiný počítač |
| Bezpečnostní paměť pro Codex | `.agents/security/` — identická kopie společného zdroje `.claude/security/` |
| Synchronizace kontextu | `node scripts/sync-agent-context.mjs --write`; kontrola `node scripts/sync-agent-context.mjs --check` |

Zdroj pro synchronizaci je `.claude/skills/` a `.claude/security/`; měň je a pak synchronizuj do `.agents/`. Záznamy mají jednu historii pro oba nástroje. Kopie se neupravují nezávisle (R-046). Znění skillů zůstává identické i tam, kde zmiňuje Claude Code; použij jeho postup s dostupnými nástroji Codexu. Nedostupný nástroj nebo konektor neznamená, že akce proběhla.

V novém worktree nejsou ignorované `.env.local` ani `node_modules`. Používej jeho vlastní závislosti a build; klíče a připojení nastav jen pro potřebnou práci podle `.env.example` a `docs/workspace/SETUP.md`. Testy Workspace používají PGlite, nepotřebují produkční DB. Nezastavuj server jiné aplikace kvůli obsazenému portu; vyber jiný volný port a ověř návratové URL přihlášení a plateb.

Projektové skilly:

| Skill | Kdy |
|---|---|
| `zakaziq-design-dilky` | jakákoli UI práce mimo admin konzoli |
| `zakaziq-workspace-backend` | DB, migrace, server actions, API, Clerk, Stripe, příjem poptávek |
| `zakaziq-ux-texty-cs` | každý text aplikace, který uvidí uživatel nebo zákazník |
| `zakaziq-memory` | navázání na stav projektu a zápis dokončené práce |

Bezpečnostní skilly viz B13; marketing a SEO používají také `humanize-text-cs`, `frontend-design`, `seo` a `seo-quality-principles` podle úlohy. Dostupnost globálních skillů vždy ověř.

Soubor má dvě části: **[A — Admin konzole](#část-a--admin-konzole)** (běžící osobní systém, popis kódu) a **[B — ZakazIQ Workspace](#část-b--zakaziq-workspace)** (SaaS ve výstavbě, pravidla pro nový kód). Společné jsou hranice v repu níže a sekce na konci (git, paměť, nikdy).

---

## Hranice v repu

Jedna Next.js aplikace, tři části: **admin konzole** (NextAuth, jeden admin), **ZakazIQ Workspace** (Clerk, firmy) a **landing page** (veřejná).

| Oblast | Složky | Pravidlo |
|---|---|---|
| Admin konzole | `app/dashboard`, `app/alteno`, `app/hub`, `app/(auth)`, `app/p`, `app/h`, `app/api/*` mimo `public/v1`, `ws`, `stripe`, `clerk`, `app/*-actions.ts`, `components/*.tsx` (kořen), `lib/*.ts` (kořen) | **neměnit**. Výjimky jen s výslovným souhlasem v zadání sezení (např. nová stránka `/dashboard/klienti`). |
| Landing page | `app/(marketing)/`, `components/marketing/` | nová (`app/page.tsx` smazán, R-034) |
| Workspace | `app/w/`, `components/ws/`, `lib/ws/` | nová |
| Veřejné části Workspace | `app/r/` (objednávací stránka `/r/[slug]`), `app/embed/` (widget `/embed/[slug].js`), `app/z/` (klientský portál `/z/[token]`) | nové (R-016) |
| API Workspace | `app/api/ws/`, `app/api/public/v1/`, `app/api/stripe/`, `app/api/clerk/` | nové |
| UI kit | `components/ui/` (shadcn/ui, tokeny Dílky) | nový, admin ho nepoužívá |
| DB | `migrations/064_*.sql` a dál | jen nové migrace, staré se nemění |
| Bezpečnost (celé repo) | `middleware.ts`, `next.config.mjs` (hlavičky), `lib/security/`, `public/.well-known/`, `.github/workflows/security.yml`, `.claude/security/`, `.agents/security/` | mění se jen spolu se zápisem do `.claude/security/` a synchronizací do `.agents/security/` (B13) |

Co se z adminu přebírá (příjem poptávek, časové helpery, faktury, daně, e-maily, portál), se **zkopíruje** do `lib/ws/` a tam zobecní. Původní soubor zůstává netknutý.

---

# Část A — Admin konzole

> Kryštofův osobní produkční systém (VIZEON, ALTENO, Hub, klientský portál). **Úplný popis kódu adminu je v [`docs/admin/AGENTS-ADMIN.md`](../docs/admin/AGENTS-ADMIN.md)** — tech stack, databázový model a katalog tabulek, struktura aplikace, server actions, routy, API, crony, stránky, stavy zakázky, e-maily, bezpečnost, UX pravidla a poznámky pro AI. Přečti ho před jakoukoli změnou adminu (R-042). Tady zůstávají jen příkazy a env proměnné, které platí pro celé repo.

Admin v kostce: Next.js 14 App Router, Neon přes `sql` tag z `lib/db.ts` (bez ORM), NextAuth s jedním adminem, e-maily přes Gmail SMTP v `lib/email.ts`, Vercel Hobby (crony max 1× denně). Neon vrací `date`/`timestamptz` jako `Date`, ne string. Částky v CZK a EUR se nikdy nesčítají.

### Příkazy

```bash
npm run dev      # lokální vývoj (http://localhost:3000)
npm run build    # produkční build — musí projít před commitem větší změny
npm run build:check   # totéž v dočasné kopii repa — když běží `next dev` (sdílí .next, build by ho rozbil)
npm test         # vitest run
npm run lint     # next lint
node scripts/apply-migration.js 063_project_notes_meeting_log.sql   # aplikace migrace na DATABASE_URL z .env.local
node scripts/ws-create-role.js   # Workspace: role ws_app + práva + DATABASE_URL_WS do .env.local (docs/workspace/SETUP.md)
node scripts/ws-seed.mjs <slug> --ano   # Workspace: ukázková data pro obrazovku Dnes (--smazat --ano je smaže)
```

### Env proměnné

Kompletní a komentovaný seznam je v **`.env.example`** — to je zdroj pravdy, udržuj ho v sync. Přehled:

| Skupina | Proměnné |
|---------|----------|
| DB + auth | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` |
| Workspace DB | `DATABASE_URL_WS` (role `ws_app`, jen schéma `ws`, pod RLS — čte `lib/ws/db.ts`; zakládá `scripts/ws-create-role.js`) |
| Workspace přihlášení | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (publikovatelný, z něj i host Clerku v CSP), `CLERK_SECRET_KEY` (jen server), `CLERK_WEBHOOK_SECRET` (`/api/clerk/webhook`, bez něj 503). Lokálně přes `clerk env pull` (aplikace propojená `clerk link`) |
| Workspace klíče webů | `WS_KEY_PEPPER` (min. 32 znaků, jen server) — pepř pro HMAC tajných klíčů napojení a hash klíčů rate limitu. Bez něj tajné klíče nejde vytvořit ani ověřit (API 503) |
| Workspace platby | `STRIPE_SECRET_KEY` (omezený `rk_…`, jen server), `STRIPE_WEBHOOK_SECRET` (`/api/stripe/webhook`, bez něj 503), `STRIPE_PRICE_MONTHLY` (cena 249 Kč), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (zatím nepoužitý). Postup `docs/workspace/SETUP.md` → Stripe |
| Emaily | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `VIZEON_GMAIL_USER`, `VIZEON_GMAIL_APP_PASSWORD`, `VIZEON_ADMIN_EMAIL`, `RESEND_API_KEY` (jen waitlist launch emaily ve Startupu) |
| Konzultace | `ADMIN_PHONE`, `GOOGLE_MEET_LINK`, `TEAMS_MEETING_LINK` |
| Veřejná API | `VIZEON_API_KEY`, `ALTENO_API_KEY`, `ALTENO_LEAD_WEBHOOK_SECRET`, `N8N_API_KEY`, `VIZEON_AGENT_API_KEY`, `INVOICES_API_KEY` |
| Crony | `CRON_SECRET` |
| Hub | `LERNSAX_USER`, `LERNSAX_PASS`, `BESTESCHULE_USER`, `BESTESCHULE_PASS`, `BESTESCHULE_URL`, `CHROME_PATH` (dev), `ANTHROPIC_API_KEY` |

Nejdůležitější s popisem:

```env
DATABASE_URL=             # Neon connection string (pooled)
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=             # http://localhost:3000 (dev) / https://... (prod)
ADMIN_EMAIL=              # e-mail pro přihlášení i pro notifikace o nových rezervacích
ADMIN_PASSWORD_HASH=      # bcrypt hash hesla (generuj: node -e "require('bcryptjs').hash('heslo',12).then(console.log)")

GMAIL_USER=               # Výchozí odesílací účet — přihlášení, ALTENO, Hub (vše, co není VIZEON)
GMAIL_APP_PASSWORD=       # App password (Google Account → Security → App passwords)

VIZEON_GMAIL_USER=        # info@vizeon.cz — vlastní odesílací schránka VIZEONu (klientské i admin emaily)
VIZEON_GMAIL_APP_PASSWORD= # App password pro VIZEON_GMAIL_USER. Chybí-li, VIZEON emaily spadnou zpět na GMAIL_USER
VIZEON_ADMIN_EMAIL=       # info@vizeon.cz — cíl admin notifikací pro VIZEON (nezávislé na přihlašovacím ADMIN_EMAIL)

ADMIN_PHONE=               # Telefon pro WhatsApp/hovor, bez mezery a bez + (např. 420601234567)
GOOGLE_MEET_LINK=          # Permanentní Google Meet link
TEAMS_MEETING_LINK=        # Teams meeting link

VIZEON_API_KEY=            # Klíč pro veřejný booking endpoint /api/public/booking (vizeon.cz)
ALTENO_API_KEY=            # Klíč pro veřejný booking endpoint /api/public/booking/alteno (alteno.cz)
```

Přidáváš novou env proměnnou → zapiš ji do `.env.example` **i** do tabulky výše a připomeň uživateli, že ji musí nastavit ve Vercelu.

---


---

# Část B — ZakazIQ Workspace

> SaaS ve výstavbě (R-014). Sekce níže jsou **pravidla pro nový kód**, ne popis existujícího — až kód vznikne, doplň sem konkrétní tabulky, routy a env stejně jako v části A. Zdroj pravdy pro rozsah: `docs/workspace/PLAN.md` (export z Claude Docs; při rozporu platí Rozhodnutí v `memory/memory.md`).

## B1. Produkt v jednom odstavci

ZakazIQ Workspace je SaaS pro malé firmy, které dostávají poptávky (kadeřnictví, kosmetika, zámečnictví, studnařství, likvidace azbestu, autoservis, úklid, stavba). Poptávka z webu klienta se sama objeví v kalendáři, potvrdí se jedním klikem, zákazník dostane e-mail, po návštěvě razítko na věrnostní kartu. K tomu zákazníci a segmenty, zakázky s vlastními stavy a kolonkami, faktury, příjmy, odhad daní a měsíční přehled. Jeden tarif 249 Kč měsíčně. Kryštof klientům staví weby (v Claude Code) a napojuje je na Workspace.

## B2. Tech stack

Next.js 14 App Router · React 18 · TypeScript strict · Tailwind CSS + shadcn/ui (`components/ui/`) · Neon Postgres (`@neondatabase/serverless`) · Clerk (klienti) · NextAuth (jen admin) · Stripe Billing · Resend + React Email · Zod + react-hook-form · Framer Motion · Lucide (`strokeWidth={1.5}`) · Vitest · Vercel (+ Cron).

- Nové závislosti jen s důvodem zapsaným do `memory/memory.md` → Rozhodnutí.
- UI kit stojí na Radix UI (`@radix-ui/react-*`), `class-variance-authority`, `cmdk` (⌘K) a `react-day-picker` (kalendář) — R-028.
- E-maily Workspace jdou přes Resend (B7). Admin zůstává na Gmail SMTP (R-004) — `lib/email.ts` Workspace nepoužívá.
- Upgrade Next.js na 15 není součást výstavby, je to samostatný krok po spuštění.
- Env proměnné Workspace jsou předem (prázdné) v `.env.example` v bloku `# --- ZakazIQ Workspace ---` (S00). Do tabulky env v části A se zapisují až s kódem, který je čte; další nové proměnné do obou míst zároveň.

## B3. Data a oddělení klientů

- Všechny tabulky Workspace jsou ve schématu `ws`, každá má `account_id`, tabulky byznysu i `business_id`. Admin tabulky ve `public` se nemění.
- Workspace kód se připojuje přes `DATABASE_URL_WS` (role bez přístupu k `public`). Admin stránka `/dashboard/klienti` čte `ws` jen pro čtení.
- **Každá** server action, route handler a server komponenta Workspace začíná `const ctx = await requireWorkspace()` a každý dotaz filtruje `account_id = ctx.accountId`. `account_id` se nikdy nečte z formuláře ani z URL; `business_id` z URL se vždy ověří proti `ctx.accountId`.
- Row Level Security v Postgresu je druhá pojistka, ne náhrada aplikační kontroly.
- Hodnoty vlastních kolonek jsou v `jsonb` a validují se Zodem sestaveným z `field_definitions`.
- Kolize termínů řeší DB (`EXCLUDE USING gist` na `tstzrange` per pracovník), nikdy „zkontroluj a vlož" (stejný princip jako R-005). Chybu `23P01`/`23505` převeď na srozumitelnou hlášku.
- Čas vždy přes `lib/ws/time.ts` (zkopírováno z `lib/prague-time.ts`), Europe/Prague.
- Peníze v haléřích (`integer`) nebo `numeric(12,2)`, měny se nikdy nesčítají dohromady.
- Migrace jsou idempotentní (`IF NOT EXISTS`, `DO $$ … $$` guardy), číslované sekvenčně od 064.

### Jak je to v kódu (S06, R-035)

| Co | Kde |
|---|---|
| Schéma `ws` — 34 tabulek | migrace `064_ws_zaklad` … `076_ws_verejne_api` (přehled níže) |
| Role `ws_app` a její práva | `scripts/ws-create-role.js` (zakládá přes SQL, nikdy v Neon konzoli — `neon_superuser` má BYPASSRLS), `scripts/ws-grants.sql`, postup `docs/workspace/SETUP.md` |
| Přístup do DB | `lib/ws/db.ts`: `wsDb(ctx)` (tag + `.batch()`), každé volání = transakce `set_config('app.account_id')` + dotazy přes Neon HTTP; `wsSystem` jen pro `SECURITY DEFINER` funkce a systémové tabulky; `q` pro sestavení dotazu do dávky; `isOverlapError` (23P01), `isUniqueViolation` (23505). Neon HTTP volá `fetch` s `cache: 'no-store'` — jinak by odpovědi DB skončily v data cache Nextu |
| Kontext | `lib/ws/context.ts`: `requireWorkspace()` (účet přes `ws.account_by_clerk_org`, role z Clerku `org:admin` → `owner`), `requireBusiness(ctx, slug)` (cizí = 404), `requireRole`/`hasRole`; přihlášení přes Clerk `auth()` (aktivní organizace = účet), testy si identitu podstrčí `setWsAuthProvider` |
| Cesty | `lib/ws/paths.ts` — `/w`, `/w/prihlaseni`, `/w/registrace`, `/w/novy` (bez závislostí, importuje i middleware) |
| Založení účtu | `lib/ws/onboarding.ts`: `createAccountWithBusiness()` — účet, vlastník, byznys a šablona oboru v jedné transakci pod RLS s nově vygenerovaným `account_id`; obsazený slug zkusí s koncovkou, existující organizace vrátí její účet; `accountIdForOrg()`, `slugify()` |
| Výsledek akcí | `lib/ws/result.ts` (`ok`, `fail`, `Result<T>`) |
| Šablony oborů | `lib/ws/templates/` — 8 oborů, `templateSeedQueries()` naplní nový byznys (funkce, služby bez cen, kolonky, stavy, hranice skupin, vypnutá věrnost) |
| Testy | `lib/ws/__tests__/ws-*.test.ts` proti PGlite (R-036) |

Pravidla schématu:
- RLS politika `account_isolation` (`account_id = ws.current_account()`) na každé tabulce s daty účtu, přes `ws.enable_account_rls()`. `ws.current_account()` má `NULLIF` — po transakci je nastavení `''`, ne NULL.
- Vazby jsou **složené cizí klíče** `(account_id, x_id) → x(account_id, id)` (kontrola cizího klíče RLS obchází). Nová tabulka s vazbou na jinou to dodržuje, cílová tabulka má `UNIQUE (account_id, id)`.
- Systémové tabulky bez RLS a bez osobních údajů: `stripe_events`, `webhook_events`, `rate_limits`. Nic dalšího bez důvodu.
- Kolize termínů: `appointments_no_overlap` (`EXCLUDE USING gist` per `staff_id`, mimo `cancelled`). Blokace/dovolená = `appointments.kind = 'block'`.
- `updated_at` hlídá trigger `touch_updated_at` (`ws.add_touch_trigger()`), není potřeba ho nastavovat v akci.
- `ws_app` nemá `UPDATE`/`DELETE` na `audit_log`.
- Nová tabulka = řádek v `seedAccount()` v `lib/ws/__tests__/helpers/ws-pglite.ts`, jinak spadne test oddělení účtů.

| Migrace | Tabulky |
|---|---|
| 064 | `accounts` (Clerk org, IČO, `stripe_customer_id`, `trial_ends_at` — nepoužívá se, R-038), `members`, `businesses` (slug unikátní globálně), `business_modules` |
| 065 | `services`, `staff`, `service_staff`, `opening_hours` |
| 066 | `field_definitions`, `stages` |
| 067 | `customers` (účet, ne byznys; telefon E.164 a e-mail malými unikátní v účtu) |
| 068 | `requests` (`field_values`, `contact`, `source`, `external_id`), `jobs` (`public_token` pro `/z`), `appointments` |
| 069 | `loyalty_programs`, `loyalty_cards`, `loyalty_events` (1 návštěva = max. 1 razítko) |
| 070 | `segment_rules`, `customer_segments` (zákazník × byznys), `segment_history` |
| 071 | `invoices` (číslo unikátní v účtu), `transactions`, `tax_settings` |
| 072 | `web_integrations` (`public_key`, `secret_prefix` + `secret_hash`, `allowed_origins`) |
| 073 | `subscriptions`, `stripe_events`, `webhook_events` |
| 074 | `message_settings`, `outbound_messages` (fronta), `notifications` |
| 075 | `audit_log`, `idempotency_keys`, `rate_limits` |
| 076 | `requests.is_test`, `intake_log` (záznam příjmu poptávek, 30 dní), funkce `ws.integration_by_public_key`, `ws.integration_by_secret_prefix`, `ws.business_by_public_slug` (S11) |

## B4. Přihlášení a role

- Clerk: Organization = účet (firma, jedno IČO, předplatné). Role `owner`, `staff`.
- Přihlášení bez hesla: e-mailový kód nebo Google.
- Jedna doména: landing na `/`, aplikace na `/w/*`, jedna Clerk instance (R-017). Cesty veřejných částí viz Hranice v repu (R-016).
- Jeden `middleware.ts`: veřejné cesty; Workspace přes Clerk; admin cesty přes NextAuth token jako dnes. Admin přihlášení zůstává na `/login`, odkaz „Admin" ve footeru landing page.
- Webhook Clerk (`/api/clerk/webhook`, ověření podpisu) synchronizuje účty a členy do `ws`.

### Jak je to v kódu (S07, R-037)

| Co | Kde |
|---|---|
| SDK | `@clerk/nextjs` **6.39.7** (poslední s podporou Next 14; v7 chce Next 15) + `@clerk/localizations` (`csCZ`) |
| Middleware | `middleware.ts`: `clerkMiddleware` jen pro `/w` a `/api/ws`; bez přihlášení `auth.protect()` → `/w/prihlaseni` (veřejné jen přihlášení, registrace a `/w/_design`). Admin a landing Clerk vůbec nespouští. CSP s nonce zůstává (`withCsp` uvnitř Clerku) |
| Provider | `app/w/layout.tsx`: `ClerkProvider dynamic` (nonce z `x-nonce`), česky, `telemetry={false}`, po přihlášení `/w`, po registraci `/w/novy`. Kořenový `app/layout.tsx` beze změny |
| Vzhled | `components/ws/auth/clerk-appearance.ts` (třídy Tailwindu s tokeny Dílků, `!`), rozložení `components/ws/auth/auth-shell.tsx` |
| Stránky | `/w/prihlaseni/[[...prihlaseni]]`, `/w/registrace/[[...registrace]]` (catch-all kvůli krokům Clerku), `/w/novy` (průvodce), `/w` (přesměruje na `/w/[byznys]`, kostra a Dnes viz B9 „Jak je to v kódu (S09)“) |
| Průvodce Nový byznys | `app/w/novy/actions.ts` (`createBusiness`: Zod, `auth()`, organizace přes `lib/ws/clerk-orgs.ts`, pak `createAccountWithBusiness`), UI `components/ws/onboarding/` (rozložení C5, náhled šablony z `industry-summaries.ts`). Krok 2 = platba (S08) |
| Organizace | `lib/ws/clerk-orgs.ts` (`server-only`): má-li uživatel organizaci s účtem, nový účet se nezakládá (R-026) a průvodce ji jen aktivuje (`ActivateAccount`, Clerk po přihlášení organizaci sám nevybere); organizace bez účtu (spadlé založení) se použije znovu |
| Webhook | `app/api/clerk/webhook/route.ts` (`verifyWebhook` = Svix podpis + čerstvost, limit 256 kB) → `lib/ws/clerk-webhook.ts`: `organization.updated` (název účtu), `organizationMembership.created/updated/deleted` (`ws.members`, `org:admin` → `owner`). Účet nezakládá — to dělá jen průvodce. `organization.deleted` data nemaže. Idempotence `ws.webhook_events` (`processed_at`) |
| Testy | `lib/ws/__tests__/ws-onboarding.test.ts` (založení, dva účty se nevidí, opakování, webhook, podpis route) |

- Instance Clerku (dev): přihlášení jen e-mailový kód a Google, bez hesla, telefonu a uživatelského jména; organizace zapnuté, max. 5 členů na organizaci (limit Clerku). Nastavení přes `clerk config pull/patch`, ne ručně v dashboardu.
- Odhlášení vlastním tlačítkem (`SignOutButton`), ne `UserButton` — jeho okno správy účtu se vykresluje mimo `[data-app="ws"]` bez tokenů.

## B5. Platby

- Jeden produkt, jedna měsíční cena `STRIPE_PRICE_MONTHLY`: **249 Kč konečná cena** (provozovatel je neplátce DPH, R-018).
- Zkušební doba **14 dní zdarma s kartou**: karta se zadává hned v průvodci (Stripe Checkout, trial ve Stripe), první platba po 14 dnech. Zkušební doba jen jednou na účet. Bez předplatného jen čtení (R-038, nahrazuje R-019).
- V ceně **1 byznys a neomezeně pracovníků**. Datový model a URL počítají s více byznysy na účet (`business_id`, `/w/[byznys]`), přidání dalšího byznysu je v UI zatím vypnuté (R-026).
- Checkout se zakládá na serveru, `account_id` v metadatech. Customer Portal pro změny a zrušení.
- Webhook ověřuje podpis, každou událost uloží do `ws.stripe_events` a zpracuje jen jednou.
- Přístup řídí `hasActiveSubscription(accountId)`. Po neúspěšné platbě 7 dní lhůta, pak jen čtení. Data se nikdy nemažou, poptávky z webu se ukládají dál.

### Jak je to v kódu (S08, R-038, R-039)

| Co | Kde |
|---|---|
| SDK | `stripe` **22.6.2**, API `2026-08-26.dahlia` (verze SDK, nemění se samostatně). Klient `getStripe()` v `lib/ws/stripe.ts` (`server-only`), omezený klíč `rk_…` |
| Stav přístupu | `lib/ws/billing.ts`: `getBillingState(accountId)` → `access`: `none` (Checkout nikdy nedokončen → průvodce krok 2), `trialing`, `active`, `grace` (`past_due` do 7 dní od `past_due_since`), `read_only` (zrušeno, nezaplaceno, po lhůtě). `hasActiveSubscription()`, `canWrite()`, čistá `billingStateFrom()` |
| Jen čtení | Mutační server action začíná `const blocked = await assertWritable(ctx); if (blocked) return blocked`. Příjem poptávek z webu (S11) to **nevolá** |
| Checkout | `createCheckoutSession(ctx, { cancelPath })`: zákazník Stripe jednou na účet (`ws.accounts.stripe_customer_id`, idempotentní klíč), `trial_period_days: 14` jen bez předchozího předplatného, `payment_method_collection: 'always'`, `locale: 'cs'`, bez `payment_method_types` (metody řídí dashboard) a bez `automatic_tax` (neplátce). Při `past_due` nový Checkout nezakládá (dvojí platba), pošle do Portalu |
| Portal, doklady | `createPortalSession(ctx)` (návrat `/w/ucet`), `listInvoices(ctx)` (12 posledních dokladů ze Stripe) |
| Synchronizace | `syncSubscription(id)` vždy znovu načte předplatné ze Stripe a upsertne `ws.subscriptions` (konec období z položky předplatného, `past_due_since` drží první selhání). Účet z `metadata.account_id` předplatného, jinak zákazníka |
| Webhook | `app/api/stripe/webhook/route.ts` (syrové tělo, `constructEvent`, limit 512 kB, bez klíče 503) → `lib/ws/stripe-webhook.ts` (`HANDLED_EVENTS`, idempotence `ws.stripe_events`) |
| Stránky | `/w/novy` krok 2 (`components/ws/onboarding/subscribe-step.tsx`), `/w/predplatne?session_id=…` (návrat z Checkoutu: ověří, že relace patří účtu, synchronizuje, pak `/w?vitejte=1`), `/w/ucet` (jen vlastník: stav, Portal, doklady). Akce `app/w/ucet/actions.ts` (`startCheckout`, `openBillingPortal`), tlačítko `components/ws/billing/billing-action-button.tsx`, pruh `components/ws/billing/billing-banner.tsx` (`grace`, `read_only`) |
| Nastavení Stripe | `docs/workspace/SETUP.md` → Stripe (sandbox ZakazIQ, cena, práva klíče, Portal, e-maily, webhook, ruční test) |
| Testy | `lib/ws/__tests__/ws-billing.test.ts` (stavy, přechody, idempotence, účty se nepřepíšou, Checkout, podpis route) |

- `ws.accounts.trial_ends_at` (migrace 064) se po R-038 nepoužívá — zkušební doba je ve Stripe.

## B6. Příjem poptávek z webů

- `GET /api/public/v1/schema` a `POST /api/public/v1/requests`.
- Dva druhy klíčů na byznys: veřejný (widget, kontrola domény přes CORS) a tajný (server-server, posílá se v `Authorization: Bearer`). Tajný klíč se ukládá jen jako hash.
- Validace podle kolonek byznysu, rate limit, přiřazení zákazníka podle telefonu/e-mailu, notifikace, e-mail. Uložení poptávky nesmí nikdy shodit selhání e-mailu ani notifikace.
- Chyby vrací `{ success: false, code, error }`, `error` česky a srozumitelně.

### Jak je to v kódu (S11, R-045)

Popis API s příklady pro weby klientů: **`docs/workspace/API.md`** (zdroj pro skill `zakaziq-napojeni`).

| Co | Kde |
|---|---|
| Klíče | `lib/ws/keys.ts`: `pk_live_` + 24 znaků (v prohlížeči), `sk_live_<prefix 10>_<32>` (ukáže se jednou; v DB `secret_prefix` + HMAC-SHA256 s `WS_KEY_PEPPER`, porovnání `timingSafeEqual`). `ensureIntegration` (jedno napojení na byznys, zakládá se otevřením Nastavení › Napojený web), `rotateSecretKey`, `rotatePublicKey`, `setAllowedOrigins`, `resolvePublicKey`/`resolveSecretKey` přes `SECURITY DEFINER` funkce |
| Příjem | `lib/ws/intake/intake.ts`: `ingestRequest(source, body)` — jediná cesta pro API, widget, objednávací stránku i „Ověřit napojení“. Konfigurace byznysu → Zod (`requestInputSchema` + `fieldValuesSchema` z `lib/ws/fields.ts`) → služba a čas (`SLOT_TAKEN` jen v režimu `slots`) → `Idempotency-Key` (`ws.idempotency_keys`) → zákazník (`findOrCreateCustomer`, ne u `test`) → uložení (`external_id` = bez duplicit) → potom záznam, upozornění, `last_used_at`, každé ve vlastním try/catch. Neaktivní předplatné = 202 + `notice` (R-045) |
| Čas | `lib/ws/intake/slots.ts` (čistá funkce): režim `slots` (otevírací doba / směny, termíny a blokace pracovníka, blokace celého byznysu, krok 30 min, nejdřív za 60 min, 21 dní), `free` (bez otevírací doby — zákazník navrhne, R-045), `none` (bez kalendáře). Konstanty `BOOKING` v `intake.ts` |
| HTTP | `lib/ws/intake/http.ts`: `authenticate` (tajný klíč jen bez `Origin`, veřejný jen z `allowed_origins`; nepovolená doména jde do záznamu), `respond` (CORS jen ověřenému originu), `readJson` (64 kB), `businessBySlug` |
| Rate limit | `lib/ws/intake/rate-limit.ts` nad `ws.rate_limits` (pevné okno, klíč = HMAC hodnoty, ne IP): 20/min na IP, 300/h na byznys, schema 120/min, objednávací stránka 8/10 min, ověření 10/10 min |
| Routy | `app/api/public/v1/requests/route.ts` (POST, OPTIONS), `app/api/public/v1/schema/route.ts` (GET, OPTIONS; tvar `lib/ws/intake/schema.ts`, cache 60 s) |
| Objednávací stránka | `app/r/layout.tsx` (Dílky, `force-dynamic`), `app/r/[slug]/page.tsx`, akce `app/r/[slug]/actions.ts` (`getOrderSlots`, `submitOrder` — byznys jen ze slugu), UI `components/ws/order/order-flow.tsx` (služba → termín → kontakt → hotovo). Barva byznysu přes `lib/ws/accent.ts` (jen s kontrastem ≥ 4.5 k bílé) |
| Widget | `app/embed/[file]/route.ts` (`/embed/<slug>.js`, cache 5 min), zdroják `lib/ws/intake/widget-script.ts` (bez frameworku, shadow DOM, jen `textContent`, `data-mode="inline"`, `data-label`) |
| Rámování `/r` | `middleware.ts` → `lib/ws/intake/embed-origins.ts` (povolené domény ze slugu, cache 60 s v instanci, chyba = jen `'self'`) |
| Nastavení › Napojený web | `/w/[byznys]/nastaveni/web` (jen vlastník): prompt pro Claude Code (`lib/ws/intake/claude-prompt.ts`), tajný klíč, Ověřit napojení, odkaz + QR (PNG/SVG, `qrcode.react`), kód widgetu, povolené weby, Poslat návod webáři (`mailto:`), posledních 20 požadavků (`lib/ws/intake/log.ts`). Akce `app/w/[business]/nastaveni/web/actions.ts`, UI `components/ws/settings/web-integration.tsx`. Rozcestník `/w/[byznys]/nastaveni` |
| Zkušební poptávky | `requests.is_test`: `test: true` v API nebo Ověřit napojení. Nezakládají zákazníka ani upozornění; dotazy v `today.ts`, `calendar.ts`, `search.ts` je vynechávají (nový výpis poptávek = `AND NOT r.is_test`) |
| Testy | `lib/ws/__tests__/ws-intake.test.ts` (klíče, rotace, cizí účet, kolonky, volné časy, SLOT_TAKEN, idempotence, externalId, neaktivní předplatné, honeypot, route: 401/403/CORS/429/413, schema, widget, frame-ancestors, prompt) |

- E-mail zákazníkovi a majiteli po přijetí poptávky zatím není — doplní S15 v `afterSave` (`intake.ts`).
- Volné časy nezohledňují nepotvrzené poptávky (potvrzuje majitel).

## B7. E-maily

Resend z domény ZakazIQ, jako odesílatel jméno byznysu, Reply-To e-mail klienta. Šablony v React Email ve stylu Dílky v `lib/ws/email/`. Fronta `ws.outbound_messages` s opakováním. Každý typ e-mailu jde zapnout/vypnout a upravit v nastavení. Odhlašovací odkaz u všeho, co není transakční.

## B8. Design

Jediný platný vzhled je design systém **Dílky** (podle loga, mockup LP-D). Pravidla, tokeny a pohyb jsou ve skillu `zakaziq-design-dilky`. Žádné barvy natvrdo, žádné výchozí shadcn šedé motivy, žádné gradientové pozadí navíc, žádné emoji v UI.

Jak je systém v kódu (S01, R-027):

| Co | Kde |
|---|---|
| Tokeny (CSS proměnné, světlý + tmavý) | `app/ws-tokens.css` — platí jen uvnitř `[data-app="ws"]`, importuje se jen v `app/w/layout.tsx` a `app/(marketing)/layout.tsx` |
| Tailwind (`navy-*`, `ground`, `surface`, `ink`, `quiet`, `signal*`, `reward`, `danger`, `font-accent`, `font-num`, `rounded-tiny…hero`, `ease-zq`, `animate-zq-*`) | `lib/ws/tailwind-dilky.ts`, sloučeno do `tailwind.config.ts` (adminové klíče beze změny) |
| Písma Instrument Sans/Serif, JetBrains Mono (`next/font`) | `lib/ws/fonts.ts` → `wsFontVariables` |
| Kořen každé stránky Dílků | `components/ws/ws-root.tsx` (`WsRoot`): `data-app="ws"`, `data-theme`, písma, kontejner pro portály, `MotionConfig reducedMotion="user"`; téma přes `useWsTheme()` |
| UI kit (shadcn/ui upravený na Dílky) | `components/ui/` — button, input, label, select, checkbox, switch, dialog, sheet, popover, dropdown-menu, tabs, tooltip, toast, command (⌘K), calendar, badge, separator, skeleton |
| Komponenty Dílků | `components/ws/brand/` — Logo, TileField, TileGlyph, SectionLabel, AccentHeading, Money, TimeRange, NewRequestBlock, ConfirmedBlock, LoyaltyCard, EmptyState, LiveDot |
| Pohyb (Framer Motion presety) | `lib/ws/motion.ts` (`zqIn`, `zqStamp`, `zqSwap`) |
| Formát částek a času | `lib/ws/money.ts` (`formatMoney`), `lib/ws/time.ts` (`formatClock`, `formatTimeRange`, Europe/Prague) |
| Přehled celého systému | `/w/_design` (složka `app/w/%5Fdesign`), jen ve vývoji — v produkci 404 |

- Tmavý režim: `data-theme="dark"` na kořeni, Tailwind `dark:` funguje i pro něj (`darkMode` = `.dark` **nebo** `[data-theme="dark"]`).
- Portály (dialog, panel, menu, select, tooltip) se vykreslují do `WsRoot` přes `usePortalContainer()` z `components/ui/portal.tsx` — nový překryv v `components/ui/` musí předat `container`, jinak skončí v `<body>` bez tokenů.
- Toasty: `toast` z `components/ui/toast.tsx` (ne přímo `sonner`). Jdou přes jediný `<Toaster>` v `app/layout.tsx` a nesou si vlastní `data-app="ws"`. Místo potvrzovacích dialogů `toast.success('…', { undo })`.
- Plugin `tailwindcss-animate` se nepoužívá (mění `duration-*`/`ease-*` i v adminu). Animace překryvů jsou `animate-zq-fade|pop|slide-*`.

## B9. Jednoduchost (tvrdé pravidlo)

- Začátek do 3 minut: registrace, obor, název a aplikace je použitelná díky šabloně oboru.
- Jedna hlavní akce na obrazovce. Detail se otevírá v pravém panelu, ne na nové stránce.
- Žádná akce dál než dva kliky od obrazovky Dnes. ⌘K umí najít cokoli.
- Místo potvrzovacích dialogů tlačítko „Zpět" na pár sekund.
- Prázdný stav vždy říká, co udělat dál.
- Ovladatelné na telefonu jednou rukou, klikací plochy min. 44 px.

### Jak je to v kódu (S09, R-040)

| Co | Kde |
|---|---|
| `/w` | `app/w/page.tsx` — jen přesměruje na naposledy otevřený byznys (cookie `ws_byznys`, slug, HttpOnly, path `/w`), jinak první; `?vitejte=1` jde s sebou. Bez předplatného (`access: 'none'`) → `/w/novy` |
| Kostra `/w/[byznys]` | `app/w/[business]/layout.tsx` (byznys přes `requireBusiness`, stav předplatného + `BillingBanner`, funkce, upozornění) → `components/ws/app/app-frame.tsx`: postranní panel `navy-950` jen se zapnutými funkcemi, hlavička (přepínač byznysů, hledání, zvonek, „+ Nová“), na telefonu spodní lišta (Dnes, Kalendář, +, Zákazníci, Peníze) a menu v panelu |
| Navigace | `lib/ws/nav.ts` (`navItems`, `bottomBarSlots`, `navHref`) podle `ws.business_modules`; Poptávky, Zákazníci a Nastavení vždy |
| Dnes | `app/w/[business]/page.tsx` + `components/ws/app/today/` (Příchozí, týdenní kalendář, agenda pro telefon, uvítání); data `lib/ws/today.ts` (`getTodayData`, `getCustomerCard`, `getRequestDetail`, `getNotifications`) v jedné transakci na volání; rozložení kalendáře `lib/ws/calendar-layout.ts` (čistá funkce, bez JS v prohlížeči); skeleton `loading.tsx` |
| Stav v URL | `?detail=zakaznik:<id>` / `poptavka:<id>` / `nova-rezervace` / `nova-faktura` = pravý panel (`lib/ws/detail-param.ts`, `components/ws/app/detail-slot.tsx` na serveru, `detail-sheet.tsx` v prohlížeči; zavření odebere parametr). `?zakaznik=` karta vpravo na Dnes, `?tyden=` týden (pondělí) |
| ⌘K | `components/ws/app/command-palette.tsx`: hledání `searchAction` → `lib/ws/search.ts` (zákazníci v účtu, poptávky a faktury v byznysu, ILIKE s escapováním), akce, přechod na obrazovky; příkaz „rezervace Tereza pátek 9:00“ rozpozná `lib/ws/command-parser.ts` (pravidla, ne AI) a otevře panel Nová rezervace s předvyplněním (jen se zapnutou akcí, viz níže) |
| Nehotové akce | `lib/ws/features.ts` (`WS_FEATURES`, `newActions`, R-043): Nová faktura (S14); Nová rezervace a blokace zapnuté od S10, odkaz na objednání od S11. Vypnutá akce není v „+ Nová“, ⌘K, uvítání ani v panelu (ani ze sdíleného odkazu). Bez hotové akce chybí „+ Nová“ i „+“ ve spodní liště |
| Zatím nepostavené obrazovky | `app/w/[business]/[section]/page.tsx` — zástupná stránka pro zapnuté funkce; skutečná `app/w/[business]/<část>/page.tsx` má přednost (od S10 Poptávky, Kalendář, Zakázky; od S11 Nastavení) |
| Rezervované slugy | `RESERVED_BUSINESS_SLUGS` v `lib/ws/paths.ts` — pevné cesty pod `/w` (`novy`, `ucet`…). Nová pevná cesta pod `/w` = přidat sem, jinak by zakryla byznys se stejným slugem |
| Čas | `lib/ws/time.ts`: `pragueToday`, `pragueParts`, `pragueToUtc` (přes letní/zimní čas), `weekStartOf`, `formatDayShort` („pá 9. 10.“), `formatRelativeDay` |
| Ukázková data | `node scripts/ws-seed.mjs <slug> --ano` (smazání `--smazat --ano`), data v `lib/ws/demo-seed.ts` (bez runtime importů, Node 24 ho spustí bez překladu). Označená, jiných dat se nedotkne. Pozor: `.env.local` míří na produkční Neon |
| Testy | `lib/ws/__tests__/ws-app-shell.test.ts` (čas, parser, kalendář, navigace, `?detail=`), `ws-today.test.ts` (Dnes nad ukázkovými daty v PGlite, oddělení účtů, hledání, smazání ukázky) |

- `requireWorkspace` a `requireBusiness` jsou obalené `React.cache` — layout a stránka téhož požadavku se ptají jen jednou.
- Detail se otevírá v pravém panelu přes `?detail=`, ne na nové stránce. Nový druh detailu = `DetailRef` v `detail-param.ts` + větev v `detail-slot.tsx`.
- Akce, která ještě nefunguje, se neukazuje: přepínač ve `WS_FEATURES` zapne až sezení, které ji postaví (R-043).

### Jak je to v kódu (S10, R-044)

| Co | Kde |
|---|---|
| Zápisy | `lib/ws/bookings.ts` (`server-only`): `confirmRequest` (chtěný čas, nebo jiný → stav `rescheduled`; s kalendářem termín, se zakázkami zakázka v prvním rozpracovaném/novém stavu), `declineRequest`/`reopenRequest`, `createBooking` (zákazník přes `findOrCreateCustomer` podle telefonu, pak e-mailu), `moveAppointment` (vrací předchozí místo), `cancelAppointment`/`restoreAppointment`, `createBlock`, `setJobStage`, `checkSlot` (tip volno/koliduje), `ensureStaff`, `normalizePhone`. Každý zápis = jeden příkaz v transakci; pracovník, služba a stav z formuláře se dohledají v účtu i byznysu |
| Server actions | `app/w/[business]/poptavky/actions.ts`: `confirmRequest`, `declineRequest`, `reopenRequest`, `createManualBooking`, `moveAppointment`, `cancelAppointment`, `restoreAppointment`, `createBlock`, `moveJobStage`. Vstup `{ slug, … }`, čas jako `{ day: 'YYYY-MM-DD', minutes }` (Praha); `assertWritable`; `revalidatePath('/w/<slug>', 'layout')`; chyby jako české věty |
| Čtení | `lib/ws/calendar.ts`: `getCalendarData`, `getBookingOptions`, `getRequestsList` (Nové / Potvrzené = termín ještě nebyl nebo otevřená zakázka / Vyřízené), `getAppointmentDetail`, `getJobBoard`, `getChangeStamp` |
| Obrazovky | `/w/[byznys]/poptavky` (`?stav=potvrzene` nebo `vyrizene`), `/kalendar` (`?pohled=den` nebo `mesic`, `?datum=`; Den = sloupce podle pracovníků + sloupec nových poptávek, na telefonu seznam), `/zakazky` (tabule podle `ws.stages`, přesun přetažením nebo výběrem) |
| Pravý panel | `?detail=termin:<id>` (Přesunout, Zrušit), `nova-rezervace` (formulář, předvyplnění `kdo`, `den`, `cas`, `sluzba`, `pracovnik`), `nova-blokace`; poptávka má Potvrdit / Jiný čas / Odmítnout a tip „Termín je volný / Koliduje s…“ |
| Komponenty | `components/ws/app/booking/` (tlačítka poptávky, formuláře, `useWsAction`, `undoToast` 8 s, `LiveRefresh`), `components/ws/app/calendar/` (`TimeGrid` s přetahováním, `MonthGrid`, `CalendarAgenda`), `components/ws/app/jobs/job-board.tsx`; karta nové poptávky `IncomingCard` v `today/incoming-list.tsx` |
| Živé obnovení | `LiveRefresh` v `AppFrame` se každých 10 s ptá `GET /api/ws/[byznys]/zmeny` s `If-None-Match` (304 bez změny, jinak nový ETag → `router.refresh()`); skrytá karta se neptá |
| Testy | `lib/ws/__tests__/ws-bookings.test.ts` (potvrzení, jiný čas, zakázka, kolize i souběžně, Zpět, cizí účet, zákazník a pracovník) |

- Odmítnutí, zrušení, přesun termínu i zakázky se provede hned a toast nabídne „Zpět“ na 8 s (`undoToast`). Potvrzení „Zpět“ nemá — termín jde zrušit.
- Návštěva musí mít pracovníka: byznys bez pracovníků dostane při prvním termínu jednoho se jménem byznysu (`ensureStaff`, R-044). Sloupce a výběr „Kdo“ se ukazují až od dvou pracovníků.
- Blokace bez pracovníka (celý byznys) DB omezení nehlídá — ukáže se v kalendáři a v tipu u poptávky, ruční rezervace přes ni projde.

## B10. Texty

Česky, obyčejnými slovy, oslovení „vy". Žádná technická slova v UI („Potvrdit termín", ne „Změnit stav na confirmed"). Texty podle skillu `zakaziq-ux-texty-cs`; marketingové texty a e-maily projdou skillem `humanize-text-cs`. Nikdy si nevymýšlej čísla, reference ani citace; chybějící údaj = zástupný text `[DOPLNIT]`.

## B11. Konvence kódu

- App Router, server components jako výchozí, `'use client'` jen kde je stav nebo interakce.
- Mutace jako Server Actions v `app/w/**/actions.ts`, vstup vždy přes Zod.
- Výsledek akce `{ ok: true, data } | { ok: false, error }`, žádné throw do UI.
- Komponenty Workspace v `components/ws/`, sdílené UI v `components/ui/`.
- Pojmenování: soubory kebab-case, komponenty PascalCase, DB snake_case.
- Žádné `any`, žádné tiché `catch {}`; chyby logovat se `account_id` a bez osobních údajů.

## B12. Testy a kontrola před commitem

1. `npm run build` a `npm test` prochází. Když běží `next dev`, build jen přes `npm run build:check` (kopie repa), jinak přepíše sdílenou `.next`.
2. Nové pravidlo (oddělení účtů, razítka, segmenty, webhooky) má test ve Vitestu.
3. Admin stránky `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]` fungují jako předtím.
4. UI změna: porovnat s mockupem a s pravidly Dílky, zkontrolovat šířku telefonu.

## B13. Bezpečnost

> Platí pro **celé repo** (admin, Workspace, landing page), nejen pro Workspace. Zavedeno v S02 podle skillu `web-security-setup`.

### Bezpečnostní paměť — čti první

Stav zabezpečení je v `.claude/security/`:

| Soubor | Obsah | Kdy číst |
|---|---|---|
| `STATE.md` | současný stav, threat model, otevřené položky, „neměnit bez zeptání" | na začátku každého sezení, které sahá na hlavičky, CSP, middleware, API nebo vstupy |
| `DECISIONS.md` | přijaté kompromisy a proč, s datem revize | před změnou čehokoli bezpečnostního |
| `CSP-LOG.md` | každá změna CSP a funkce, která ji vyžádala | před sáhnutím na politiku |
| `AUDIT-LOG.md` | audity, review, incidenty, rotace klíčů | při vyšetřování nebo hlášení |

**Bezpečnostní změna = zápis do odpovídajícího souboru ve stejném commitu.** Do `memory/memory.md` jen odkaz.

| Změna | Zapsat do |
|---|---|
| hlavička přidaná/odebraná/změněná | `STATE.md` |
| direktiva CSP | `CSP-LOG.md` + řádek CSP ve `STATE.md` |
| přijatý kompromis | `DECISIONS.md` s datem revize |
| audit nebo code review | `AUDIT-LOG.md` |
| incident, uniklý klíč, rotace | `AUDIT-LOG.md` |

### Kde je konfigurace

| Co | Kde |
|---|---|
| Statické hlavičky (HSTS, nosniff, X-Frame-Options, CORP, COOP, Permissions-Policy…) pro všechny odpovědi | `next.config.mjs` |
| CSP s nonce per request (`strict-dynamic`), výběr profilu podle cesty | `middleware.ts` + `lib/security/csp.ts` |
| Admin přihlášení (NextAuth), Workspace (Clerk jen `/w`, `/api/ws`) | `middleware.ts` — Clerk větev (`/w`, `/api/ws`) → admin NextAuth → CSP |
| `frame-ancestors` pro `/r/[slug]`, CORS pro `/api/public/v1/*` | `lib/security/embed.ts` (`frameAncestorsFor`, `corsHeaders`, `preflightResponse`); domény z `web_integrations.allowed_origins` — `/r` přes `lib/ws/intake/embed-origins.ts` v middleware, API přes `lib/ws/intake/http.ts` |
| Hlášení zranitelností | `public/.well-known/security.txt` (`Expires` obnovit) |
| CI: audit závislostí, gitleaks, kontrola hlaviček živého webu | `.github/workflows/security.yml`, skript `.claude/security/security-check.sh` |

- CSP: admin a vše mimo Workspace **Report-Only**, `/w`, `/r`, `/z` **vynucená**. Stránka s vynucenou CSP musí být dynamicky renderovaná (nonce dostanou jen dynamické stránky) — `app/w/layout.tsx` má `dynamic = 'force-dynamic'`. Nová veřejná část → přidat do `ENFORCED_PREFIXES` v `lib/security/csp.ts` a ověřit konzoli.
- Nonce v komponentě (vlastní `<Script>`): `headers().get('x-nonce')`. Skripty Nextu ho dostanou samy.

### Nepřekročitelná pravidla

Nejsou to stylové preference — porušení = skutečná zranitelnost v aplikaci, na které závisí cizí firmy.

**Nikdy neoslabuj CSP, aby něco fungovalo.** Žádné `unsafe-inline` ani `unsafe-eval` do `script-src` (mimo dev větev v `csp.ts`), žádný wildcard, žádné mazání direktivy kvůli chybě v konzoli. Když funkce do politiky nepasuje: vyměnit funkci, načíst skript přes nonce, nebo se zeptat. Nový zdroj = konkrétní host v `lib/security/csp.ts` + řádek v `CSP-LOG.md`.

**Nikdy secret v kódu, kam dosáhne prohlížeč.** Nic citlivého za `NEXT_PUBLIC_`, žádný Stripe secret, Clerk secret, `DATABASE_URL*`, Resend/Anthropic klíč ani SMTP heslo mimo serverový kód. Publikovatelné klíče (Clerk publishable, Stripe publishable, veřejný klíč widgetu) jsou v pořádku. Commitnutý secret se musí **rotovat**, ne jen smazat — a zapsat do `AUDIT-LOG.md`.

**Nikdy vstup bez validace na serveru.** Každá server action, route handler a veřejné API validuje Zodem a omezuje délku každého pole. Klientská validace je jen UX.

**Nikdy nevykresluj nedůvěryhodný vstup jako HTML.** Žádné `innerHTML` ani `dangerouslySetInnerHTML` na čemkoli od uživatele, z URL nebo z API (poptávky, poznámky, jména zákazníků, vlastní kolonky). Když HTML být musí, nejdřív DOMPurify.

**Nikdy nečti ani nezapisuj data jiného účtu.** Každý dotaz do `ws` přes `requireWorkspace()` a `account_id = ctx.accountId` (B3); `account_id` nikdy z formuláře ani URL. RLS je druhá pojistka, nikdy se nevypíná a nikdy `USING (true)`.

**Nikdy nepřidávej skript třetí strany bez zeptání.** Běží s plnými právy na stránce a vidí formulář, do kterého zákazník píše. Když zůstane, potřebuje záznam v `CSP-LOG.md` (a SRI hash, pokud se načítá staticky).

**Nikdy veřejný vstup bez ochrany.** Veřejné API a formuláře: rate limit, validace, honeypot nebo captcha, odeslání jen ze serveru. Webhooky (Stripe, Clerk) vždy s ověřeným podpisem a idempotentní.

**CORS a rámování jen pro přesné domény.** CORS jen na `/api/public/v1/*` přes `corsHeaders()` — přesný origin, nikdy `*`, nikdy `Allow-Credentials`. Rámování jen `/r/*` přes `frameAncestorsFor()`. Neplatný origin se přeskočí, nikdy nerozšíří povolení.

### Pracovní výchozí stav

- `target="_blank"` vždy s `rel="noopener noreferrer"`.
- Žádný inline `<script>` ani `onclick=` atribut — CSP je zakazuje.
- Cookies: `Secure; HttpOnly; SameSite=Lax`, pokud není zapsaný důvod jinak.
- Chyby pro návštěvníky obecné a česky (B6), detaily do logu — se `account_id`, bez osobních údajů.
- Zdrojové mapy a `console.log` interních dat nepatří do produkce (`productionBrowserSourceMaps: false`).
- OAuth (Clerk) přesměrováním, ne popupem — `Cross-Origin-Opener-Policy: same-origin` popup rozbije.
- Lockfile v repu; `npm audit --omit=dev --audit-level=high` čistý před spuštěním (dnes výjimka, `DECISIONS.md` #006).

### Skilly

| Situace | Skill |
|---|---|
| nový projekt nebo chybí hlavičky | `web-security-setup` |
| psaní/změna formulářů, API rout, DB dotazů, uploadů, env; před commitem a deployem | `web-security-review` |
| po deployi a pravidelná kontrola živého webu | `web-security-audit` |
| začátek sezení, zápis bezpečnostní změny | `web-security-memory` |

### Checklist před produkčním deployem

- [ ] `npm audit --omit=dev --audit-level=high` čistý (nebo výjimka v `DECISIONS.md`)
- [ ] v diffu žádný nový secret (`git diff` + gitleaks v CI)
- [ ] nové vstupy validované na serveru, nové dotazy do `ws` filtrují `account_id`
- [ ] CSP pokrývá všechno nové — konzole čistá na dotčených stránkách
- [ ] `.claude/security/` aktualizované pro všechno bezpečnostní v téhle změně
- [ ] po deployi: `bash .claude/security/security-check.sh <adresa>` a výsledek do `AUDIT-LOG.md`

### Když si nejsi jistý

Zeptej se. Zbytečná otázka stojí minutu; potichu oslabená politika nebo uniklý klíč stojí důvěru firem, které Workspace používají — a objeví je někdo jiný.

---

# Společné

## Git

| Oblast | Větev | Commit | Formát zprávy |
|---|---|---|---|
| Workspace + landing page | `workspace` | po každém uceleném kroku | `oblast: co se změnilo`, např. `ws/poptavky: potvrzení jedním klikem` |
| Admin konzole | `main` | jen na požádání | `feat: …`, `fix: …`, `refactor: …`, `chore: …`, `docs: …` |

Zprávy česky, *co a proč*. Nic nepushovat na `main` bez souhlasu (push = produkční deploy). Secrets nikdy do repa, `.env.local` nikdy necommitovat ani nevypisovat.

## Nikdy

- Neměnit admin konzoli bez výslovného zadání.
- Nečíst ani nezapisovat data jiného účtu.
- Nemazat data klientů (kromě GDPR výmazu na žádost).
- Nevymýšlet obsah, čísla, recenze ani reference.
- Nepoužít `force`/`--no-verify`, nepřepisovat historii gitu.

## Paměť projektu (pro všechny AI nástroje)

Kontinuita mezi sezeními žije ve složce `memory/` (R-013) — sdílená paměť mezi sezeními a agenty. **Rozhodnutí, které není zapsané v `memory/memory.md` → Rozhodnutí, neexistuje.**

| Soubor | Co v něm je |
|--------|-------------|
| [`memory/index.md`](../memory/index.md) | Mapa — kde co najít (dokumenty i kód podle úlohy) |
| [`memory/pravidla.md`](../memory/pravidla.md) | Pravidla paměti — co se kam zapisuje, kdy a v jakém formátu |
| [`memory/memory.md`](../memory/memory.md) | Živý stav: aktuální stav, rozhodnutí s důvody, otevřené problémy, changelog |

**Povinné:** po každé dokončené změně zapiš záznam do changelogu v `memory/memory.md` podle `memory/pravidla.md`. Změníš-li technický fakt popsaný v tomto souboru (tabulka, routa, env, pravidlo), oprav ho tady ve stejném commitu.
