# ZakazIQ — pravidla pro agenty

Platí pro Codex, Claude Code, Cursor, Copilot i lidi. Závaznou součástí je [podrobná reference](docs/AGENTS-REFERENCE.md) s původními sekcemi A/B1–B13; před úpravou čti příslušné části podle tabulky níže. Pravidla mají přednost před `CLAUDE.md`; rozhodnutí v paměti před produktovým plánem. Rozpor neopravuj potichu.

## Komunikace a protokol sezení

- Česky, stručně, věcně (i komentáře, commity, paměť); rozuměj překlepům. Na začátku řekni záměr, průběžně důležitá zjištění, na konci výsledek, skutečné ověření a zbývající kroky.
- Před prací čti [index](memory/index.md), [živý stav a rozhodnutí](memory/memory.md), [pravidla paměti](memory/pravidla.md), plán oblasti a její skilly; zkontroluj větev a `git status`. Codex musí paměť otevřít výslovně, `@soubor` z CLAUDE.md ji neimportuje.
- Navazuj na rozpracované, čti dotčený kód, dokonči a ověř zadání. Cizí změny nepřepisuj, nevracej ani nestaguj. Běžné vratné kroky v zadání nevyžadují další souhlas; mimo zadání schval nové produktové rozhodnutí, změnu rozhodnutí v paměti, destruktivní operaci či deploy. Dřívější souhlas platí dál.
- Skutečné migrace, seed a změny externích služeb jen s výslovným zadáním/souhlasem; příprava SQL a PGlite bez dalšího schválení. `.env.local` může mířit na produkční Neon.
- Každou dokončenou změnu zapiš do changelogu; podle potřeby aktualizuj stav, rozhodnutí a problémy. Technická fakta oprav v referenci, nové dokumenty v indexu; paměť patří do stejného commitu. Historie a stav žijí pouze v `memory/`.

## Kontext a povinné čtení

Jedna Next.js 16 App Router aplikace (React 19, Turbopack, TypeScript strict, Neon bez ORM, Vercel Hobby): osobní admin VIZEON/ALTENO/Hub (NextAuth), veřejná landing page a SaaS Workspace (Clerk, Stripe, Resend). Workspace: poptávky → kalendář → zákazníci/věrnost, zakázky, faktury, příjmy a daně. 249 Kč konečná cena/měsíc, 14 dní s kartou, 1 byznys a neomezeně pracovníků; další byznys v UI vypnutý.

| Úloha | Před prací čti |
|---|---|
| Workspace | `docs/workspace/PLAN.md` (zdroj rozsahu, ne kopie v `new - area of zakaziq/`); reference B1–B2 + dotčená oblast |
| Admin (jen s výslovným zadáním) | `docs/admin/AGENTS-ADMIN.md`, reference A |
| DB, auth, billing, intake, e-maily | reference B3–B7, `docs/workspace/SETUP.md`; veřejné API i `docs/workspace/API.md` |
| UI, navigace, texty | reference B8–B11; landing i `docs/landing/PROJECT-BRIEF.md` |
| Testy / bezpečnost / deploy | reference B12–B13; `.claude/security/STATE.md`, před bezpečnostní změnou `DECISIONS.md`, před CSP `CSP-LOG.md` |
| Codex, worktree, setup a akce | `docs/CODEX.md`; Node.js 24+, `bash scripts/codex-setup.sh` |

## Hranice v repu

- **Admin neměnit bez výslovného zadání:** `app/{dashboard,alteno,hub,(auth),p,h}`, kořenové `app/*-actions.ts`, `components/*.tsx`, `lib/*.ts` a `app/api/*` mimo níže uvedené Workspace API. Převzatý kód kopíruj do `lib/ws/` nebo `components/ws/`, originál zůstává.
- Workspace: `app/w/`, `components/ws/`, `lib/ws/`, `components/ui/`; veřejné `app/{r,embed,z}/`; API `app/api/{ws,public/v1,stripe,clerk}/`. Landing: `app/(marketing)/`, `components/marketing/`. Admin tabulky `public` se nemění.
- DB: pouze nové sekvenční idempotentní migrace od 064; staré neupravuj. Bezpečnostní konfigurace celého repa pouze se zápisem do `.claude/security/` a synchronizací do `.agents/security/`.

## Workspace — nepřekročitelné základy

- Data jen přes `DATABASE_URL_WS`/`ws_app`, schéma `ws`, `requireWorkspace()` a filtr `account_id = ctx.accountId`; účet nikdy z URL/formuláře, byznys ověř proti účtu. RLS je další pojistka, nevypíná se. Vazby jsou složené `(account_id, id)`; novou tabulku doplň do `seedAccount()`.
- Mutace ověřují `assertWritable`; příjem poptávek pokračuje i bez předplatného a selhání notifikace/e-mailu nesmí zrušit uložení. Účty ani data se kvůli neplacení nemažou.
- Server components výchozí, mutace Server Actions + Zod včetně délek, výsledek `Result` bez throw do UI; žádné `any` ani tiché catch. Kolize atomicky v DB (`EXCLUDE`/UNIQUE), `23P01`/`23505` převeď na českou hlášku. Čas `lib/ws/time.ts`, Europe/Prague; peníze v haléřích či `numeric(12,2)`, měny nesčítej.
- Nové závislosti zdůvodni rozhodnutím v paměti; hlavní verze Next/React je samostatný krok s ověřením celého repa (R-053). Novou env zapiš do `.env.example` i referenční tabulky a připomeň Vercel. Novou pevnou cestu `/w` přidej do rezervovaných slugů; zkušební poptávky ve výpisech vynechávej (`NOT r.is_test`).
- Mimo admin pouze **Dílky**: tokeny v `[data-app="ws"]`, překryvy do `WsRoot`, toast přes `components/ui/toast.tsx`; žádné barvy natvrdo, shadcn šedé, gradienty navíc, emoji ani `tailwindcss-animate`. Jedna hlavní akce, detail v pravém panelu, max. 2 kliky z Dnes, ⌘K, Zpět místo potvrzování, užitečný prázdný stav, plochy ≥44 px; začátek do 3 minut, nehotové akce skryté.
- UI texty obyčejně česky, oslovení vy, bez technického žargonu; marketing/e-maily přes `humanize-text-cs`. Nevymýšlej data, čísla, reference ani citace; chybějící údaj `[DOPLNIT]`. Klientská data nemaž mimo výslovnou GDPR žádost.

## B13. Bezpečnost

Neoslabuj CSP (žádné nové `unsafe-inline`/`unsafe-eval` ve skriptech, wildcard ani mazání direktiv). Secrets jen server, žádné citlivé `NEXT_PUBLIC_`, `.env.local` necommituj ani nevypisuj; uniklý klíč rotuj a zaznamenej. Nedůvěryhodné HTML nikdy bez DOMPurify. Veřejné vstupy: serverová validace, limity, honeypot/captcha; webhooky: podpis a idempotence. CORS jen přesné originy, bez `*`/credentials; rámování jen `/r` pro povolené domény. Skript třetí strany nejdřív schval, zapiš CSP a při statickém načtení SRI. Ostatní bezpečnostní pravidla a checklist jsou závazné v referenci B13; bezpečnostní změnu zaznamenej do příslušného souboru `.claude/security/` ve stejném commitu.

## B12. Ověření a Git

Větší změna: `npm test`, `npm run build` (při běžícím dev výhradně `npm run build:check`), regresní kontrola `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]`. Nová byznysová pravidla testuj Vitestem; UI porovnej s Dílky/mockupem i na telefonu. Typy: `npx tsc --noEmit`; `npm run lint` není nastavený (Next 16 `next lint` odstranil). Nevydávej neprovedené kontroly za hotové.

Workspace/landing: větev `workspace` nebo worktree z ní, commit po uceleném kroku, česky `ws/oblast: co a proč`. Admin: `main`, commit jen na požádání, `feat:`/`fix:`/`chore:`/`docs:`. Push na `main` pouze se souhlasem (produkční deploy); žádný force, `--no-verify` ani přepis historie.

## Skills a společný kontext

Povinné podle úlohy: `zakaziq-design-dilky` (UI), `zakaziq-workspace-backend` (data/API), `zakaziq-ux-texty-cs` (texty), `zakaziq-memory` (paměť); pojmenované skilly načti před prací. Bezpečnost: `web-security-memory`, `web-security-review` před commitem/deployem, `web-security-audit` po deployi, `web-security-setup` pro nový základ. Marketing/SEO podle úlohy: `web-project-brief`, `frontend-design`, `humanize-text-cs`, `seo` + `seo-quality-principles`.

Společný zdroj `.claude/{skills,security}/`, identické kopie pro Codex `.agents/{skills,security}/`: po změně `node scripts/sync-agent-context.mjs --write`, pak `--check`; neupravuj kopie nezávisle. Globální skilly `~/.agents/skills/` ani konektory se na jiné prostředí nepřenášejí automaticky; ověř dostupnost. Worktree má vlastní závislosti/build, `.env.local` se nekopíruje automaticky. Nezastavuj cizí server kvůli portu; změň port a ověř auth/platební URL.
