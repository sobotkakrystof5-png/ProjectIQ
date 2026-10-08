# Paměť projektu — index

> Mapa: **kde co najít**. Žádný obsah, jen ukazatele. Pravidla údržby: [`pravidla.md`](pravidla.md).

## Dokumenty a jejich role

| Soubor | Role | Kdo ho čte | Mění se |
|--------|------|-----------|---------|
| [`../CLAUDE.md`](../CLAUDE.md) | Chování a proces Claude Code (komunikace, protokol sezení, git) | Claude Code (auto) | Zřídka — když uživatel změní, jak chce pracovat |
| [`../AGENTS.md`](../AGENTS.md) | Pravidla a technická fakta pro všechny agenty: hranice v repu, A — admin konzole (stack, DB, routy, API, crony, emaily, bezpečnost, UX), B — Workspace (pravidla pro nový kód), git, „nikdy". Při rozporu s CLAUDE.md platí AGENTS.md | Každý AI nástroj | Při změně kódu, který popisuje, nebo pravidel Workspace |
| [`index.md`](index.md) | Tahle mapa | Každý AI nástroj | Nový dokument / nová oblast |
| [`pravidla.md`](pravidla.md) | Meta-pravidla paměti — co kam, kdy, formát | Každý AI nástroj | Zřídka |
| [`memory.md`](memory.md) | Živý stav, rozhodnutí s důvody, otevřené problémy, changelog | Každý AI nástroj | **Po každé dokončené změně** |
| `archiv/` | Starší části changelogu (vzniká až při archivaci, viz pravidla) | Při pátrání v historii | Při archivaci |
| [`../.env.example`](../.env.example) | Zdroj pravdy pro env proměnné | — | Nová env proměnná |
| [`../.claude/security/STATE.md`](../.claude/security/STATE.md) | Bezpečnostní stav: hlavičky, CSP, threat model, DNS, otevřené položky; vedle `DECISIONS.md`, `CSP-LOG.md`, `AUDIT-LOG.md` (R-029) | Sezení, které sahá na hlavičky, CSP, middleware, API, vstupy | Se každou bezpečnostní změnou |
| [`../docs/FINANCE_SYSTEM_PLAN.md`](../docs/FINANCE_SYSTEM_PLAN.md) | Plán finance/faktury/daně — **hotový** (fáze 0–8), zafixovaná rozhodnutí a daňové parametry 2026 | Při práci na Financích/fakturách/daních | Jen když se mění daňová pravidla |
| [`../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md`](../docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md) | Plán poznámek, sjednocení nákladů, šablon webu a drag-and-drop — implementováno | Při práci na Hovorech/poznámkách/nákladech/šablonách | — |
| [`../docs/workspace/PLAN.md`](../docs/workspace/PLAN.md) | Produktový a designový plán Workspace — zdroj pravdy pro rozsah (export z Claude Docs; při rozporu platí Rozhodnutí v memory.md) | Při každém sezení Workspace | Novým exportem, když se změní plán |
| `../.claude/skills/zakaziq-*` | Projektové skilly: `design-dilky` (UI), `workspace-backend` (DB/API/Clerk/Stripe), `ux-texty-cs` (texty), `memory` (rituál sezení nad `memory/`) | Claude Code (podle úlohy) | Když se mění pravidla oblasti |
| [`../new - area of zakaziq/prompty/00-README.md`](<../new - area of zakaziq/prompty/00-README.md>) | Prompty sezení S00–S19 pro výstavbu Workspace + landing page (jedno sezení = jedna konverzace) | Na začátku každého sezení Workspace | Když se mění plán sezení |
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
| Bezpečnostní hlavičky, CSP, CORS, rámování | `next.config.mjs`, `middleware.ts`, `lib/security/`, `.claude/security/` |
| Crony | `vercel.json`, `app/api/cron/**` |
| Hub (osobní moduly) | `app/hub/**`, `components/HubSidebarNav.tsx` |
| Landing page | `../docs/landing/PROJECT-BRIEF.md`, `app/(marketing)/` |
| Workspace (SaaS) — rozsah, stav sezení | `../docs/workspace/PLAN.md`, `memory.md` → Aktuální stav (tabulka S00–S19), `AGENTS.md` → Část B |
| Typy | `lib/types.ts`, `types/*.ts` (Zod schémata API) |
| DB schéma | `AGENTS.md` → Databázový model + Katalog tabulek; detail v `migrations/` |
| Testy | `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |

## Mimo tento repozitář

- **vizeon.cz** a **alteno.cz** — samostatné repozitáře webů; volají veřejná booking/leads API.
- **vizeon-lead-agent** — Python/FastAPI, posílá leady na `/api/public/agent-leads` (`ZAKAZIQ_API_KEY` tam = `VIZEON_AGENT_API_KEY` tady).
- **n8n** — chatbot leady (`/api/public/leads`) a faktury z emailu (`/api/public/invoices`).
- **Vercel** — produkce, env proměnné, crony. **Neon** — databáze.
