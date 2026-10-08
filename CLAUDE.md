# ZakazIQ — CLAUDE.md

> **Chování a proces pro Claude Code.** Technická fakta o projektu jsou v `AGENTS.md`, stav práce a historie v `memory/memory.md`. Tenhle soubor neopakuje ani jedno — jen říká, *jak* v projektu pracovat.

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
| **Admin konzole** (Kryštofův osobní systém) | `/dashboard/*`, `/alteno/*`, `/hub/*`, `/login`, `/p/[token]`, `/h/[token]` | NextAuth (jeden admin) | **beze změny**, dokumentace v `AGENTS.md` |
| **ZakazIQ Workspace** (SaaS pro firmy) | `/w/*`, `/api/ws/*`, `/api/public/v1/*` | Clerk | ve výstavbě |
| **Landing page** | `/` a marketingové stránky v `app/(marketing)/` | žádné | ve výstavbě |

Workspace je přehled podnikání pro malé firmy (kadeřnictví, zámečnictví, studnařství, likvidace azbestu…): poptávky z webu, kalendář, zákazníci a věrnostní karty, zakázky, faktury, příjmy, odhad daní. Jeden tarif **249 Kč měsíčně** přes Stripe, registrace přímo z landing page.

## Kdo je uživatel

Kryštof Sobotka — vlastník projektu, freelancer (VIZEON — weby, ALTENO — AI automatizace), student, OSVČ vedlejší činnost. Admin konzole je jeho osobní nástroj, Workspace je produkt pro cizí firmy. Píše česky, rychle a často s překlepy — vyber smysl, nedoptávej se na pravopis.

## Komunikace

- **Vždy česky** — odpovědi, komentáře v kódu, commit messages, záznamy v paměti.
- Stručně a věcně. Na konci práce krátce: co je hotové, co ne, co má udělat on (např. pustit migraci, nastavit env ve Vercelu).
- Rozhodnutí, která mění chování appky pro klienty (portál, emaily, veřejná API) nebo data (migrace, mazání), **nejdřív navrhni a nech odsouhlasit**.
- Když v kódu narazíš na rozpor s `memory/memory.md` (sekce Rozhodnutí), **neopravuj ho potichu** — rozhodnutí tam je záměrně. Zeptej se.

## Workspace — tvrdá pravidla

Nejdůležitější výtah — úplná pravidla jsou v `AGENTS.md` → Hranice v repu a Část B.

- **Admin konzoli neměň.** Žádný soubor v `app/dashboard`, `app/alteno`, `app/hub`, `app/(auth)`, `app/p`, `app/h`, `app/*-actions.ts`, `lib/business.ts` ani stávající `components/*.tsx`. Co se přebírá, zkopíruj do `lib/ws/` nebo `components/ws/` a uprav tam.
- **Data klientů jsou oddělená.** Každý přístup do schématu `ws` jde přes `requireWorkspace()` a filtruje `account_id`. `account_id` nikdy nečti z formuláře ani z URL.
- **Vzhled jen podle design systému Dílky** (skill `zakaziq-design-dilky`). Žádné natvrdo zapsané barvy, žádná „AI šablona".
- **Jednoduchost je tvrdé pravidlo.** Jedna hlavní akce na obrazovce, obyčejná čeština, nastavení volitelné. Texty pro lidi piš podle skillu `zakaziq-ux-texty-cs`.
- **DB změna = nová idempotentní migrace** v `migrations/` (navazuje na 063, tedy od 064).

## Protokol sezení

**Začátek** (paměť je výše načtená, není třeba ji číst znovu):
1. Projdi `memory/memory.md` → *Aktuální stav* a *Otevřené problémy* — navazuj na rozpracované, ne od nuly.
2. Úloha patří do oblasti s plánem v `docs/`? Přečti ho (mapa v `memory/index.md`). Pro Workspace je zdroj pravdy rozsahu `docs/workspace/PLAN.md`.
3. Jmenuje prompt sezení skill? Načti ho dřív, než začneš psát kód.
4. Napiš jednou větou, co v tomhle sezení uděláš a co **nebudeš** měnit.

**Během práce:**
- Před změnou oblasti si přečti dotčené soubory — paměť říká *kde*, kód říká *jak*.
- Nová migrace → idempotentní, další číslo v pořadí, `node scripts/apply-migration.js <soubor>` spouští uživatel (nebo ty po odsouhlasení).
- Před commitem větší změny: `npm run build`, `npm test` a kontrola, že admin stránky (`/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]`) fungují jako předtím (úplný checklist v `AGENTS.md` → B12). Výsledek hlas po pravdě.

**Konec každé dokončené změny** (ne až na konci sezení — sezení může skončit kdykoliv). Bez toho práce není hotová:
1. Zápis do `memory/memory.md` podle `memory/pravidla.md` — changelog vždy; Aktuální stav, nová rozhodnutí (Rozhodnutí) a otevřené otázky (Otevřené problémy), když se změnily.
2. Změnil se technický fakt (tabulka, routa, env, API, pravidlo)? Oprav `AGENTS.md`.
3. Vznikl nový dokument nebo nová oblast? Doplň `memory/index.md`.
4. Paměť jde do **stejného commitu** jako kód, kterého se týká.

## Skilly

Projektové skilly (`.claude/skills/`):

| Skill | Kdy |
|---|---|
| `zakaziq-design-dilky` | jakákoli UI práce ve Workspace, portálu, landing page, e-mailech |
| `zakaziq-workspace-backend` | DB, migrace, server actions, API, Clerk, Stripe, příjem poptávek |
| `zakaziq-ux-texty-cs` | každý text, který uvidí uživatel nebo zákazník |
| `zakaziq-memory` | začátek a konec sezení, zápis rozhodnutí — zapisuje do `memory/` podle `memory/pravidla.md` |

Uživatelské skilly, které projekt používá: `web-security-setup` (+ `web-security-memory`, `web-security-audit`, `web-security-review`), `web-project-brief`, `humanize-text-cs`, `frontend-design`, `seo` + `seo-quality-principles` (R-022). Chybí zatím `web-security-memory`, `web-security-audit`, `web-security-review` (viz Otevřené problémy).

## Kde co najdeš

- `AGENTS.md` — pravidla a technická fakta pro všechny agenty; část A = admin konzole (popis kódu), část B = Workspace (pravidla pro nový kód). Při rozporu s CLAUDE.md platí AGENTS.md
- `memory/` — stav, rozhodnutí, otevřené problémy, changelog (mapa v `memory/index.md`)
- `docs/workspace/PLAN.md` — produktový plán Workspace (zdroj pravdy pro rozsah; export z Claude Docs — při rozporu s Rozhodnutími v `memory/memory.md` platí Rozhodnutí)
- `.claude/security/` — bezpečnostní stav (vytvoří skill `web-security-setup`)
- `new - area of zakaziq/prompty/` — připravené prompty pro jednotlivá sezení S00–S19 (rozcestník `new - area of zakaziq/prompty/00-README.md`)

## Git

Pravidla (větve, kdy commitovat, formát zpráv) jsou v `AGENTS.md` → Společné → Git. Zkráceně:
- **Workspace + landing** → větev `workspace`, commit po každém uceleném kroku, `ws/oblast: …`.
- **Admin konzole** → `main`, commit jen na požádání, `feat: …` / `fix: …`.
- Push na `main` = produkční deploy → před pushem se zeptej. `.env.local` nikdy necommituj ani nevypisuj.

<!-- Sem se v sezení S02 doplní bezpečnostní blok ze skillu web-security-setup. -->
