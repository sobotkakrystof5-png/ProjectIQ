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
- Před commitem větší změny proveď kontroly B12. Když běží `next dev`, použij `npm run build:check` (od Next 16 je to obyčejný build v repu, dev má vlastní `.next/dev`). `npm run lint` není nastavený (Next 16 `next lint` odstranil); pro typy používej `npx tsc --noEmit`.
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
| Landing page | `app/(marketing)/`, `components/marketing/`, `app/robots.ts`, `app/sitemap.ts` | nová (`app/page.tsx` smazán, R-034). SEO (S05, R-055): `components/marketing/seo.ts` (adresa webu, metadata, JSON-LD), OG obrázek `app/(marketing)/opengraph-image.tsx` + písma `_og/`, ikony `icon.svg`/`apple-icon.png` (Next jim v route group přidá koncovku, pro schéma je `public/zakaziq-logo.png`), noindex hlavičkou `X-Robots-Tag` v `next.config.mjs`. Nová veřejná stránka = canonical + řádek v `app/sitemap.ts` |
| Workspace | `app/w/`, `components/ws/`, `lib/ws/` | nová |
| Veřejné části Workspace | `app/r/` (objednávací stránka `/r/[slug]`), `app/embed/` (widget `/embed/[slug].js`), `app/z/` (klientský portál `/z/[token]`) | nové (R-016) |
| API Workspace | `app/api/ws/`, `app/api/public/v1/`, `app/api/stripe/`, `app/api/clerk/` | nové |
| UI kit | `components/ui/` (shadcn/ui, tokeny Dílky) | nový, admin ho nepoužívá |
| DB | `migrations/064_*.sql` a dál | jen nové migrace, staré se nemění |
| Bezpečnost (celé repo) | `proxy.ts`, `next.config.mjs` (hlavičky), `lib/security/`, `public/.well-known/`, `.github/workflows/security.yml`, `.claude/security/`, `.agents/security/` | mění se jen spolu se zápisem do `.claude/security/` a synchronizací do `.agents/security/` (B13) |

Co se z adminu přebírá (příjem poptávek, časové helpery, faktury, daně, e-maily, portál), se **zkopíruje** do `lib/ws/` a tam zobecní. Původní soubor zůstává netknutý.

---

# Část A — Admin konzole

> Kryštofův osobní produkční systém (VIZEON, ALTENO, Hub, klientský portál). **Úplný popis kódu adminu je v [`docs/admin/AGENTS-ADMIN.md`](../docs/admin/AGENTS-ADMIN.md)** — tech stack, databázový model a katalog tabulek, struktura aplikace, server actions, routy, API, crony, stránky, stavy zakázky, e-maily, bezpečnost, UX pravidla a poznámky pro AI. Přečti ho před jakoukoli změnou adminu (R-042). Tady zůstávají jen příkazy a env proměnné, které platí pro celé repo.

Admin v kostce: Next.js 16 App Router, Neon přes `sql` tag z `lib/db.ts` (bez ORM), NextAuth s jedním adminem, e-maily přes Gmail SMTP v `lib/email.ts`, Vercel Hobby (crony max 1× denně). Neon vrací `date`/`timestamptz` jako `Date`, ne string. Částky v CZK a EUR se nikdy nesčítají.

### Příkazy

```bash
npm run dev      # lokální vývoj (http://localhost:3000)
npm run build    # produkční build — musí projít před commitem větší změny
npm run build:check   # build při běžícím `next dev` (Next 16: dev má `.next/dev`, build ho nepřepíše)
npm test         # vitest run
npm run lint     # není nastavený (Next 16 `next lint` odstranil), kontrolu dělá tsc
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
| Workspace klíče webů | `WS_KEY_PEPPER` (min. 32 znaků, jen server) — pepř pro HMAC tajných klíčů napojení, hash klíčů rate limitu a (odvozeným klíčem) podpis odkazů v e-mailech. Bez něj tajné klíče nejde vytvořit ani ověřit (API 503) a e-maily s odkazy nevzniknou. Změna zneplatní klíče i odeslané odkazy |
| Workspace e-maily | `WS_EMAIL_FROM` (adresa na doméně ověřené v Resendu, např. `rezervace@zakaziq.cz`; bez ní fronta nic neodešle), `RESEND_API_KEY` (sdílený s adminem), `RESEND_WEBHOOK_SECRET` (`/api/resend/webhook`, bez něj 503), `CRON_SECRET` (`/api/cron/ws-email`, `/api/cron/ws-gdpr`) |
| Workspace platby | `STRIPE_SECRET_KEY` (omezený `rk_…`, jen server), `STRIPE_WEBHOOK_SECRET` (`/api/stripe/webhook`, bez něj 503), `STRIPE_PRICE_MONTHLY` (cena 249 Kč), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (zatím nepoužitý). Postup `docs/workspace/SETUP.md` → Stripe |
| Emaily | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `VIZEON_GMAIL_USER`, `VIZEON_GMAIL_APP_PASSWORD`, `VIZEON_ADMIN_EMAIL`, `RESEND_API_KEY` (jen waitlist launch emaily ve Startupu) |
| Konzultace | `ADMIN_PHONE`, `GOOGLE_MEET_LINK`, `TEAMS_MEETING_LINK` |
| Veřejná API | `VIZEON_API_KEY`, `ALTENO_API_KEY`, `ALTENO_LEAD_WEBHOOK_SECRET`, `N8N_API_KEY`, `VIZEON_AGENT_API_KEY`, `INVOICES_API_KEY` |
| Crony | `CRON_SECRET` |
| Hub | `LERNSAX_USER`, `LERNSAX_PASS`, `BESTESCHULE_USER`, `BESTESCHULE_PASS`, `BESTESCHULE_URL`, `CHROME_PATH` (dev), `ANTHROPIC_API_KEY` |
| Požadavky klientů (portál `/p`) | `OPENAI_API_KEY` (přepis hlasu; bez něj je mikrofon skrytý), `OPENAI_TRANSCRIBE_MODEL` (volitelně, výchozí `gpt-4o-transcribe`), `CLIENT_REQUEST_AI_MODEL` (volitelně, výchozí `claude-sonnet-5-5`; používá `ANTHROPIC_API_KEY`) |
| Klientský prostor a hlášení (KP03–KP07) | `DATABASE_URL_PORTAL` (role `portal_app`, `scripts/portal-create-role.js` po migracích 093–096), `PORTAL_INVITE_PEPPER` (hash pozvánek), `AGENT_KEY_PEPPER` (hash klíčů projektů pro hlášení z Claude Code); přepis hlasu a shrnutí jako u portálu `/p` |

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

Next.js 16 App Router (Turbopack) · React 19 · TypeScript strict · Tailwind CSS + shadcn/ui (`components/ui/`) · Neon Postgres (`@neondatabase/serverless`) · Clerk (klienti) · NextAuth (jen admin) · Stripe Billing · Resend + React Email · Zod + react-hook-form · Framer Motion · Lucide (`strokeWidth={1.5}`) · Vitest · Vercel (+ Cron).

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
| Schéma `ws` — 42 tabulek | migrace `064_ws_zaklad` … `091_ws_skupinove_lekce` (přehled níže; na produkčním Neonu jsou aplikované 064–083 a 085–091; migrace 084 stále čeká. Migrace 080 a 087–091 byly aplikovány 2026-10-19 v tomto pořadí: 080 → 087 → 088 → 089 → 090 → 091) |
| Role `ws_app` a její práva | `scripts/ws-create-role.js` (zakládá přes SQL, nikdy v Neon konzoli — `neon_superuser` má BYPASSRLS), `scripts/ws-grants.sql`, postup `docs/workspace/SETUP.md` |
| Přístup do DB | `lib/ws/db.ts`: `wsDb(ctx)` (tag + `.batch()`), každé volání = transakce `set_config('app.account_id')` + dotazy přes Neon HTTP; `wsSystem` jen pro `SECURITY DEFINER` funkce a systémové tabulky; `q` pro sestavení dotazu do dávky; `isOverlapError` (23P01), `isUniqueViolation` (23505). Neon HTTP volá `fetch` s `cache: 'no-store'` — jinak by odpovědi DB skončily v data cache Nextu |
| Kontext | `lib/ws/context.ts`: `requireWorkspace()` (účet přes `ws.account_by_clerk_org`, role z Clerku `org:admin` → `owner`), `requireBusiness(ctx, slug)` (cizí = 404), `requireRole`/`hasRole`; přihlášení přes Clerk `auth()` (aktivní organizace = účet), testy si identitu podstrčí `setWsAuthProvider` |
| Kontext obrazovky byznysu (RD02) | `lib/ws/scope.ts`: `loadBusinessScope(slug)` volá layout `/w/[business]` jako první a jedním dotazem `ws.business_scope(org, slug)` (migrace 085, SECURITY DEFINER, DECISIONS #016) dostane účet, byznys, předplatné, zapnuté funkce a byznysy pro přepínač. Výsledek uloží do paměti požadavku (`seedRequestScope` v `context.ts`, `React.cache`, klíč `accountId:slug`), takže `requireWorkspace()`, `requireBusiness()` a `getEnabledModules()` na stránce už do DB nesahají. Mimo render (server action, route handler, testy) se nic neukládá a čte se jako dřív. Chybí-li funkce v DB (kód 42883), jede se starým postupem po částech — záložní větev smazat, až bude 085 všude. Zvonek, novinky a služby pro ⌘K (`lib/ws/chrome.ts`, jeden `wsDb.batch`) se neawaitují: layout je pošle kostře jako Promise (`AppFrame` prop `chrome`, `use()` + `Suspense`), takže stránka na ně nečeká; chyba se jen zaloguje a vrátí prázdné hodnoty. Každá hlavní obrazovka má `loading.tsx` (kostry v `components/ws/app/skeletons.tsx`), `DetailSlot` má vlastní `Suspense`. Test: `ws-request-scope.test.ts` (izolace účtů, počet kol) |
| Rychlost (RD03) | Součty plateb po měsících a měnách jdou z SQL (`getMoneyTotals` v `lib/ws/money/data.ts`, výstup ve tvaru `MoneyEntry`, takže `currencyTotals`/`monthSeries` zůstaly; řádky `getFinance` jen za zvolený měsíc, Daně čtou jen součty), shodnost hlídá `ws-money-totals.test.ts`. `getChangeStamp` = `max(updated_at)` ze tří tabulek (aplikace řádky nemaže); route `/api/ws/[byznys]/zmeny` bere kontext z `loadBusinessScope` a e-maily odesílá po odpovědi (`after`). Framer Motion jen jako `m` pod `LazyMotion` ve `WsRoot` (funkce `lib/ws/motion-features.ts`, `domAnimation`: bez `layout` a `drag`), paleta ⌘K je `next/dynamic` a zkratka je v `components/ui/use-command-shortcut.ts`; hlídá `ws-bundle-guard.test.ts` |
| Cesty | `lib/ws/paths.ts` — `/w`, `/w/prihlaseni`, `/w/registrace`, `/w/novy` (bez závislostí, importuje i proxy) |
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
- `ws_app` nemá `UPDATE`/`DELETE` na `audit_log` a žádná práva na `account_admin_notes` (interní tabulka adminu, v testech `WS_ADMIN_TABLES`).
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
| 077 | `outbound_messages.status = draft`, razítko pro zakázku a den návštěvy, `ws.loyalty_add_stamps`, `ws.merge_customers`, `ws.active_businesses` pro denní cron skupin (S12) |
| 078 | `ws.loyalty_add_stamps` odmítne razítko za návštěvu, kde už byla uplatněná odměna (S12, ručně aplikovat na Neon) |
| 079 | `ws.services.buffer_min` (0–240 minut) pro rozestup po službě při nabídce volných termínů (S13, ručně aplikovat na Neon) |
| 080 | Peníze S14: accounts.invoice_sequences, invoices.issuer/supplied_on/pdf_data/pdf_filename, tax_settings.options; unique transakce za fakturu, ws.money_issue/pay a money_adopt_visit (SECURITY INVOKER); aplikovaná na produkci 2026-10-19 a na testovací DB |
| 081 | E-maily S15: `message_settings` typy `booking_declined`, `invoice_overdue`, `vat_limit`; `outbound_messages.dedupe_key` (unikátní za účet); `action_tokens` (jednorázové odkazy majitele); `product_news` (globální, ws_app jen čte); `accounts.news_emails`, `members.news_seen_at`; `ws.accounts_with_due_messages()` (SECURITY DEFINER pro cron); aplikovaná na produkci a testovací DB |
| 082 | Klientský portál S16: `appointments.public_token`, `jobs.result_url`, `job_updates`, `reviews`, typ e-mailu `job_update`; `ws.portal_lookup(uuid)` (SECURITY DEFINER, vrací jen ID); aplikovaná na produkci a testovací DB |
| 083 | Admin S17: `product_news.tag` (`new`/`improvement`/`fix`), obrázek `image_data`/`image_type` (PNG/JPEG/WebP, max. 600 kB), `emailed_at`, `email_recipients`, `updated_at`; `account_admin_notes` (poznámka admina k účtu, RLS, ws_app bez práv); aplikovaná na produkci a testovací DB |
| 084 | GDPR S18 (R-054): `invoices.anonymize_after`, `accounts.closing_requested_at`/`delete_after`; `ws.erase_customer` (výmaz zákazníka v jedné transakci, faktury zůstanou s povinnými údaji, koncepty pryč), `ws.close_account`/`ws.reopen_account` (archivace byznysů, výmaz za 30 dní), pro cron `SECURITY DEFINER` `ws.anonymize_expired_invoices()` a `ws.purge_closed_accounts()` |
| 085 | RD02 (R-058): `ws.business_scope(org_id, business_slug)` — SECURITY DEFINER, vrací jsonb s účtem, byznysem podle slugu, byznysy účtu, zapnutými funkcemi a předplatným jedné Clerk organizace; `EXECUTE` jen `ws_app`; aplikovaná na produkci i testovací DB, bez ní běží pomalejší záložní postup |
| 086 | RD03 (R-058): indexy z `EXPLAIN` — `transactions_customer_idx` (součet plateb zákazníka v seznamu), `transactions_business_day_idx`, `requests_changed_idx`, `appointments_changed_idx`, `jobs_changed_idx` (nahrazují `*_account_business_idx`, jsou jejich začátkem), `appointments_request_idx` (termín poptávky); aplikovaná na produkci i testovací DB |
| 087 | RD07: `requests.requested_staff_id` (předvolba pracovníka při potvrzení), `requests.public_token` (portál čekající poptávky); `ws.portal_lookup` přepne stejný odkaz na vzniklý termín. Aplikovaná na produkci 2026-10-19 a na testovací DB |
| 088 | RD10: `accounts.invoice_profile`, `invoices.payment_origin`; nahrazuje `ws.money_pay` a přidává `ws.money_unpay` jako `SECURITY INVOKER` s `EXECUTE` jen pro `ws_app`. Aplikovaná na produkci 2026-10-19 a na testovací DB |
| 089 | RD16: rozšiřuje `message_settings_type_check` o pět ručních šablon pro zákazníky. Aplikovaná na produkci 2026-10-19 a na testovací DB |
| 090 | RD08: `appointments.group_id`, `requests.request_services` pro pořadí služeb v jedné rezervaci a potřebné unikátní indexy. Aplikovaná na produkci 2026-10-19 a na testovací DB |
| 091 | RD09: `sessions`, `session_attendees` a `requests.session_id` pro skupinové lekce s kapacitou 2–30 míst. Aplikovaná na produkci 2026-10-19 a na testovací DB |
| 099 | R-077: `ws.business_by_public_slug` vrací byznys jen pro účet s aspoň jedním řádkem `ws.subscriptions` (dokončený Checkout); objednávací stránka `/r` a widget podle slugu pro nedokončenou registraci = 404. Aplikovaná: ne |

### GDPR, vzhled a PWA (S18, R-054)

| Co | Kde |
|---|---|
| Výmaz zákazníka na žádost | akce `eraseCustomer` v `app/w/[business]/zakaznici/actions.ts` (jen majitel, i bez předplatného) → `lib/ws/gdpr.ts` → `ws.erase_customer`; v kartě zákazníka `EraseCustomer` s potvrzením jménem |
| Export všech dat účtu | `GET /w/ucet/export` (jen majitel, 5×/h): ZIP (`lib/ws/zip.ts`, bez komprese, bez závislosti) s CSV (`lib/ws/csv.ts`, středník + BOM) a PDF faktur; PDF bez uloženého souboru se vykreslí do 40 s, zbytek vypíše `CTI-MNE.txt` |
| Zrušení účtu (R-074, migrace 097) | `closeAccountAction` v `app/w/ucet/actions.ts`: potvrzení názvem účtu. Běžící předplatné (`active`, `trialing`) dostane ve Stripe `cancel_at_period_end` a účet jen `ws.schedule_close_account` (`accounts.close_scheduled_at`); do konce období funguje normálně, `/w/ucet` ukáže „Účet se zavře“ s „Nechat účet“ (`keepAccountAction`, vrátí předplatné). Nezaplacené předplatné končí hned. Bez živého předplatného rovnou `ws.close_account` (výmaz za 30 dní). Dokončení: `ws.finish_scheduled_close` po každém webhooku Stripe (`lib/ws/stripe-webhook.ts`) a záložně cron `ws-gdpr` (`ws.scheduled_closings()` → znovu načíst předplatná ze Stripe → dokončit); předplatné obnovené v Portalu naplánování zruší. Zavřený účet `/w` i `/w/novy` přesměrují na `/w/ucet` s „Obnovit účet“ |
| Denní úklid | `/api/cron/ws-gdpr` (`0 3 * * *` UTC, `CRON_SECRET`): faktury po lhůtě, smazání účtů po 30 dnech + organizace v Clerku (chyba Clerku výmaz dat nezastaví) |
| Záznam o zpracování | `/w/ucet/zpracovani` (čl. 30 odst. 2, subzpracovatelé, historie žádostí z `ws.audit_log`: `customer.erase`, `account.export`, `account.close`, `account.reopen`) |
| Souhlas s nabídkami | pole `marketingConsent` v API v1, políčko na `/r` a ve widgetu (předem nezaškrtnuté); jen přidává `customers.contact_consent_at`, neodvolává |
| Vzhled | cookie `ws_vzhled` (`system`/`light`/`dark`, `Path=/w`) čte `app/w/layout.tsx`, `WsRoot` nastaví `data-theme`; „Podle systému“ řeší inline skript s nonce bez bliknutí. Tmavé tokeny a přemapování světlých tříd (`bg-navy-50`, `border-navy-100`, `text-navy-700/900`…) v `app/ws-tokens.css`; prvek s vlastní třídou `dark:` má přednost, bílé prvky se nemění. `/r`, `/z` a landing zůstávají světlé |
| PWA | `public/zakaziq.webmanifest` (scope `/w`), ikony `public/ikony/` (`node scripts/ws-pwa-icons.mjs`), `public/sw.js` jen offline stránka `public/offline.html`, registrace `components/ws/app/pwa-register.tsx` (jen produkce), „Přidat na plochu“ v Účtu |
| Mobil | kalendář bez `?pohled=` na telefonu (User-Agent) začíná dnem; „táhni pro obnovení“ na Dnes jen v aplikaci na ploše (`components/ws/app/today/pull-to-refresh.tsx`) |

### Admin nad Workspace (S17, R-052)

| Co | Kde |
|---|---|
| Stránky (vzhled adminu, NextAuth) | `/dashboard/klienti` (přehled účtů: obor, byznysy, stav předplatného, poslední aktivita, poptávky 30 dní, napojený web), `/dashboard/klienti/[id]` (detail účtu, klíče a prompt, pozvánka znovu, omezená historie auditu), `/dashboard/novinky` (editor s náhledem v aplikaci a e-mailu, seznam). Vykreslení v `clients-view.tsx`, `[id]/detail-view.tsx`, akce `actions.ts` |
| Přístup do DB | `lib/ws/admin/db.ts`: `adminDb` přes `DATABASE_URL` (vlastník tabulek, mimo RLS), `server-only`, v testech `setAdminDriverForTests`. Jen z `lib/ws/admin/*` |
| Kdo smí | `lib/ws/admin/auth.ts`: `getAdmin()` = NextAuth session; každá server action ho volá první (testy `setAdminAuthForTests`). Audit `actor = 'admin'` |
| Přehled a detail | `lib/ws/admin/clients.ts`: `listClients`, `getClientDetail`, `getClientBusiness`, `auditAdmin`. Poslední aktivita = nejnovější změna poptávek, termínů, zakázek, zákazníků a faktur; jejich osobní/finanční obsah ani poznámky a podrobnosti auditu admin nečte. Zůstávají souhrny účtu, byznysů, předplatného a členů týmu. |
| Pozvat klienta | `lib/ws/admin/invite.ts`: Clerk organizace (bez vlastníka) → `createAccountWithBusiness({ owner: null })` → pozvánka `org:admin` s návratem na `/w/registrace`. Člen se zapíše až v průvodci `/w/novy` (`ensureMember` v `lib/ws/onboarding.ts`, bez webhooku Clerku). Klient pak projde Checkoutem (R-038) |
| Klíče a prompt pro web | `lib/ws/admin/web-keys.ts`: `ensureIntegration` + `rotateSecretKey` + `buildClaudePrompt` jako Nastavení › Napojený web (S11), zápis rolí `ws_app` pod RLS účtu |
| Novinky | `lib/ws/admin/news.ts` (koncept → `publishNews` → `sendNewsEmail` s potvrzeným počtem příjemců, jednou), `lib/ws/news-format.ts` (štítky, limity, kontrola obrázku podle bajtů, tipy „Učesat text“ bez AI), `lib/ws/email/news-email.ts` (jeden e-mail pro náhled, odeslání i cron), zvonek `components/ws/app/news-entry.tsx`, obrázek `/z/novinky/[id]/obrazek` (jen zveřejněná, CORP `cross-origin`) |
| Testy | `lib/ws/__tests__/ws-admin.test.ts` |

- Denní cron posílá e-mailem jen novinky s `emailed_at` (admin je výslovně odeslal) za posledních 14 dní a jen účtům založeným před odesláním (`queueNewsForAccount` v `lib/ws/email/scheduled.ts`).
- Odeslanou novinku nejde skrýt ani smazat (CHECK `emailed_at` → `published_at`), koncept jde smazat.

### Klientský prostor a hlášení práce (KP01–KP09)

Plán a rozhodnutí: `docs/klientsky-prostor/PLAN.md` (R-070 a dál v `memory/memory.md`), napojení projektu klienta `docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md`, bezpečnost `.claude/security/DECISIONS.md` #019 a #020.

- **Aktivita zakázky** (migrace 093): `lib/project-activity.ts` (Zod, `redactSensitive`, `buildTimeline`), `app/project-activity-actions.ts` (koncept → schválit/zamítnout, souhrnný e-mail max. 1× za 24 h, selhání e-mailu publikaci nezruší), `components/ProjectActivityPanel.tsx`, portál `/p/[token]` ukazuje jen `published`.
- **Hlášení z Claude Code** (094): `lib/agent-keys.ts`, `POST /api/agent/v1/projects/{id}/reports` (jen koncept), `app/project-agent-key-actions.ts`, `components/AgentKeyPanel.tsx`, skript `scripts/zakaziq-report.mjs`, skill `zakaziq-hlaseni`.
- **Klientský prostor** (095, 096): `/klient` (Clerk bez organizací, `proxy.ts` má pro něj vlastní middleware), `lib/portal/{db,context,invite,projects,paths,admin-queries}.ts`, `app/klient/**`, `components/portal/`, správa z adminu `/dashboard/klientsky-prostor` (`app/portal-admin-actions.ts`). Klientovi se ukazuje jen schválené (triggery), zapisuje funkcemi `portal.submit_*`. Nová tabulka s daty klienta = `client_id`, RLS politika, složené cizí klíče a řádek v testu `lib/__tests__/portal-isolation.test.ts`.
- **Předání do Claude Code, úroveň 2** (KP09): `lib/claude-code-handoff.ts` (příkaz pro terminál s textem klienta v souboru přes heredoc, ne v `$(…)`), tlačítko na kartě požadavku.
- **Kostra administrace** (KP01/KP02): viz `docs/admin/AGENTS-ADMIN.md` → Kostra administrace.

## B4. Přihlášení a role

- Clerk: Organization = účet (firma, jedno IČO, předplatné). Role `owner`, `staff`.
- Přihlášení bez hesla: e-mailový kód nebo Google.
- Jedna doména: landing na `/`, aplikace na `/w/*`, jedna Clerk instance (R-017). Cesty veřejných částí viz Hranice v repu (R-016).
- Jeden `proxy.ts` (dřív `proxy.ts`, Next 16, Node runtime): veřejné cesty; Workspace přes Clerk; admin cesty přes NextAuth token jako dnes. Admin přihlášení zůstává na `/login`, odkaz „Admin" ve footeru landing page.
- Webhook Clerk (`/api/clerk/webhook`, ověření podpisu) synchronizuje účty a členy do `ws`.

### Jak je to v kódu (S07, R-037)

| Co | Kde |
|---|---|
| SDK | `@clerk/nextjs` **6.39.7** (podporuje Next 14–16 i React 19, upgrade na v7 nebyl při přechodu na Next 16 potřeba) + `@clerk/localizations` (`csCZ`) |
| Proxy | `proxy.ts`: `clerkMiddleware` jen pro `/w` a `/api/ws`; bez přihlášení `auth.protect()` → `/w/prihlaseni` (veřejné jen přihlášení, registrace a `/w/_design`). Admin a landing Clerk vůbec nespouští. CSP s nonce zůstává (`withCsp` uvnitř Clerku) |
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
| Příjem | `lib/ws/intake/intake.ts`: `ingestRequest(source, body)` — jediná cesta pro API, widget, objednávací stránku i „Ověřit napojení“. Konfigurace byznysu → Zod (`requestInputSchema` + `fieldValuesSchema` z `lib/ws/fields.ts`) → služba, pracovník a čas (`SLOT_TAKEN` jen v režimu `slots`) → `Idempotency-Key` (`ws.idempotency_keys`) → zákazník (`findOrCreateCustomer`, ne u `test`) → uložení (`external_id` = bez duplicit) → potom záznam, upozornění, `last_used_at`, každé ve vlastním try/catch. Neaktivní předplatné = 202 + `notice` (R-045) |
| Čas | `lib/ws/intake/slots.ts` (čistá funkce): režim `slots` (otevírací doba / směny, časy konkrétního pracovníka nebo sjednocení všech způsobilých pracovníků, termíny a blokace, krok 30 min, nejdřív za 60 min, 21 dní), `free` (bez otevírací doby — zákazník navrhne, R-045), `none` (bez kalendáře). Konstanty `BOOKING` v `intake.ts` |
| HTTP | `lib/ws/intake/http.ts`: `authenticate` (tajný klíč jen bez `Origin`, veřejný jen z `allowed_origins`; nepovolená doména jde do záznamu), `respond` (CORS jen ověřenému originu), `readJson` (64 kB), `businessBySlug` |
| Rate limit | `lib/ws/intake/rate-limit.ts` nad `ws.rate_limits` (pevné okno, klíč = HMAC hodnoty, ne IP): 20/min na IP, 300/h na byznys, schema 120/min, objednávací stránka 8/10 min, ověření 10/10 min |
| Routy | `app/api/public/v1/requests/route.ts` (POST, OPTIONS), `app/api/public/v1/schema/route.ts` (GET, OPTIONS; tvar `lib/ws/intake/schema.ts`, cache 60 s; `serviceId`/`serviceIds` a `staffId` zúží nabídku, odpověď obsahuje volné skupinové `sessions`) |
| Objednávací stránka (RD07–RD09) | `app/r/layout.tsx` (Dílky, `force-dynamic`), `app/r/[slug]/page.tsx`, akce `app/r/[slug]/actions.ts` (`getOrderSlots`, `submitOrder` — byznys jen ze slugu), UI `components/ws/order/order-flow.tsx` dovolí vybrat až pět navazujících služeb nebo jednu skupinovou lekci s atomickou rezervací místa. Widget používá stejný tok přes `/r/<slug>?embed=1`. Barva byznysu přes `lib/ws/accent.ts` (jen s kontrastem ≥ 4.5 k bílé). Jen pro účet, který dokončil Checkout (migrace 099, R-077). Chyba stránky = `app/r/error.tsx` |
| Widget | `app/embed/[file]/route.ts` (`/embed/<slug>.js`, cache 5 min) + `app/embed/widget.css/route.ts`; zdrojáky `lib/ws/intake/widget-script.ts` a `widget-css.ts` (bez frameworku, shadow DOM, tlačítko nebo inline iframe se sandboxem, CSS jako externí zdroj; v prohlížeči není veřejný API klíč) |
| Rámování `/r` | `proxy.ts` → `lib/ws/intake/embed-origins.ts` (povolené domény ze slugu, cache 60 s v instanci, chyba = jen `'self'`) |
| Nastavení › Napojený web | `/w/[byznys]/nastaveni/web` (jen vlastník): prompt pro Claude Code (`lib/ws/intake/claude-prompt.ts`), tajný klíč, Ověřit napojení, odkaz + QR (PNG/SVG, `qrcode.react`), kód widgetu, povolené weby, Poslat návod webáři (`mailto:`), posledních 20 požadavků (`lib/ws/intake/log.ts`). Akce `app/w/[business]/nastaveni/web/actions.ts`, UI `components/ws/settings/web-integration.tsx`. Rozcestník `/w/[byznys]/nastaveni` |
| Zkušební poptávky | `requests.is_test`: `test: true` v API nebo Ověřit napojení. Nezakládají zákazníka ani upozornění; dotazy v `today.ts`, `calendar.ts`, `search.ts` je vynechávají (nový výpis poptávek = `AND NOT r.is_test`) |
| Testy | `lib/ws/__tests__/ws-intake.test.ts` (klíče, rotace, cizí účet, kolonky, volné časy, SLOT_TAKEN, idempotence, externalId, neaktivní předplatné, honeypot, route: 401/403/CORS/429/413, schema, widget, frame-ancestors, prompt) |

- E-mail zákazníkovi a majiteli po přijetí poptávky: `afterSave` (`intake.ts`) → `notifyNewRequest` (S15).
- Volné časy nezohledňují nepotvrzené poptávky (potvrzuje majitel).

## B7. E-maily

Resend z domény ZakazIQ, jako odesílatel jméno byznysu, Reply-To e-mail klienta. Šablony ve stylu Dílky v `lib/ws/email/` (vlastní HTML, ne React Email — R-050). Fronta `ws.outbound_messages` s opakováním. Každý typ e-mailu jde zapnout/vypnout a upravit v nastavení. Odhlašovací odkaz u všeho, co není transakční.

### Jak je to v kódu (S15, R-050)

| Co | Kde |
|---|---|
| Katalog typů, výchozí texty, proměnné `{jmeno}` `{termin}` `{sluzba}` `{razitka}` `{odmena}` `{cislo}` `{castka}` `{splatnost}` | `lib/ws/email/catalog.ts` (bez importů serveru) |
| Rozložení Dílků (tabulkové HTML, escapování, jen http/https odkazy) a složení zákaznického e-mailu | `lib/ws/email/{layout,compose}.ts` — stejná funkce pro náhled v Nastavení i odeslání |
| Fronta: `enqueueEmail` (klíč události `dedupe_key`, `sendAt`, `validUntil`), `flushAccount` (claim `FOR UPDATE SKIP LOCKED`, 5 pokusů 1/5/30/120/720 min, obsah se po odeslání maže), `flushAll` (cron) | `lib/ws/email/queue.ts` |
| Odeslání přes Resend (klíč idempotence = ID zprávy, tagy `account`/`message`/`type`), bez `WS_EMAIL_FROM` nic | `lib/ws/email/transport.ts` (`setEmailTransportForTests`) |
| Události → e-maily; nikdy nevyhodí, zákazníkům jen s aktivním předplatným, majiteli vždy | `lib/ws/email/notify.ts`: `notifyNewRequest`, `notifyBookingConfirmed`, `notifyAppointmentMoved`, `notifyRequestDeclined`, `notifyAppointmentCancelled`, `cancelPendingNotice`, `notifyVisitPaid`, `notifyRewardForJob`, `notifyPaymentFailed`, `deliver` |
| Odmítnutí, zrušení a přesun čekají 60 s (`UNDO_DELAY_MS`), „Zpět“ e-mail zruší; návrat na původní čas nepošle nic | `notify.ts` |
| Odkazy z e-mailů: podpis HMAC (klíč odvozený z `WS_KEY_PEPPER`), druhy `a` (akce majitele), `u` (odhlášení zákazníka), `n` (odhlášení novinek), `c` (.ics) | `lib/ws/email/links.ts` |
| Potvrdit / Jiný čas bez přihlášení: řádek `ws.action_tokens` (72 h, jednorázově, atomicky; selhání ho vrátí; GET nic nemění) | `lib/ws/email/action-link.ts`, stránka `/z/odkaz/[token]` |
| Odhlášení `/z/odhlasit/[token]` (+ `POST …/jedno-kliknuti`, RFC 8058), termín do kalendáře `/z/kalendar/[token]` | `lib/ws/email/public-links.ts`, `app/z/` |
| Ruční odeslání: „Komu napsat“ (koncept → fronta, souhlas se ověří i těsně před odesláním), faktura s PDF | `lib/ws/email/outbox.ts` |
| Zpráva zákazníkovi (RD16) | `sendCustomerMessage` přijímá pět šablon z `catalog.ts`; osobní zprávy se zařadí s minutou na „Zpět“ a dovolují obsluhu i po odhlášení z nabídek. Typ `customer_offer` vyžaduje souhlas, neukončený kontakt a neodhlášeného zákazníka; fronta podmínky ověří znovu před odesláním. Bez připraveného Resend transportu se otevře bezpečně sestavené `mailto:` a zpráva se netváří jako odeslaná. Zrušení čekající zprávy: `cancelQueuedCustomerMessage`, `lib/ws/email/queue.ts`; adresa: `lib/ws/email/mailto.ts` |
| Denní cron `0 5 * * *` UTC: připomínky na zítřek, faktura po splatnosti, limit DPH (80 % a 100 %), přehled dne (Po–Pá), týden (Po), měsíc (1.), novinky, odeslání fronty | `lib/ws/email/scheduled.ts`, `app/api/cron/ws-email` |
| Odeslání během dne: po akci (`deliver`, limit 2,5 s) a při živém obnovení (`/api/ws/[byznys]/zmeny`) | R-050 (Hobby = cron 1× denně) |
| Nastavení › Komunikace (RD13) | `/w/[business]/nastaveni/komunikace` shrnuje e-maily a upozornění, šablony zákaznických zpráv a test; původní `/nastaveni/emaily` přesměrovává. UI `components/ws/settings/email-settings.tsx`, nastavení `lib/ws/email/settings.ts`, ruční šablony `lib/ws/email/catalog.ts` |
| Zvonek: po otevření přečteno, „Co je nového“ z `ws.product_news` | `lib/ws/email/inbox.ts`, `components/ws/app/notifications-bell.tsx` |
| Nedoručené e-maily: webhook Resendu (podpis Svix, idempotence `webhook_events`), stížnost = odhlášení z nabídek | `lib/ws/email/resend-webhook.ts`, `app/api/resend/webhook` |

- Nový e-mail = typ v `catalog.ts` (+ CHECK `message_settings` novou migrací), složení v `compose.ts` nebo `ownerEmail`, událost v `notify.ts` s `dedupeKey`.
- Se zapnutým Klientským portálem obsahuje potvrzení, změna a připomínka termínu tlačítko „Přesunout nebo zrušit“; pravidla čte `portalRules`. Web Push je S18.

## B8. Design

Jediný platný vzhled je design systém **Dílky** (podle loga, mockup LP-D). Pravidla, tokeny a pohyb jsou ve skillu `zakaziq-design-dilky`. Žádné barvy natvrdo, žádné výchozí shadcn šedé motivy, žádné gradientové pozadí navíc, žádné emoji v UI.

Jak je systém v kódu (S01, R-027):

| Co | Kde |
|---|---|
| Tokeny (CSS proměnné, světlý + tmavý) | `app/ws-tokens.css` — platí jen uvnitř `[data-app="ws"]`, importují ho layouty Workspace, marketingu, `/r` a `/z` |
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
| Kostra `/w/[byznys]` | `app/w/[business]/layout.tsx` (byznys přes `requireBusiness`, stav předplatného + `BillingBanner`, funkce, upozornění) → `components/ws/app/app-frame.tsx`: postranní panel `navy-950` jen se zapnutými funkcemi (92 px na tabletu, 208 px s popisky od 1280 px), hlavička (přepínač byznysů, hledání, zvonek, „+ Nová“); při zadokovaném detailu se hledání zkrátí na ikonu. Na telefonu spodní lišta (Dnes, Kalendář, +, Zákazníci, Peníze) a menu v panelu |
| Navigace | `lib/ws/nav.ts` podle `ws.business_modules`; Poptávky a Zákazníci vždy. Hlavní menu (`navItems`) má nejvýš šest položek: Dnes, Poptávky, Kalendář, Zákazníci, Zakázky, Peníze (RD01, R-058). Peníze (`moneyItem`) vedou na první zapnutou peněžní funkci (Přehled měsíce → Faktury → Daně) a svítí na všech záložkách (`isNavActive`); `/faktury`, `/prijmy`, `/dane` a `/penize` zůstávají jako adresy. `NAV_ITEMS` je katalog všech obrazovek (`navItemForSegment`, ⌘K `paletteItems`). Nastavení v hlavním menu není: menu **Účet** (`components/ws/app/account-menu.tsx`, dole v panelu a ve výsuvném menu na telefonu) nabízí `accountLinks` — Nastavení firmy, Předplatné a doklady (`/w/ucet`), Vzhled, Zpracování údajů, Odhlásit; pracovník (nevlastník) jen Vzhled a Odhlásit. Účet svítí na `/w/ucet*` i `/nastaveni*` (`isAccountActive`). ⌘K nabízí Nastavení a Účet a předplatné jen majiteli |
| Dnes | `app/w/[business]/page.tsx` + `components/ws/app/today/`: `TodayBoard` od 1024 px staví kalendář vlevo a „Teď na řadě“ (`TodayFocus`) se zbylými poptávkami vpravo; na telefonu následují hlavní věc, poptávky a časově řazená agenda. Při zadokovaném detailu pravý sloupec ustoupí; karta zákazníka je v pravém panelu; prázdný byznys má uvítání. Data `lib/ws/today.ts` (`getTodayData` s `focus`, `pickFocus`, `getCustomerCard`, `getRequestDetail`, `getNotifications`) v jedné dávce na volání; rozložení kalendáře `lib/ws/calendar-layout.ts` (čistá funkce, bez JS v prohlížeči); skeleton `loading.tsx` |
| Stav v URL | `?detail=zakaznik:<id>` / `poptavka:<id>` / `termin:<id>` / `zakazka:<id>` / `nova-rezervace` / `nova-blokace` / `najit-cas` / `nova-faktura` = pravý panel (`lib/ws/detail-param.ts`, `components/ws/app/detail-slot.tsx` na serveru, `detail-sheet.tsx` v prohlížeči; zavření odebere parametr). Od 1280 px je panel zadokovaný (R-057): nemodální, bez ztmavení, klik vedle ho nezavře (jen přepne detail), zavírá křížek/Esc; `[data-ws-frame]` dostane `padding-right: 480px` a `[data-detail-hide]` (pravý pruh) se schová, `[data-detail-grid]` přejde na jeden sloupec — pravidlo v `app/ws-tokens.css`. Nová obrazovka s pravým pruhem tyhle značky potřebuje. Otevřený blok v mřížce má `aria-current` a rámeček (`TimeGrid` z URL, `WeekCalendar` přes `selectedId`). `?tyden=` týden (pondělí) na Dnes; starý odkaz `?zakaznik=<id>` Dnes přesměruje na `?detail=zakaznik:<id>` (RD04) |
| ⌘K | `components/ws/app/command-palette.tsx`: hledání `searchAction` → `lib/ws/search.ts` (zákazníci v účtu, poptávky a faktury v byznysu, ILIKE s escapováním), akce, přechod na obrazovky; příkaz „rezervace Tereza pátek 9:00“ rozpozná `lib/ws/command-parser.ts` (pravidla, ne AI) a otevře panel Nová rezervace s předvyplněním (jen se zapnutou akcí, viz níže) |
| Nehotové akce | `lib/ws/features.ts` (`WS_FEATURES`, `newActions`, R-043): Nová faktura zapnutá od S14; Nová rezervace a blokace zapnuté od S10, odkaz na objednání od S11. Vypnutá akce není v „+ Nová“, ⌘K, uvítání ani v panelu (ani ze sdíleného odkazu). Bez hotové akce chybí „+ Nová“ i „+“ ve spodní liště |
| Zatím nepostavené obrazovky | `app/w/[business]/[section]/page.tsx` — zástupná stránka pro zapnuté funkce; skutečná `app/w/[business]/<část>/page.tsx` má přednost (od S10 Poptávky, Kalendář, Zakázky; od S11 Nastavení) |
| Rezervované slugy | `RESERVED_BUSINESS_SLUGS` v `lib/ws/paths.ts` — pevné cesty pod `/w` (`novy`, `ucet`…). Nová pevná cesta pod `/w` = přidat sem, jinak by zakryla byznys se stejným slugem |
| Čas | `lib/ws/time.ts`: `pragueToday`, `pragueParts`, `pragueToUtc` (přes letní/zimní čas), `weekStartOf`, `formatDayShort` („pá 9. 10.“), `formatRelativeDay` |
| Ukázková data | `node scripts/ws-seed.mjs <slug> --ano` (smazání `--smazat --ano`), data v `lib/ws/demo-seed.ts` (bez runtime importů, Node 24 ho spustí bez překladu). Označená, jiných dat se nedotkne. Pozor: `.env.local` míří na produkční Neon |
| Testy | `lib/ws/__tests__/ws-app-shell.test.ts` (čas, parser, kalendář, navigace, `?detail=`), `ws-today.test.ts` (Dnes nad ukázkovými daty v PGlite, oddělení účtů, hledání, smazání ukázky) |

- `requireWorkspace` a `requireBusiness` jsou obalené `React.cache` — layout a stránka téhož požadavku se ptají jen jednou.
- Detail se otevírá v pravém panelu přes `?detail=`, ne na nové stránce. Nový druh detailu = `DetailRef` v `detail-param.ts` + větev v `detail-slot.tsx`.
- Akce, která ještě nefunguje, se neukazuje: přepínač ve `WS_FEATURES` zapne až sezení, které ji postaví (R-043).

### Jak je to v kódu (RD04, R-058)

| Co | Kde |
|---|---|
| Hlavní věc a začátek na Dnes | `pickFocus` v `lib/ws/today.ts` (čistá funkce): nejdéle čekající nová poptávka → nejbližší dnešní termín, který neskončil → nejstarší vystavená faktura po splatnosti (jen se zapnutou funkcí Faktury, `getTodayData(…, { invoices })`) → nic. Podklady jdou v téže dávce jako zbytek Dnes (3 dotazy navíc, bez nového kola do DB), nezávisí na zobrazeném týdnu. Termín je omezený na poslední dva dny, aby index `(byznys, začátek)` neprocházel historii. `TodayFocus` nabízí hlavní akci, `TodayBoard` kalendář/poptávky a úvodní kontrolní seznam pro nastavení služeb, otevírací doby, odkazu na objednání a první poptávky; splnění se posuzuje podle konkrétního byznysu, zavření seznamu se pamatuje lokálně pro tento byznys. |
| Karta zákazníka | už není třetí sloupec. Klik na termín nebo poptávku v kalendáři otevře panel (`termin:` / `poptavka:`), ten má kartu zákazníka v sobě; `?zakaznik=<id>` přesměruje na `?detail=zakaznik:<id>` |
| Věrnostní karta (RD12) | `lib/ws/loyalty-card-view.ts` sjednocuje průběh a hlášku pro kartu v detailu zákazníka, Dnes, portálu a e-mailu. `lib/ws/loyalty.ts` používá zámek na zákazníka a program; ruční razítko i uplatnění odměny lze vrátit po dobu jedné minuty, pokud karta mezitím nedostala další událost. Akce v `app/w/[business]/zakaznici/actions.ts` ověřují Zod, účet a byznys. Nastavení ukazuje zapnutí, počet a odměnu; ostatní pravidla jsou v „Pokročilé“. Bez migrace. Testy `ws-loyalty.test.ts`, `ws-loyalty-card-view.test.ts`, `ws-email.test.ts` |
| Kontakt a zprávy zákazníkům (RD16) | `components/ws/customers/customer-contact-actions.tsx`: telefon/e-mail s voláním a e-mailovým odkazem, doplnění chybějícího údaje, návrh bezpečného sloučení duplicity, pět ručních šablon a 60 s na zrušení fronty. `lib/ws/customers.ts` hlídá účet a vazbu na byznys; kontakt normalizuje server. Vstup poptávky vyžaduje alespoň telefon nebo e-mail. Migrace 089 rozšiřuje CHECK šablon, je připravená a na Neonu nenasazená. Testy `ws-customers.test.ts`, `ws-email.test.ts`, `ws-gdpr.test.ts` |
| Nastavení (RD13) | `/w/[byznys]/nastaveni` nabízí pět částí: Firma, Nabídka, Objednávky, Zákazníci a Komunikace. Detailní cesty jsou `/nastaveni/{firma,nabidka,objednavky,zakaznici,komunikace}`; původní cesty pod `/nastaveni/{emaily,formular,funkce,oteviraci-doba,skupiny,sluzby,stavy,vernost,vzhled,web}` zůstávají jako přesměrování. Obsah formulářů používá původní komponenty nastavení, které zůstávají v samostatných souborech. Firma mění profil dodavatele a vzhled; nabídka služby, otevírací dobu a pracovníky včetně barev; ostatní části sdružují původní funkce. Přepínače a autosave nabízejí „Zpět“; závislé funkce se při vypnutí obnoví bezpečně. Psaní mění jen vlastník; pracovník uvidí informaci o oprávnění. Barvy pracovníků jsou editovatelné jen při více aktivních pracovnících, jinak se dál používají výchozí Dílků. Testy `ws-settings.test.ts` |
| Společné komponenty obrazovek | `components/ws/app/page-header.tsx`: `PageShell` (šířka `narrow` 960 / `default` 1280 / `wide` 1440, rytmus 20 px) a `PageHeader` (nadpis s akcentem, oddělovací linka, podnadpis, jedna hlavní akce vpravo, slot `help` pro „?“ z RD14). `components/ws/app/toolbar.tsx`: `Toolbar` (řádek filtrů) a `PillNav` (aktivní filtr v pilulce, ostatní textové; `segmented` pro pohled). `EmptyState` má třetí velikost `compact` do úzkého sloupce a karty |
| Kde se používají | Dnes, Poptávky, Zákazníci (`PageShell` + `PageHeader` + `PillNav`) a pohled Kalendáře (`PillNav` segmented). Kalendář a Zakázky (RD05, RD06) mají `PageShell` + `PageHeader` + `Toolbar`/`PillNav`; Peníze a Daně se upravují v RD11, Nastavení v RD13. Ukázky všech variant v `/w/_design` (oddíl 09) |
| Testy | `ws-today.test.ts`: pořadí `pickFocus`, nejstarší poptávka mimo omezený seznam a nezávislost na týdnu, dnešní termín (skončený, zrušený, zítřejší se přeskočí), faktura po splatnosti (jen s funkcí, koncept a zaplacená ne, termín má přednost), oddělení účtů |

### Jak je to v kódu (RD05 + RD06, R-059)

| Co | Kde |
|---|---|
| Rady k času | `lib/ws/slot-advice.ts` (`server-only`, `getSlotAdvice`): kolize/volno (`checkSlot` s volitelným `staffId`), „mimo otevírací dobu“ (`isWithinHours` v `lib/ws/intake/slots.ts`) a tři nejbližší volné časy z `computeSlots` (jedna logika s objednávkou, bez předstihu, kolem zadaného času). `lib/ws/slot-suggest.ts` (bez DB): `pickNearestSlots`, `AdviceDto`/`toAdviceDto`. Action `slotAdvice` (čtení, funguje i při pozastaveném předplatném); v prohlížeči `useSlotAdvice` (pauza 250 ms, starší odpověď nepřepíše novější) a `AdviceTip` + `SuggestionChips` (`components/ws/app/booking/{use-slot-advice,slot-advice-view}`) |
| Rychlé zadání | klik nebo tažení v prázdné mřížce (`TimeGrid`, pointer události) otevře `Popover` s `QuickBooking` (`next/dynamic`, načte se při prvním kliknutí): zákazník přes `CustomerPicker` (action `searchCustomers`), služba, den a čas, pracovník, rady k času. Na zařízení s hrubým ukazatelem je „Vybrat dobu“; po zapnutí svislé tažení prstem vybere vlastní délku a režim se po výběru vypne. Běžný dotyk ponechává posouvání stránky, krátký dotyk vybere začátek a délku určí služba. `createManualBooking` má volitelné `durationMin` (tažení). „Další údaje“ otevře úplný formulář a přenese `kdo`, `zakaznik` (id stálého zákazníka, `getCustomerOption`), `den`, `cas`, `sluzba`, `pracovnik` |
| Najít volný čas | `?detail=najit-cas` (`lib/ws/detail-param.ts`, panel `FindSlotForm`): služba + kdo → 8 nejbližších časů, klik otevře rezervaci s předvyplněním. Odkazy: menu „⋯“ v hlavičce Kalendáře (`calendar-actions.tsx`), akce v ⌘K a „Najít volný čas“ v prázdném dni na telefonu. Zapnuté s `WS_FEATURES.newBooking` a funkcí Kalendář |
| Potvrzení poptávky | panel poptávky: `AdviceTip` (volno / kolize / mimo otevírací dobu) a pod tlačítky `SuggestionChips` „Nebo potvrdit na jiný volný čas“ (klik potvrdí na ten čas, stav `rescheduled`); ve formuláři Jiný čas rady podle toho, co píšete. Chyba rady se jen zaloguje, poptávku jde potvrdit i bez ní |
| Aktuální čas | `components/ws/app/calendar/now-indicator.tsx` vykreslí v dnešních sloupcích pražský čas v rozsahu mřížky; sdílený `NowClock` aktualizuje indikátor po minutách a při návratu na kartu, bez požadavku na server |
| Délka termínu | `resizeAppointment` v `lib/ws/bookings.ts` + action (`15–720 min`, kolize `23P01` → „Tenhle čas už je obsazený“, `bad_length`); tažení za spodní okraj bloku v mřížce (optimisticky, se „Zpět“) a výběr „Délka“ v detailu termínu, dostupný dotykem i klávesnicí. E-mail zákazníkovi se neposílá |
| Optimistické akce | přesun a změna délky v mřížce volají `run(…, …, { refresh: false })`: `revalidatePath` v akci už vrací čerstvou stránku, druhé `router.refresh()` by jen zdržovalo. Selhání vrátí blok a toast řekne proč |
| Přehlednost | `getCalendarData` vrací `openingRows` (minuty dne, i směny pracovníků) a `staff.color`; `lib/ws/calendar-layout.ts`: `openRangesFor`, `closedSegments` (stínování mimo otevírací dobu), `freeGaps` + `gapSegments` (mezery ≥ 60 min v Den, jen v sloupci s termínem). Barva pracovníka: `lib/ws/staff-colors.ts` (`staffAccent`: uložená `#rrggbb`, jinak tokeny `--staff-1…5` v `app/ws-tokens.css`), jen při víc pracovnících; filtr `?kdo=<id>` (`StaffFilter`). Skok na datum `DateJump` (mini-měsíc z `react-day-picker` se načítá líně) |
| Telefon | `CalendarAgenda`: u každého dne „+ Rezervace“ (≥ 44 px), prázdný den nabízí Najít volný čas, termíny mají barvu pracovníka; `SwipeDays` přepne přejetím na další/předchozí období (jen vodorovné přejetí) |
| Zakázky | `/w/[byznys]/zakazky`: `?pohled=tabule\|seznam` (bez volby telefon seznam, počítač tabule), `?filtr=ceka\|po-terminu\|bez-terminu`. Pravidla filtrů v `lib/ws/job-filters.ts` (čistá funkce, `jobFlags`, `matchesJobFilter`, `countJobFilters`, `jobFactsFrom`, `parseJobFilter`, `parseJobView`); `getJobBoard` vrací i `last_end` a `closed_at`. Komponenty `components/ws/app/jobs/`: `job-card.tsx` (kompaktní karta a sdílená logika), `job-board.tsx` (tabule, přetahování myší), `job-list.tsx` (seznam po stavech bez vodorovného posunu), `use-move-job.ts` (přesun se „Zpět“ pro tabuli, seznam i panel), `job-stage-control.tsx` (stav a „Vystavit fakturu“ v panelu), `job-summary.tsx` (shrnutí nahoře a historie stavů) |
| Historie stavů | `setJobStage` zapisuje do `ws.audit_log` (`job.stage_changed`, `entity = 'job'`, `details` s názvy stavů „z“ a „na“) v téže SQL větě jako změnu; stejný stav nic nezapisuje. `getJobDetail` čte posledních 15 záznamů. Bez migrace; platí od 2026-10-18 |
| Testy | `lib/ws/__tests__/ws-calendar.test.ts` (návrhy, rady k času, mezery a stínování, barvy, délka a kolize, kontrola konkrétního pracovníka, hledání zákazníka, oddělení účtů) a `ws-jobs-board.test.ts` (filtry, pohled, data tabule, přesun, historie, cizí účet) |

### Rezervace více služeb a skupinové lekce (RD08/RD09, R-063)

- Více služeb: `components/ws/order/order-flow.tsx` a `lib/ws/intake/` přijímají nejvýše pět různých služeb; server znovu ověřuje jejich příslušnost k byznysu, pracovníka a celkovou délku. Termíny jsou sousedící řádky `ws.appointments` se stejným `group_id`; potvrzení, přesun, zrušení i obnovení zachovají skupinu jako jeden blok. Pořadí služeb poptávky drží `ws.request_services`.
- Skupinové lekce: majitel vytvoří budoucí samostatnou lekci z Kalendáře s jednou službou, pracovníkem a kapacitou 2–30. `ws.sessions` odkazuje na jeden termín pracovníka; `ws.session_attendees` a `requests.session_id` propojují jednotlivé poptávky. Server atomicky rezervuje místo i při souběžných odesláních; potvrzení účastníka nevytváří nový termín. Majitel může jednotlivé přihlášky potvrdit/odmítnout a zastavit/obnovit registraci. Odmítnutí uvolní místo; čekací listina ani souběžná obsluha více zákazníků jedním pracovníkem není.
- Migrace 090 a 091 jsou aplikované na produkci i testovací DB. Nové tabulky jsou v `seedAccount()` a mají account RLS. Testy: `ws-bookings.test.ts`, `ws-intake.test.ts`, `ws-portal.test.ts`, `ws-gdpr.test.ts`, `ws-schema.test.ts`.

### Návody (RD14)

`app/w/[business]/navody/` má rozcestník a témata; obsah je typovaný v `lib/ws/guides/index.ts`, hledání ignoruje diakritiku a návody se filtrují podle zapnutých funkcí. `HelpLink` se zobrazuje v záhlaví obrazovek. Jde o statický obsah bez nové tabulky; test `ws-guides.test.ts` hlídá existenci odkazovaných cest, filtrování a hledání.

### Jak je to v kódu (S10, R-044)

| Co | Kde |
|---|---|
| Zápisy | `lib/ws/bookings.ts` (`server-only`): `confirmRequest` (chtěný čas, nebo jiný → stav `rescheduled`; s kalendářem termín, se zakázkami zakázka v prvním rozpracovaném/novém stavu), `declineRequest`/`reopenRequest`, `createBooking` (zákazník přes `findOrCreateCustomer` podle telefonu, pak e-mailu), `moveAppointment` (vrací předchozí místo), `cancelAppointment`/`restoreAppointment`, `createBlock`, `setJobStage`, `checkSlot` (tip volno/koliduje), `ensureStaff`, `normalizePhone`. Každý zápis = jeden příkaz v transakci; pracovník, služba a stav z formuláře se dohledají v účtu i byznysu |
| Server actions | `app/w/[business]/poptavky/actions.ts`: `confirmRequest`, `declineRequest`, `reopenRequest`, `createManualBooking`, `moveAppointment`, `cancelAppointment`, `restoreAppointment`, `createBlock`, `moveJobStage`. Vstup `{ slug, … }`, čas jako `{ day: 'YYYY-MM-DD', minutes }` (Praha); `assertWritable`; `revalidatePath('/w/<slug>', 'layout')`; chyby jako české věty |
| Čtení | `lib/ws/calendar.ts`: `getCalendarData`, `getBookingOptions`, `getRequestsList` (Nové / Potvrzené = termín ještě nebyl nebo otevřená zakázka / Vyřízené), `getAppointmentDetail`, `getJobBoard`, `getChangeStamp` |
| Obrazovky | `/w/[byznys]/poptavky` (`?stav=potvrzene` nebo `vyrizene`), `/kalendar` (`?pohled=den` nebo `mesic`, `?datum=`; Den = sloupce podle pracovníků + sloupec nových poptávek, na telefonu seznam; vedle mřížky pruh Příchozí se všemi čekajícími poptávkami z `getIncoming` — od 1280 px vpravo, užší obrazovky ho mají pod kalendářem jen při nějaké poptávce, R-057), `/zakazky` (tabule podle `ws.stages`, přesun přetažením nebo výběrem) |
| Pravý panel | `?detail=termin:<id>` (Přesunout, Zrušit), `nova-rezervace` (formulář, předvyplnění `kdo`, `den`, `cas`, `sluzba`, `pracovnik`), `nova-blokace`; poptávka má Potvrdit / Jiný čas / Odmítnout a tip „Termín je volný / Koliduje s…“ |
| Komponenty | `components/ws/app/booking/` (tlačítka poptávky, formuláře, `useWsAction`, `undoToast` 8 s, `LiveRefresh`), `components/ws/app/calendar/` (`TimeGrid` s přetahováním, `MonthGrid`, `CalendarAgenda`), `components/ws/app/jobs/job-board.tsx`; karta nové poptávky `IncomingCard` v `today/incoming-list.tsx` |
| Živé obnovení | `LiveRefresh` v `AppFrame` se každých 10 s ptá `GET /api/ws/[byznys]/zmeny` s `If-None-Match` (304 bez změny, jinak nový ETag → `router.refresh()`); skrytá karta se neptá |
| Testy | `lib/ws/__tests__/ws-bookings.test.ts` (potvrzení, jiný čas, zakázka, kolize i souběžně, Zpět, cizí účet, zákazník a pracovník) |

- Odmítnutí, zrušení, přesun termínu i zakázky se provede hned a toast nabídne „Zpět“ na 8 s (`undoToast`). Potvrzení „Zpět“ nemá — termín jde zrušit.
- Návštěva musí mít pracovníka: byznys bez pracovníků dostane při prvním termínu jednoho se jménem byznysu (`ensureStaff`, R-044). Sloupce a výběr „Kdo“ se ukazují až od dvou pracovníků.
- Blokace bez pracovníka (celý byznys) DB omezení nehlídá — ukáže se v kalendáři a v tipu u poptávky, ruční rezervace přes ni projde.

### Jak je to v kódu (S16, R-051)

| Co | Kde |
|---|---|
| Veřejný portál | `/z/[token]` bez přihlášení, Dílky + akcent byznysu; čekající poptávka ukazuje jen službu, požadovaný čas a stav bez kontaktu. Po potvrzení se stejný token otevře jako termín; portál pak ukáže termín a případné další funkce. `app/z/layout.tsx` drží vynucenou CSP a `noindex` |
| Oprávnění | náhodné UUID z DB; `ws.portal_lookup` vrátí jen účet/byznys/druh/ID, pak `lib/ws/portal.ts` použije `wsDb` s RLS a filtry. Token poptávky platí jen pro nezkouškovou poptávku s připojeným zákazníkem; po výmazu zákazníka se skryje. Neplatný, cizí, archivovaný i vypnutý odkaz = stejná 404 |
| Termín | přesun a zrušení podle `businesses.settings.portal_change_hours`; volné časy z `lib/ws/intake`, současný termín se při výpočtu vynechá, konečná kolize zůstává atomicky v DB |
| Zakázka | `ws.job_updates` jsou jediné zprávy viditelné zákazníkovi; interní poznámky, kontakty a `field_values` se nenačítají. Detail v pravém panelu: `?detail=zakazka:<uuid>`, zpráva, výsledek a odkaz |
| Hodnocení a faktura | `ws.reviews`, jednou po dokončení; PDF `/z/[token]/faktura/[id]` jen pro vystavenou/zaplacenou fakturu dané zakázky, `private, no-store` |
| Veřejné akce | `app/z/[token]/actions.ts`: Zod, honeypot hodnocení, limit IP i záznamu; účet ani byznys nepřijímá z klienta |
| Testy | `lib/ws/__tests__/ws-portal.test.ts`: neplatný/cizí token, RLS, žádné interní poznámky, pravidla změny, kolize, zrušení, hodnocení a e-mail k zakázce |

### Jak je to v kódu (S14, R-049)

- Peníze: `app/w/[business]/{penize,faktury,prijmy,dane}`; obrazovka `components/ws/money/page.tsx`, formuláře a seznam odděleně v `invoice-form.tsx`, `invoice-list.tsx` a `forms.tsx`. Filtr vystavených faktur je v URL (`stav=open|overdue|paid`), součty se drží po měně; `rozsah=ucet` zahrne byznysy účtu.
- `lib/ws/money/{schema,calculations,data,ai,pdf,deadlines,reminders}`: validace, haléře a oddělené měny, čtení pod RLS, vystavení/platba přes SECURITY INVOKER funkce. Řadu a `money_issue` hlídá 080 (R-049); 088 přidává `invoice_profile` na účet a bezpečné `money_unpay`.
- Nový profil dodavatele (`app/w/[business]/nastaveni/firma`, `components/ws/money/issuer-profile-form.tsx`) smí měnit jen vlastník. `ws.accounts.invoice_profile` je výchozí pro nové doklady; uložené údaje starších faktur se nemění. Nová faktura předvyplní zákazníka z karty, poptávky nebo zakázky, hotovou zakázku a službu s cenou z ceníku. Filtry mají jedno kliknutí „Zaplaceno“ a krátké „Zpět“; 088 rozlišuje platbu vytvořenou fakturou a převzatou ze zakázky, aby se existující příjem nesmazal.
- PDF API `/api/ws/[business]/faktury/[id]/pdf` kontroluje účet/byznys/modul, vrací attachment a `private, no-store`. Přijatý soubor max. 4 MB s magic bytes `%PDF-`. Puppeteer/Chromium je externalizované v `next.config.mjs`, binárky přibalené k routě; písma s OFL v `lib/ws/money/assets/`. PDF dostane SPAYD QR pouze na nezaplacené vystavené faktuře v CZK s platným IBANem.
- AI přepis: existující serverový `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`, max. 10/h/účet; při chybě ruční zadání. Odeslání faktury využívá frontu S15; tlačítko se nabízí jen při `WS_EMAIL_FROM`, `RESEND_API_KEY` a zapnuté šabloně. Nastavení odesílatele a ověření domény: `docs/workspace/SETUP.md`.
- Odhad jen ověřené sazby 2026, neplátce a CZK; paušální/skutečný/paušální-daň režim, měsíce činnosti, vedlejší činnost, minima, sleva a zálohy. DPH za kalendářní rok, příjmy jen vodítko obratu. /api/ws/[business]/dane/kalendar nabízí ICS s připomínkou 7 dní předem. Zdroje a omezení: [MONEY.md](workspace/MONEY.md).

### Jak je to v kódu (RD11, R-063)

- Přehled Peněz a průvodce Daněmi jsou v `components/ws/money/page.tsx`; odloženou částku na daně a počet faktur po splatnosti skládá stávající datová vrstva a nemění daňový výpočet.
- Režim soukromí je lokální volba zařízení (`lib/ws/privacy.ts`, `components/ws/app/privacy-toggle.tsx`); `WsRoot` přidá na označených jménech a částkách rozostření přes tokeny Dílky. Data ani oprávnění v DB nemění.
- Admin přehled Workspace v `lib/ws/admin/clients.ts` už nečte poznámky, volný obsah auditu ani obsah tabulek zákazníků, poptávek, termínů a peněz; zůstávají jen souhrny účtů, předplatného, byznysů a členů týmu. Připojení vlastníka tabulek má dál technickou možnost číst schéma `ws`; omezení se týká kódu admin konzole. Bez nové migrace; `ws-admin-privacy.test.ts`.

### Jak je to v kódu (S13, R-054)

| Co | Kde |
|---|---|
| Rozcestník a podstránky | `app/w/[business]/nastaveni/{firma,funkce,sluzby,oteviraci-doba,formular,stavy,vernost,skupiny,web,emaily,vzhled}`; profil dodavatele v `firma` mění jen vlastník, ostatní Nastavení vyžaduje `requireRole(ctx,'owner')`. Akce `app/w/[business]/nastaveni/actions.ts` (`prepare`: Zod slugu, vlastník, `assertWritable`), data `lib/ws/settings.ts` → `getSettingsData` |
| Otevírací doba a směny | `ws.opening_hours`: `staff_id NULL` = firma, jinak směny pracovníka; uložení nahradí celý týden (`saveWeekHours`). Pracovník bez řádků pracuje podle firmy. Týden ↔ řádky a kontrola překryvu `lib/ws/hours.ts` (bez DB, sdílí ho formulář), editor `components/ws/settings/week-hours-editor.tsx`. Prázdná doba firmy = zákazník si čas navrhne sám (R-045) |
| Pracovníci | `saveStaff`, `setStaffActive` (posledního aktivního skrýt nejde — `ensureStaff` by založil nového); UI `components/ws/settings/team-settings.tsx` |
| Dovolené a zavřeno | celé dny jako blokace `ws.appointments kind='block'` (`addTimeOff` → `bookings.createBlock`), s pracovníkem hlídá DB překryv, bez pracovníka = celá firma. Zrušení přes `cancelAppointment` + „Zpět“ |
| Kdo dělá službu | `ws.service_staff` ukládá `saveService` se `staffIds` v jedné dávce; prázdné = kdokoli; pracovník z jiného byznysu se vynechá. Volba se ukazuje od dvou aktivních pracovníků |
| Pořadí přetažením | `components/ws/settings/sortable-list.tsx` (`@dnd-kit`, myš, prst za úchyt, klávesnice, české hlášky pro čtečku), uloží `reorderSettings` → `reorder` (`unnest … WITH ORDINALITY`) pro služby, pracovníky, kolonky a stavy; při chybě se pořadí vrátí |
| Testy | `lib/ws/__tests__/ws-settings.test.ts` (týden, směny a volné časy, cizí účet, poslední pracovník, přiřazení služeb, pořadí) |

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

1. `npm run build` a `npm test` prochází. Když běží `next dev`, build přes `npm run build:check` (Next 16 má výstup dev serveru zvlášť v `.next/dev`).
2. Nové pravidlo (oddělení účtů, razítka, segmenty, webhooky) má test ve Vitestu.
3. Admin stránky `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]` fungují jako předtím.
4. UI změna: porovnat s mockupem a s pravidly Dílky, zkontrolovat šířku telefonu.
5. CI (`.github/workflows/ci.yml`) pouští na `main`, `workspace`, `ws/**` a v PR `npx tsc --noEmit` a `npm test` (Node 24, bez secrets a DB); build dělá Vercel u každého pushe. `security.yml` běží na stejných větvích.
6. Testy nemíchají pevná data s `now()`: termín „teď + pár dní“ narazí na pevný termín, až ten den přijde (2026-11-03 tak spadl `ws-email.test.ts`). Pevná data, nebo `now()` daleko od nich; úklid nastavení v `finally`.
7. Chyba obrazovky mimo admin = `error.tsx` se společným `ErrorScreen` (`components/ws/error-screen.tsx`): „Zkusit znovu“ (`retry`) a odkaz na bezpečné místo, bez kódu chyby. Jsou v `app/w`, `app/w/[business]`, `app/r`, `app/z`, `app/klient`, `app/(marketing)`; kořen `app/global-error.tsx` (i pro admin, vlastní `<html>` a tokeny Dílků).

## B13. Bezpečnost

> Platí pro **celé repo** (admin, Workspace, landing page), nejen pro Workspace. Zavedeno v S02 podle skillu `web-security-setup`.

### Bezpečnostní paměť — čti první

Stav zabezpečení je v `.claude/security/`:

| Soubor | Obsah | Kdy číst |
|---|---|---|
| `STATE.md` | současný stav, threat model, otevřené položky, „neměnit bez zeptání" | na začátku každého sezení, které sahá na hlavičky, CSP, proxy, API nebo vstupy |
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
| CSP s nonce per request (`strict-dynamic`), výběr profilu podle cesty | `proxy.ts` + `lib/security/csp.ts` |
| Admin přihlášení (NextAuth), Workspace (Clerk jen `/w`, `/api/ws`) | `proxy.ts` — Clerk větev (`/w`, `/api/ws`) → admin NextAuth → CSP |
| `frame-ancestors` pro `/r/[slug]`, CORS pro `/api/public/v1/*` | `lib/security/embed.ts` (`frameAncestorsFor`, `corsHeaders`, `preflightResponse`); domény z `web_integrations.allowed_origins` — `/r` přes `lib/ws/intake/embed-origins.ts` v proxy, API přes `lib/ws/intake/http.ts` |
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
