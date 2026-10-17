# Paměť projektu — index

> Mapa: **kde co najít**. Žádný obsah, jen ukazatele. Pravidla údržby: [`pravidla.md`](pravidla.md).

## Dokumenty a jejich role

| Soubor | Role | Kdo ho čte | Mění se |
|--------|------|-----------|---------|
| [`../CLAUDE.md`](../CLAUDE.md) | Importy a specifika Claude Code; společná komunikace a protokol v AGENTS.md | Claude Code (auto) | Zřídka — když se mění specifika nástroje |
| [`../AGENTS.md`](../AGENTS.md) | Stručná pravidla pro agenty a povinné čtení podle úlohy; při rozporu s CLAUDE.md má přednost | Každý AI nástroj | Při změně společných pravidel |
| [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md) | Závazná podrobná pravidla a technická fakta z původního AGENTS.md: hranice, A (příkazy/env), B1–B13 (Workspace, testy, bezpečnost), git a paměť | Podle oblasti úlohy, povinně podle AGENTS.md | Při změně popsaného kódu nebo pravidel |
| [`../docs/CODEX.md`](../docs/CODEX.md) | Codex: otevření projektu, worktree, setup, akce, env, synchronizace skillů a bezpečnosti | Codex, VS Code, desktopový klient | Při změně prostředí Codexu |
| `../.codex/` | Limit projektových instrukcí a lokální prostředí (setup + 5 akcí); skripty `codex-setup.sh` a `sync-agent-context.mjs` v `scripts/` | Codex | Při změně konfigurace nebo pracovních příkazů |
| [`../docs/admin/AGENTS-ADMIN.md`](../docs/admin/AGENTS-ADMIN.md) | Popis kódu admin konzole: stack, DB model a katalog tabulek, struktura, server actions, routy, API, crony, stránky, e-maily, bezpečnost, UX, poznámky pro AI (R-042) | Sezení, které mění admin konzoli | Při změně admin kódu |
| [`index.md`](index.md) | Tahle mapa | Každý AI nástroj | Nový dokument / nová oblast |
| [`pravidla.md`](pravidla.md) | Meta-pravidla paměti — co kam, kdy, formát | Každý AI nástroj | Zřídka |
| [`memory.md`](memory.md) | Živý stav, rozhodnutí s důvody, otevřené problémy, changelog | Každý AI nástroj | **Po každé dokončené změně** |
| `archiv/` | Starší části changelogu: `2026-10.md`, `2026-06-az-09.md` (viz pravidla §4) | Při pátrání v historii | Při archivaci |
| [`../.env.example`](../.env.example) | Zdroj pravdy pro env proměnné | — | Nová env proměnná |
| [`../.claude/security/STATE.md`](../.claude/security/STATE.md) | Bezpečnostní stav: hlavičky, CSP, threat model, DNS, otevřené položky; vedle `DECISIONS.md`, `CSP-LOG.md`, `AUDIT-LOG.md` (R-029) | Sezení, které sahá na hlavičky, CSP, proxy, API, vstupy | Se každou bezpečnostní změnou |
| [`../.agents/security/STATE.md`](../.agents/security/STATE.md) | Identická kopie `.claude/security/`, včetně záznamů a kontrolního skriptu | Codex a další agenti | Při synchronizaci s `.claude/security/` |
| [`../docs/FINANCE_SYSTEM_PLAN.md`](../docs/FINANCE_SYSTEM_PLAN.md) | Plán finance/faktury/daně — **hotový** (fáze 0–8), zafixovaná rozhodnutí a daňové parametry 2026 | Při práci na Financích/fakturách/daních | Jen když se mění daňová pravidla |
| [`../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md`](../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md) | Plán poznámek, sjednocení nákladů, šablon webu a drag-and-drop — implementováno | Při práci na Hovorech/poznámkách/nákladech/šablonách | — |
| [`../docs/workspace/PLAN.md`](../docs/workspace/PLAN.md) | Produktový a designový plán Workspace — zdroj pravdy pro rozsah (export z Claude Docs; při rozporu platí Rozhodnutí v memory.md) | Při každém sezení Workspace | Novým exportem, když se změní plán |
| [`../docs/workspace/SETUP.md`](../docs/workspace/SETUP.md) | Databáze Workspace: pořadí migrací 064+, založení role `ws_app`, výměna hesla, jak běží testy oddělení účtů v PGlite | Při práci na DB Workspace a nasazení | Když se mění postup nebo testy |
| `../.claude/skills/zakaziq-*` | Projektové skilly: `design-dilky` (UI), `workspace-backend` (DB/API/Clerk/Stripe), `ux-texty-cs` (texty), `memory` (rituál sezení nad `memory/`) | Claude Code (podle úlohy) | Když se mění pravidla oblasti |
| `../.agents/skills/zakaziq-*` | Kopie všech projektových skillů z `.claude/skills/`, včetně referencí | Codex a další agenti (podle úlohy) | Při synchronizaci s `.claude/skills/` |
| [`../new - area of zakaziq/prompty/00-README.md`](<../new - area of zakaziq/prompty/00-README.md>) | Prompty sezení S00–S19 pro výstavbu Workspace + landing page (jedno sezení = jedna konverzace) | Na začátku každého sezení Workspace | Když se mění plán sezení |
| [../docs/workspace/MONEY.md](../docs/workspace/MONEY.md) | Peníze S14: faktury/PDF/platby, přehledy, odhad daní a ověřené zdroje 2026, migrace 080 | S14/S15, finance | Při změně kódu, sazeb a postupu |
| [`../docs/workspace/API.md`](../docs/workspace/API.md) | Veřejné API pro poptávky z webů (v1): klíče, schema, requests, kódy chyb, příklady Next.js a curl, widget (S11) | S11+, skill `zakaziq-napojeni`, prompt pro Claude Code | Když se mění API |
| [`../docs/landing/PROJECT-BRIEF.md`](../docs/landing/PROJECT-BRIEF.md) | Brief landing page (S03): anti-šablona, sekce s texty, kontakt, CSP, SEO zadání pro S05 | S04, S05 a každá změna landing page | Když se mění struktura nebo texty landing page |
| [`../docs/CLAUDE_BOOKING_PROMPT.md`](../docs/CLAUDE_BOOKING_PROMPT.md) | Historický prompt pro booking a komunikaci s klienty (z doby ProjectIQ) | Jen pro kontext historie | Ne |
| `../graphify-out/` | Znalostní graf kódu (gitignored, lokální) — `/graphify` | Při orientaci v architektuře | Přegenerováním |

## Kde co najít podle úlohy

| Chci… | Podívej se |
|-------|-----------|
| Zjistit, na čem se naposledy pracovalo | `memory.md` → Aktuální stav, Changelog |
| Pochopit, proč je něco udělané „divně" | `memory.md` → Rozhodnutí; pak komentář v kódu / migraci |
| Upravit zakázky (VIZEON/ALTENO) | `app/actions.ts`, `components/ProjectForm.tsx`, `ProjectCard.tsx`, `lib/business.ts` |
| Klientský portál | `app/p/[token]/page.tsx`, `app/portal-actions.ts`, `components/Feedback*`, `Booking*` |
| Rezervace / kalendář / sloty | `lib/prague-time.ts`, `components/SmartCalendar.tsx`, `BookingModal.tsx`, `app/calendar-actions.ts` |
| Poptávky z webů (vizeon.cz, alteno.cz) | `lib/web-booking.ts`, `app/api/public/booking/**`, `app/api/public/alteno-leads`, `components/BookingCard.tsx` |
| Hovory / leady | `app/calls-actions.ts`, `components/LeadsTable.tsx`, `lib/portfolio-email.ts`, `app/api/public/{leads,agent-leads}` |
| Dokončené, dotazník, hodnocení | `app/completed-actions.ts`, `app/h/[token]`, `components/SurveyForm.tsx`, `HodnoceniDashboard.tsx` |
| Faktury | `app/hub/finance/invoice-actions.ts`, `lib/invoices.ts`, `lib/invoice-ai.ts`, `components/Invoice*`, `docs/FINANCE_SYSTEM_PLAN.md` |
| Daně | `lib/tax.ts`, `lib/tax-constants.ts`, `lib/tax-deadlines.ts`, `lib/tax-news.ts`, `components/Tax*` |
| Náklady | `app/costs-actions.ts`, `components/CostsManager.tsx` |
| Šablony webu | `app/block-templates-actions.ts`, `app/project-blocks-actions.ts`, `components/Block*`, `ProjectBlockList.tsx` |
| Emaily | `lib/email.ts` (+ `adminEmailFor` v `lib/business.ts`) |
| Veřejná API — auth, rate limit | `lib/api-auth.ts`, `lib/api-rate-limit.ts` |
| Bezpečnostní hlavičky, CSP, CORS, rámování | `next.config.mjs`, `proxy.ts`, `lib/security/`, `.claude/security/` |
| Crony | `vercel.json`, `app/api/cron/**` |
| Hub (osobní moduly) | `app/hub/**`, `components/HubSidebarNav.tsx` |
| Landing page | `../docs/landing/PROJECT-BRIEF.md`, `app/(marketing)/` |
| Workspace (SaaS) — rozsah, stav sezení | `../docs/workspace/PLAN.md`, `memory.md` → Aktuální stav (tabulka S00–S19), `docs/AGENTS-REFERENCE.md` → Část B |
| Workspace — přihlášení, registrace, nový byznys (Clerk) | `docs/AGENTS-REFERENCE.md` → B4 „Jak je to v kódu“, `proxy.ts`, `app/w/layout.tsx`, `app/w/novy/`, `lib/ws/{onboarding,clerk-orgs,clerk-webhook,paths}.ts`, `app/api/clerk/webhook`, R-037 |
| Workspace — kostra aplikace, Dnes, ⌘K, pravý panel | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S09)“, `app/w/[business]/`, `components/ws/app/`, `lib/ws/{today,nav,detail-param,command-parser,calendar-layout,search}.ts`, ukázková data `scripts/ws-seed.mjs`, R-040 |
| Workspace — poptávky, kalendář, zakázky, živé obnovení | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S10)“, `lib/ws/{bookings,calendar}.ts`, `app/w/[business]/{poptavky,kalendar,zakazky}/`, `components/ws/app/{booking,calendar,jobs}/`, `app/api/ws/[business]/zmeny`, R-044 |
| Workspace — veřejné API, objednávací stránka `/r`, widget `/embed`, Nastavení › Napojený web | `docs/AGENTS-REFERENCE.md` → B6 „Jak je to v kódu (S11)“, `../docs/workspace/API.md`, `lib/ws/{keys,fields}.ts`, `lib/ws/intake/`, `app/api/public/v1/`, `app/r/`, `app/embed/`, `app/w/[business]/nastaveni/`, R-045 |
| Workspace — e-maily, upozornění, odkazy z e-mailů, novinky | `docs/AGENTS-REFERENCE.md` → B7 „Jak je to v kódu (S15)“, `lib/ws/email/`, `app/z/`, `app/w/[business]/nastaveni/emaily/`, `docs/workspace/SETUP.md` → E-maily, R-050 |
| Workspace — Nastavení (funkce, služby, otevírací doba, pracovníci, kolonky, stavy, pořadí) | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S13)“, `app/w/[business]/nastaveni/`, `components/ws/settings/`, `lib/ws/{settings,hours}.ts`, R-054 |
| Workspace z adminu — klienti, pozvání, klíče webu, novinky (S17) | `docs/AGENTS-REFERENCE.md` → B3 „Admin nad Workspace (S17, R-052)“, `app/dashboard/{klienti,novinky}/`, `lib/ws/admin/`, `lib/ws/news-format.ts`, `.claude/security/DECISIONS.md` #013 |
| Workspace — databáze, oddělení účtů | `../docs/workspace/SETUP.md`, `migrations/064_ws_*`–`083_ws_*`, `lib/ws/db.ts`, `lib/ws/context.ts`, `lib/ws/templates/`, `lib/ws/__tests__/`, `docs/AGENTS-REFERENCE.md` → B3 |
| Typy | `lib/types.ts`, `types/*.ts` (Zod schémata API) |
| DB schéma | admin: `docs/admin/AGENTS-ADMIN.md` → Databázový model + Katalog tabulek; Workspace: `docs/AGENTS-REFERENCE.md` → B3; detail v `migrations/` |
| Testy | `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |

## Mimo tento repozitář

- **vizeon.cz** a **alteno.cz** — samostatné repozitáře webů; volají veřejná booking/leads API.
- **vizeon-lead-agent** — Python/FastAPI, posílá leady na `/api/public/agent-leads` (`ZAKAZIQ_API_KEY` tam = `VIZEON_AGENT_API_KEY` tady).
- **n8n** — chatbot leady (`/api/public/leads`) a faktury z emailu (`/api/public/invoices`).
- **Vercel** — produkce, env proměnné, crony. **Neon** — databáze.
