# ZakazIQ — CLAUDE.md

> **Chování a proces pro Claude Code.** Stručná pravidla jsou v `AGENTS.md`, technická fakta a úplné postupy v `docs/AGENTS-REFERENCE.md`, stav práce a historie v `memory/memory.md`. Tenhle soubor neopakuje ani jedno — jen říká, *jak* v projektu pracovat.

Tyto soubory se načítají automaticky do každého sezení:

@AGENTS.md
@memory/index.md
@memory/pravidla.md
@memory/memory.md

---

## Co je tohle repo

Jedna Next.js aplikace se třemi částmi:

| Část | Cesty | Přihlášení | Stav |
|---|---|---|---|
| **Admin konzole** (Kryštofův osobní systém) | `/dashboard/*`, `/hub/*`, `/login`, `/p/[token]`, `/h/[token]` | NextAuth (jeden admin) | mění se jen v sezeních AD00–AD18 (R-082), dokumentace v `docs/admin/AGENTS-ADMIN.md` |
| **ZakazIQ Workspace** (SaaS pro firmy) | `/w/*`, `/api/ws/*`, `/api/public/v1/*` | Clerk | ve výstavbě |
| **Landing page** | `/` a marketingové stránky v `app/(marketing)/` | žádné | ve výstavbě |

Workspace je přehled podnikání pro malé firmy (kadeřnictví, zámečnictví, studnařství, likvidace azbestu…): poptávky z webu, kalendář, zákazníci a věrnostní karty, zakázky, faktury, příjmy, odhad daní. Jeden tarif **249 Kč měsíčně** přes Stripe, registrace přímo z landing page.

## Komunikace a průběh práce

Společná pravidla komunikace, schvalování a začátku/konce sezení jsou v `AGENTS.md` → **Komunikace a protokol sezení**. Platí i pro Claude Code. Paměť je načtená přes importy výše; navazuj na aktuální stav a rozhodnutí.

## Workspace — tvrdá pravidla

Nejdůležitější výtah — základy jsou v `AGENTS.md` → Hranice v repu; úplná pravidla v `docs/AGENTS-REFERENCE.md` → Část B (čti podle úlohy).

- **Admin konzoli neměň** (mimo sezení modernizace AD00–AD18). Žádný soubor v `app/dashboard`, `app/hub`, `app/(auth)`, `app/p`, `app/h`, `app/*-actions.ts`, `lib/lead-origins.ts` ani stávající `components/*.tsx`. Co se přebírá, zkopíruj do `lib/ws/` nebo `components/ws/` a uprav tam.
- **Data klientů jsou oddělená.** Každý přístup do schématu `ws` jde přes `requireWorkspace()` a filtruje `account_id`. `account_id` nikdy nečti z formuláře ani z URL.
- **Vzhled jen podle design systému Dílky** (skill `zakaziq-design-dilky`). Žádné natvrdo zapsané barvy, žádná „AI šablona".
- **Jednoduchost je tvrdé pravidlo.** Jedna hlavní akce na obrazovce, obyčejná čeština, nastavení volitelné. Texty pro lidi piš podle skillu `zakaziq-ux-texty-cs`.
- **DB změna = nová idempotentní migrace** v `migrations/` (navazuje na 063, tedy od 064).

## Protokol sezení

Postupuj podle `AGENTS.md` → **Komunikace a protokol sezení** a `memory/pravidla.md`. Před větší změnou ověř B12; při běžícím vývojovém serveru použij `npm run build:check`. Pravidla pro skutečné migrace a externí služby jsou společná pro všechny agenty.

## Skilly

Projektové skilly (`.claude/skills/`, identická kopie pro Codex v `.agents/skills/`):

| Skill | Kdy |
|---|---|
| `zakaziq-design-dilky` | jakákoli UI práce ve Workspace, portálu, landing page, e-mailech |
| `zakaziq-workspace-backend` | DB, migrace, server actions, API, Clerk, Stripe, příjem poptávek |
| `zakaziq-ux-texty-cs` | každý text, který uvidí uživatel nebo zákazník |
| `zakaziq-memory` | začátek a konec sezení, zápis rozhodnutí — zapisuje do `memory/` podle `memory/pravidla.md` |

Uživatelské skilly, které projekt používá: `web-security-setup` (+ `web-security-memory`, `web-security-audit`, `web-security-review`), `web-project-brief`, `humanize-text-cs`, `frontend-design`, `seo` + `seo-quality-principles` (R-022). Řemeslné skilly třetích stran a jejich meze v ZakazIQ: `docs/AGENTS-REFERENCE.md` → Skills (R-080). `design-taste-frontend` (tasteskill 2.5.1) je od 2026-11-10 uživatelský, ne v repu.

## Kde co najdeš

- `AGENTS.md` — stručná závazná pravidla a povinné čtení podle úlohy; `docs/AGENTS-REFERENCE.md` — úplný přehled A/B1–B13. Při rozporu s CLAUDE.md platí AGENTS.md včetně reference
- `memory/` — stav, rozhodnutí, otevřené problémy, changelog (mapa v `memory/index.md`)
- `docs/workspace/PLAN.md` — produktový plán Workspace (zdroj pravdy pro rozsah; export z Claude Docs — při rozporu s Rozhodnutími v `memory/memory.md` platí Rozhodnutí)
- `.claude/security/` — bezpečnostní stav: `STATE.md`, `DECISIONS.md`, `CSP-LOG.md`, `AUDIT-LOG.md` (S02)
- `new - area of zakaziq/prompty/` — připravené prompty pro jednotlivá sezení S00–S19 (rozcestník `new - area of zakaziq/prompty/00-README.md`)

## Git

Pravidla (větve, kdy commitovat, formát zpráv) jsou v `AGENTS.md` → B12. Ověření a Git. Zkráceně:
- **Workspace + landing** → větev `workspace`, commit po každém uceleném kroku, `ws/oblast: …`.
- **Admin konzole** → `main`, commit jen na požádání, `feat: …` / `fix: …`.
- Push na `main` = produkční deploy → před pushem se zeptej. `.env.local` nikdy necommituj ani nevypisuj.

## Bezpečnost — povinné

Základy jsou v **`AGENTS.md` → B13**, plná závazná pravidla v **`docs/AGENTS-REFERENCE.md` → B13** (platí pro celé repo). Stav zabezpečení je v **`.claude/security/`**:

- `STATE.md` — co teď platí, otevřené položky, co neměnit bez zeptání. **Čti na začátku sezení**, které sahá na hlavičky, CSP, middleware, API nebo vstupy.
- `DECISIONS.md` — proč jsou výjimky, s datem revize. `CSP-LOG.md` — každá změna CSP a proč. `AUDIT-LOG.md` — audity a incidenty.

Bezpečnostní změna = zápis do odpovídajícího souboru ve stejném commitu. Po změně `.claude/security/` nebo `.claude/skills/` spusť `node scripts/sync-agent-context.mjs --write` a ověř `--check`; Codex tak čte totožný obsah v `.agents/`.

Tři nejdůležitější:
1. **CSP neoslabuj, aby něco fungovalo** — žádné `unsafe-inline`/`unsafe-eval` ve `script-src`, žádný wildcard, žádné mazání direktivy. Nepasuje-li funkce do politiky, řekni to.
2. **Žádný secret tam, kam dosáhne prohlížeč**, ani přes `NEXT_PUBLIC_`. Commitnutý secret se rotuje, ne jen maže.
3. **Každý vstup validovat na serveru** a nedůvěryhodný vstup nikdy nevykreslovat jako HTML.

Skilly: `web-security-review` před commitem a deployem, `web-security-audit` po deployi, `web-security-memory` při zápisu změny.
