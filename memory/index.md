# Paměť projektu — index

> Mapa: **kde co najít**. Žádný obsah, jen ukazatele. Pravidla údržby: [`pravidla.md`](pravidla.md).

## Dokumenty a jejich role

| Soubor | Role | Kdo ho čte | Mění se |
|--------|------|-----------|---------|
| [`../CLAUDE.md`](../CLAUDE.md) | Importy a specifika Claude Code; společná komunikace a protokol v AGENTS.md | Claude Code (auto) | Zřídka — když se mění specifika nástroje |
| [`../AGENTS.md`](../AGENTS.md) | Stručná pravidla pro agenty a povinné čtení podle úlohy; při rozporu s CLAUDE.md má přednost | Každý AI nástroj | Při změně společných pravidel |
| [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md) | Závazná podrobná pravidla a technická fakta z původního AGENTS.md: hranice, A (příkazy/env), B1–B13 (Workspace, testy, bezpečnost), git a paměť | Podle oblasti úlohy, povinně podle AGENTS.md | Při změně popsaného kódu nebo pravidel |
| [`../docs/CODEX.md`](../docs/CODEX.md) | Codex: otevření projektu, worktree, setup, akce, env, synchronizace skillů a bezpečnosti | Codex, VS Code, desktopový klient | Při změně prostředí Codexu |
| [`../PRODUCT.md`](../PRODUCT.md) | Krátká faktická pravda o produktu, rozsahu, zákaznících a povolených tvrzeních | Designové a textové nástroje | Když se mění produktová nabídka |
| [`../DESIGN.md`](../DESIGN.md) | Kanonický vizuální systém ZakazIQ podle Dílky: tokeny, typografie, stavy, komponenty a pravidla | Každá změna vzhledu nebo UI | Při věcné změně systému Dílky |
| [`../.impeccable/design.json`](../.impeccable/design.json) | Strojově čitelná specifikace barev, typografie, komponent a pravidel Impeccable | Impeccable | Při změně `DESIGN.md` |
| `../.codex/` | Limit projektových instrukcí a lokální prostředí (setup + 5 akcí); skripty `codex-setup.sh` a `sync-agent-context.mjs` v `scripts/` | Codex | Při změně konfigurace nebo pracovních příkazů |
| [`../docs/admin/AGENTS-ADMIN.md`](../docs/admin/AGENTS-ADMIN.md) | Popis kódu admin konzole: stack, DB model a katalog tabulek, struktura, server actions, routy, API, crony, stránky, e-maily, bezpečnost, UX, poznámky pro AI (R-042) | Sezení, které mění admin konzoli | Při změně admin kódu |
| [`index.md`](index.md) | Tahle mapa | Každý AI nástroj | Nový dokument / nová oblast |
| [`pravidla.md`](pravidla.md) | Meta-pravidla paměti — co kam, kdy, formát | Každý AI nástroj | Zřídka |
| [`memory.md`](memory.md) | Živý stav, rozhodnutí s důvody, otevřené problémy, changelog | Každý AI nástroj | **Po každé dokončené změně** |
| `archiv/` | Starší části changelogu: `2026-11.md`, `2026-10.md`, `2026-06-az-09.md` (viz pravidla §4) | Při pátrání v historii | Při archivaci |
| [`../.env.example`](../.env.example) | Zdroj pravdy pro env proměnné | — | Nová env proměnná |
| [`../.claude/security/STATE.md`](../.claude/security/STATE.md) | Bezpečnostní stav: hlavičky, CSP, threat model, DNS, otevřené položky; vedle `DECISIONS.md`, `CSP-LOG.md`, `AUDIT-LOG.md` (R-029) | Sezení, které sahá na hlavičky, CSP, proxy, API, vstupy | Se každou bezpečnostní změnou |
| [`../.agents/security/STATE.md`](../.agents/security/STATE.md) | Identická kopie `.claude/security/`, včetně záznamů a kontrolního skriptu | Codex a další agenti | Při synchronizaci s `.claude/security/` |
| [`../docs/FINANCE_SYSTEM_PLAN.md`](../docs/FINANCE_SYSTEM_PLAN.md) | Plán finance/faktury/daně — **hotový** (fáze 0–8), zafixovaná rozhodnutí a daňové parametry 2026 | Při práci na Financích/fakturách/daních | Jen když se mění daňová pravidla |
| [`../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md`](../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md) | Plán poznámek, sjednocení nákladů, šablon webu a drag-and-drop — implementováno; **šablony webu smazány 2026-11-11** (AD01, R-089) | Při práci na Hovorech, poznámkách a nákladech | — |
| [`../docs/workspace/PLAN.md`](../docs/workspace/PLAN.md) | Produktový a designový plán Workspace — zdroj pravdy pro rozsah (export z Claude Docs; při rozporu platí Rozhodnutí v memory.md) | Při každém sezení Workspace | Novým exportem, když se změní plán |
| [`../docs/workspace/REDESIGN-APP-PLAN.md`](../docs/workspace/REDESIGN-APP-PLAN.md) | Implementační plán redesignu Workspace RD00–RD16; schválený rozsah, stav, rozhodnutí a zbývající ověření | Při každém sezení redesignu Workspace | Po každém dokončeném RD |
| [`../docs/admin/MODERNIZACE-ADMIN-PLAN.md`](../docs/admin/MODERNIZACE-ADMIN-PLAN.md) | Plán modernizace admin konzole AD00–AD18: úklid nepoužívaných sekcí, jeden byznys se třemi zdroji poptávek, zrušení Hubu, vzhled na Dílky, rychlost, entita kontaktu, zakázka jako jediná pravda, vystavování faktur, zisk na zakázku, AI asistent, paměť projektu, hodnocení a předání; rozhodnutí, rizika a tabulka stavu (R-081–R-090) | Při každém sezení modernizace adminu | Po každém dokončeném AD |
| [`../new - area of zakaziq/prompty/admin/00-README.md`](<../new - area of zakaziq/prompty/admin/00-README.md>) | Prompty sezení AD00–AD18 pro modernizaci adminu (jedno sezení = jedna konverzace), pořadí a společná pravidla | Na začátku každého sezení adminu | Když se mění rozfázování |
| [`../docs/workspace/SETUP.md`](../docs/workspace/SETUP.md) | Databáze Workspace: pořadí migrací 064+, založení role `ws_app`, výměna hesla, jak běží testy oddělení účtů v PGlite | Při práci na DB Workspace a nasazení | Když se mění postup nebo testy |
| [`../docs/workspace/LAUNCH.md`](../docs/workspace/LAUNCH.md) | Kontrolní seznam před spuštěním Workspace: bezpečnost, provoz, data, právo a podpora | S19 a příprava vydání | Při změně podmínek spuštění |
| [`../docs/workspace/LAUNCH-PLAN.md`](../docs/workspace/LAUNCH-PLAN.md) | Plán realizace spuštění: fáze 0–5, stopy A–E (právní, DNS, Resend, Clerk, Stripe live), kdo co dělá, rizika, rollback | S19, každé sezení k spuštění | Po dokončení kroku / změně pořadí |
| `../.claude/skills/zakaziq-*` | Projektové skilly: `design-dilky` (UI), `workspace-backend` (DB/API/Clerk/Stripe), `ux-texty-cs` (texty), `memory` (rituál sezení nad `memory/`) | Claude Code (podle úlohy) | Když se mění pravidla oblasti |
| `../.agents/skills/zakaziq-*` | Kopie všech projektových skillů z `.claude/skills/`, včetně referencí | Codex a další agenti (podle úlohy) | Při synchronizaci s `.claude/skills/` |
| `../.agents/skills/impeccable/SKILL.md` | Impeccable 4.8.2 (engine 0.1.22): kontrola kvality UI, návrhových pravidel, přístupnosti a opakujících se vzorů; detektor `.claude/skills/impeccable/scripts/impeccable detect` | Implementace a review UI | Při aktualizaci nainstalovaného skillu |
| `~/.claude/skills/`, `~/.agents/skills/` (**mimo repo**) | Řemeslné skilly třetích stran: `design-taste-frontend` (tasteskill 2.5.1) a 19 dalších pro vzhled, pohyb, telefon, kód, data a proces. Rozdělení, kdy co a čím je to v ZakazIQ omezené: reference → Skills | Práce na vzhledu, pohybu, výkonu nebo plánu; dostupnost na novém počítači nebo ve worktree vždy ověř | Při reinstalaci nebo upgradu skillů (R-080) |
| [`../new - area of zakaziq/prompty/00-README.md`](<../new - area of zakaziq/prompty/00-README.md>) | Prompty sezení S00–S19 pro výstavbu Workspace + landing page (jedno sezení = jedna konverzace) | Na začátku každého sezení Workspace | Když se mění plán sezení |
| [../docs/workspace/MONEY.md](../docs/workspace/MONEY.md) | Peníze S14: faktury/PDF/platby, přehledy, odhad daní a ověřené zdroje 2026, migrace 080 | S14/S15, finance | Při změně kódu, sazeb a postupu |
| [`../docs/workspace/API.md`](../docs/workspace/API.md) | Veřejné API pro poptávky z webů (v1): klíče, schema, requests, kódy chyb, příklady Next.js a curl, widget (S11) | S11+, skill `zakaziq-napojeni`, prompt pro Claude Code | Když se mění API |
| [`../docs/landing/PROJECT-BRIEF.md`](../docs/landing/PROJECT-BRIEF.md) | Brief landing page (S03): anti-šablona, sekce s texty, kontakt, CSP, SEO zadání pro S05 | S04, S05 a každá změna landing page | Když se mění struktura nebo texty landing page |
| [`../docs/klientsky-prostor/PLAN.md`](../docs/klientsky-prostor/PLAN.md) | Plán klientského prostoru, hlášení práce z Claude Code a nového adminu: architektura, bezpečnostní model, rozhodnutí D-K1–D-K11, sezení KP00–KP10 a jejich stav | Každé sezení klientského prostoru a změny adminu | Po každém sezení KP |
| [`../docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md`](../docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md) | Jak napojit projekt klienta na hlášení z Claude Code: klíč, skript, pravidlo do CLAUDE.md, hook | Při napojení nového projektu klienta | Při změně API hlášení |
| [`../new - area of zakaziq/prompty/klientsky-prostor/00-README.md`](<../new - area of zakaziq/prompty/klientsky-prostor/00-README.md>) | Prompty sezení KP00–KP10 (jedno sezení = jedna konverzace), pořadí a společná pravidla | Na začátku každého sezení KP | Když se mění rozfázování |
| [`../docs/REDESIGN-HANDOFF.md`](../docs/REDESIGN-HANDOFF.md) | Schválený směr redesignu Landing + Workspace, hranice zadání a startovací kontext pro další chat (R-057) | Před implementací redesignu | Když se změní vybraný směr nebo rozsah |
| [`../new - area of zakaziq/prompty/redesign/00-README.md`](<../new - area of zakaziq/prompty/redesign/00-README.md>) | Prompty sezení RD00–RD16 pro redesign aplikace (jedno sezení = jedna konverzace), pořadí, společná pravidla | Na začátku každého sezení redesignu | Když se mění rozfázování |
| [`../docs/CLAUDE_BOOKING_PROMPT.md`](../docs/CLAUDE_BOOKING_PROMPT.md) | Historický prompt pro booking a komunikaci s klienty (z doby ProjectIQ) | Jen pro kontext historie | Ne |
| `../graphify-out/` | Znalostní graf kódu (gitignored, lokální) — `/graphify` | Při orientaci v architektuře | Přegenerováním |

## Kde co najít podle úlohy

| Chci… | Podívej se |
|-------|-----------|
| Zjistit, na čem se naposledy pracovalo | `memory.md` → Aktuální stav, Changelog |
| Pochopit, proč je něco udělané „divně" | `memory.md` → Rozhodnutí; pak komentář v kódu / migraci |
| Výpis v adminu (řazení, stránkování, filtry) | `lib/admin-table.ts`, `components/admin/{data-table,pagination,table-search}.tsx`, dotazy `lib/admin/{completed,invoices,costs,leads,projects,waitlist}.ts` (AD07) |
| Upravit zakázky | `app/actions.ts`, `components/ProjectForm.tsx`, `ProjectCard.tsx`, `lib/lead-origins.ts` |
| Požadavky klientů z portálu (text/hlas → shrnutí → zadání pro Claude Code) | `lib/{client-requests,client-request-ai,transcribe}.ts`, `app/api/public/portal/[token]/transcribe/`, `app/portal-actions.ts` (`submitClientRequest`), `app/dashboard/pozadavky/`, `components/ClientRequest*.tsx`, migrace 092, R-069, `.claude/security/DECISIONS.md` #018 |
| Klientský portál | `app/p/[token]/page.tsx`, `app/portal-actions.ts`, `components/Feedback*`, `Booking*` |
| Rezervace / kalendář / sloty | `lib/prague-time.ts`, `components/SmartCalendar.tsx`, `BookingModal.tsx`, `app/calendar-actions.ts` |
| Poptávky z webů (vizeon.cz, alteno.cz, prvotka.cz) | `lib/lead-origins.ts`, `lib/web-leads.ts`, `app/api/public/booking/**`, `app/api/public/{alteno,prvotka}-leads`, `app/dashboard/poptavky/`, `components/LeadCard.tsx`, migrace 102, R-088 |
| Hovory / leady | `app/calls-actions.ts`, `components/LeadsTable.tsx`, `lib/portfolio-email.ts`, `app/api/public/{leads,agent-leads}` |
| Dokončené, dotazník, hodnocení | `app/completed-actions.ts`, `app/h/[token]`, `components/SurveyForm.tsx`, `HodnoceniDashboard.tsx` |
| Faktury | `app/dashboard/finance/invoice-actions.ts`, `lib/invoices.ts`, `lib/invoice-ai.ts`, `components/Invoice*`, `docs/FINANCE_SYSTEM_PLAN.md` |
| Daně | `lib/tax.ts`, `lib/tax-constants.ts`, `lib/tax-deadlines.ts`, `lib/tax-news.ts`, `components/Tax*` |
| Náklady | `app/costs-actions.ts`, `components/CostsManager.tsx` |
| Šablony webu | `app/block-templates-actions.ts`, `app/project-blocks-actions.ts`, `components/Block*`, `ProjectBlockList.tsx` |
| Emaily | `lib/email.ts` (+ `adminEmail()` v `lib/lead-origins.ts`) |
| Veřejná API — auth, rate limit | `lib/api-auth.ts`, `lib/api-rate-limit.ts` |
| Bezpečnostní hlavičky, CSP, CORS, rámování | `next.config.mjs`, `proxy.ts`, `lib/security/`, `.claude/security/` |
| Crony | `vercel.json`, `app/api/cron/**` |
| Osobní část adminu (dřív Hub) | `app/dashboard/{finance,projekty,startup}/**`, menu `lib/admin-nav.ts` |
| Landing page | `../docs/landing/PROJECT-BRIEF.md`, `app/(marketing)/` |
| Workspace (SaaS) — rozsah, stav sezení | `../docs/workspace/PLAN.md`, `memory.md` → Aktuální stav (tabulka S00–S19), `docs/AGENTS-REFERENCE.md` → Část B |
| Workspace — přihlášení, registrace, nový byznys (Clerk) | `docs/AGENTS-REFERENCE.md` → B4 „Jak je to v kódu“, `proxy.ts`, `app/w/layout.tsx`, `app/w/novy/`, `lib/ws/{onboarding,clerk-orgs,clerk-webhook,paths}.ts`, `app/api/clerk/webhook`, R-037 |
| Workspace — kostra aplikace, Dnes, ⌘K, pravý panel | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S09)“ a „(RD04)“, `app/w/[business]/`, `components/ws/app/` (společné `page-header.tsx`, `toolbar.tsx`, `today/focus.tsx`), `lib/ws/{today,nav,detail-param,command-parser,calendar-layout,search}.ts`, ukázková data `scripts/ws-seed.mjs`, R-040 |
| Workspace — poptávky, kalendář, zakázky, živé obnovení | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S10)“ a „(RD05 + RD06)“, `lib/ws/{bookings,calendar,calendar-layout,slot-advice,slot-suggest,staff-colors,job-filters,jobs}.ts`, `app/w/[business]/{poptavky,kalendar,zakazky}/`, `components/ws/app/{booking,calendar,jobs}/`, `app/api/ws/[business]/zmeny`, R-044, R-059 |
| Workspace — veřejné API, objednávací stránka `/r`, widget `/embed`, Nastavení › Napojený web | `docs/AGENTS-REFERENCE.md` → B6 „Jak je to v kódu (S11)“, `../docs/workspace/API.md`, `lib/ws/{keys,fields}.ts`, `lib/ws/intake/`, `app/api/public/v1/`, `app/r/`, `app/embed/`, `app/w/[business]/nastaveni/`, R-045 |
| Workspace — e-maily, upozornění, odkazy z e-mailů, novinky | `docs/AGENTS-REFERENCE.md` → B7 „Jak je to v kódu (S15)“, `lib/ws/email/`, `app/z/`, `app/w/[business]/nastaveni/emaily/`, `docs/workspace/SETUP.md` → E-maily, R-050 |
| Workspace — Nastavení (funkce, služby, otevírací doba, pracovníci, kolonky, stavy, pořadí) | `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S13)“, `app/w/[business]/nastaveni/`, `components/ws/settings/`, `lib/ws/{settings,hours}.ts`, R-054 |
| Workspace z adminu — klienti, pozvání, klíče webu, novinky (S17) | `docs/AGENTS-REFERENCE.md` → B3 „Admin nad Workspace (S17, R-052)“, `app/dashboard/{klienti,novinky}/`, `lib/ws/admin/`, `lib/ws/news-format.ts`, `.claude/security/DECISIONS.md` #013 |
| Workspace — databáze, oddělení účtů | `../docs/workspace/SETUP.md`, `migrations/064_ws_*`–`088_ws_*`, `lib/ws/db.ts`, `lib/ws/context.ts`, `lib/ws/templates/`, `lib/ws/__tests__/`, `docs/AGENTS-REFERENCE.md` → B3 |
| Workspace — GDPR (výmaz, export, zrušení účtu), vzhled, PWA (S18) | `docs/AGENTS-REFERENCE.md` → B3 „GDPR, vzhled a PWA (S18)“, `lib/ws/{gdpr,zip,csv,theme}.ts`, `app/w/ucet/`, `app/api/cron/ws-gdpr`, `public/{sw.js,offline.html,zakaziq.webmanifest}`, migrace 084, R-054 |
| Klientský prostor, hlášení z Claude Code, kostra adminu | `docs/AGENTS-REFERENCE.md` → „Klientský prostor a hlášení práce (KP01–KP09)“, `docs/klientsky-prostor/PLAN.md`, `lib/portal/`, `app/klient/`, `components/admin/`, `lib/admin-*.ts`, migrace 093–096, R-070–R-073, `.claude/security/DECISIONS.md` #019–#020 |
| Typy | `lib/types.ts`, `types/*.ts` (Zod schémata API) |
| DB schéma | admin: `docs/admin/AGENTS-ADMIN.md` → Databázový model + Katalog tabulek; Workspace: `docs/AGENTS-REFERENCE.md` → B3; detail v `migrations/` |
| Testy | `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |

## Mimo tento repozitář

- **vizeon.cz** a **alteno.cz** — samostatné repozitáře webů; volají veřejná booking/leads API.
- **vizeon-lead-agent** — Python/FastAPI, posílá leady na `/api/public/agent-leads` (`ZAKAZIQ_API_KEY` tam = `VIZEON_AGENT_API_KEY` tady).
- **n8n** — chatbot leady (`/api/public/leads`) a faktury z emailu (`/api/public/invoices`).
- **Vercel** — produkce, env proměnné, crony. **Neon** — databáze.
