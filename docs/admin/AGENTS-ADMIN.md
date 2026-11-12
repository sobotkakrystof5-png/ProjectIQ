# ZakazIQ — Admin konzole (popis kódu)

> Vyčleněno z `AGENTS.md` (část A) 2026-10-09, aby se popis adminu nenačítal do každého sezení (R-042). **Čti před každou změnou admin konzole.** Příkazy a env proměnné zůstaly v [`../../AGENTS.md`](../../AGENTS.md) → Část A. Pravidla a hranice v repu platí z `AGENTS.md`.

> Kryštofův osobní produkční systém (zakázky, peníze, klientský portál). Popis níže je popis **existujícího kódu** — platí pro údržbu adminu, ne jako vzor pro Workspace.
>
> **Od AD02 (R-088) je to jeden byznys se třemi zdroji poptávek** (vizeon.cz, alteno.cz, prvotka.cz). Sekce `/alteno` zanikla, sloupec `business` se přejmenoval na `lead_origin`.

## Vize a cíl

**ZakazIQ** je jednoduchý nástroj pro freelancery, živnostníky a řemeslníky. V první fázi jde o **osobní nástroj pro vlastní potřebu** — přehled projektů, jejich stav a sdílení s klientem přes jednoduchý link.

**Filozofie UX:** Nejlepší design je ten, který uživatel vůbec nevnímá, protože mu nepřekáží v práci. Freelanceři nemají čas bojovat se složitým softwarem. Chtějí otevřít aplikaci, jedním pohledem zjistit stav byznysu a jedním kliknutím poslat klientovi update.

**Klientský portál musí být absolutně „frictionless"** — žádné registrace, žádná hesla, jen čistá a profesionálně vypadající pravda o projektu.

---

## Tech Stack

| Vrstva | Technologie | Poznámka |
|--------|-------------|----------|
| Frontend | Next.js 16 (App Router) + TypeScript | SSR, App Router — nikdy Pages Router |
| Styling | Tailwind CSS (+ `clsx`, `tailwind-merge`) | Vlastní komponenty, brand-* barvy — shadcn/ui admin nepoužívá |
| Animace | Framer Motion přes `m` + `LazyMotion` v `AdminRoot` (AD08) | Kalendář a čtyři modaly. **Nikdy `motion`** — stáhlo by celý balíček předem; výjimka je `BookingModal` na portálu `/p`, který kořen adminu nemá. Hlídá `components/admin/__tests__/admin-bundle-guard.test.ts`. |
| Ikony | Lucide React | Konzistentní `strokeWidth={1.5}` napříč celou app |
| Databáze | Neon (serverless PostgreSQL) | `@neondatabase/serverless`, připojení přes `DATABASE_URL`. Čtení obrazovek jde od AD06 přes `lib/admin/db.ts` (dávky), starší volání přes `lib/db.ts` |
| Validace | Zod + react-hook-form | `lib/feedback-schema.ts` |
| Auth | NextAuth.js v4 + Credentials | Jediný admin účet v env proměnných, JWT session s platností 12 h (`lib/auth.ts`, od 2026-11-03), zámek 5 chybných pokusů za 15 min na IP, chráněno i přes `proxy.ts` |
| Email | Nodemailer + Gmail SMTP | `lib/email.ts` — dva účty (výchozí + VIZEON) + branded HTML layout |
| Deployment | Vercel | Zero-ops, napojení na GitHub, Hobby plán (crony max 1× denně) |
| AI | `@anthropic-ai/sdk` | AI asistenti (Startup) + AI přepis PDF faktur (`lib/invoice-ai.ts`) |
| PDF | `puppeteer-core` + `@sparticuz/chromium` | Vykreslení PDF (faktury Workspace; admin faktury AD12) |
| Testy | Vitest | `npm test` — testy v `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |


> Příkazy a env proměnné: [`AGENTS.md`](../../AGENTS.md) → Část A.

---

## Databázový model

Základní schéma je v tomto souboru níže. Inkrementální změny (nové tabulky/sloupce, opravy constraintů) jsou v `migrations/*.sql` — čísluj sekvenčně a pište idempotentně (`IF NOT EXISTS`, `DO $$ ... $$` guard na constrainty).

### Jak admin čte z databáze (AD06)

- **`lib/admin/db.ts`** je datová vrstva obrazovek adminu: tag `q`, `adminDb\`…\`` pro
  jeden dotaz a **`adminDb.batch([...])`** pro víc dotazů **jedním požadavkem** (Neon HTTP
  pošle celou transakci najednou). `fetchOptions: { cache: 'no-store' }`, jinak by Next
  odpovědi uložil do data cache a admin ukazoval stará data. `setAdminDbForTests` podstrčí
  ovladač v testech.
- **`batchTolerant([...])`** je dávka, která snese chybějící tabulku: transakce padá celá,
  když jeden dotaz narazí na `client_requests` (092) nebo `project_activity` (093) tam, kde
  ještě nejsou. Při chybě se dotazy zkusí jednotlivě a ten rozbitý vrátí prázdno. Používá
  ho `lib/admin-counts.ts` a `lib/admin-today-queries.ts`.
- **`lib/db.ts` zůstává** kvůli zhruba padesáti souborům, hlavně zápisům a server actions.
  Pravidlo: **nové a přepisované čtení obrazovky jde přes `adminDb`**, zápisy se nepřepisují,
  dokud k tomu není důvod.
- Nezaměňovat s **`lib/ws/admin/db.ts`** — ten je o tom, jak admin čte schéma `ws`
  (data klientů Workspace, R-052). `lib/admin/db.ts` se schématu `ws` nedotkne.
- Kolik požadavků stojí která obrazovka hlídá `lib/__tests__/admin-db-rounds.test.ts`
  jako strop; naměřené hodnoty jsou v plánu modernizace, sekce 11.
- **GET nezapisuje (AD08).** Vykreslení obrazovky nesmí nic ukládat — prefetch odkazu
  v menu by zápis spustil, i když stránku nikdo neotevře, a kdo se na obrazovku
  nepodívá, o zápis přijde. Stránka Finance takhle zakládala opakované transakce;
  dnes to dělá denní cron a tlačítko „Doplnit opakované". Hlídá
  `lib/__tests__/admin-render-nezapisuje.test.ts`.
- **Výpisy, které rostou s časem, potřebují okno nebo `LIMIT`.** Kalendář posílal do
  prohlížeče celou historii (AD08), výpisy před AD07 celé tabulky. Nový dotaz nad
  `calendar_events`, `consultation_slots` nebo `client_leads` se ptá na rozsah, ne na vše.

### Výpisy: sdílená tabulka a stav v adrese (AD07)

- **`lib/admin-table.ts`** je jediné místo, kde se čte řazení a stránkování z adresy.
  `parseTableParams(searchParams, { allowed, defaultSort, pageSize, prefix?, tiebreak? })`
  vrátí ověřené `{ sortKey, dir, page, limit, offset, orderBy }`. **`ORDER BY` se nedá
  parametrizovat, proto se klíč z adresy jen *vybírá* ze seznamu `allowed`** (`klíč → SQL
  výraz`); co v seznamu není, spadne na výchozí řazení. Prázdné hodnoty jsou vždy na konci
  (`NULLS LAST`), `tiebreak` drží pořadí mezi stránkami. `tableLinks(path, searchParams)`
  dává odkazy na řazení a stránku, `tableHref` mění jeden parametr a ostatní nechá být.
- **`components/admin/data-table.tsx`** je **serverová** komponenta: řazení i stránkování
  jsou `<Link>`, takže se nic nehydratuje, funguje tlačítko Zpět a seřazený seznam jde poslat
  odkazem. Sloupec je `AdminColumn<T> = { key, header, sortable?, align?, cell, mobile? }`;
  role `mobile` říká, co se pod 640 px stane titulkem karty, štítkem nebo údajem. Interaktivní
  části (úpravy, zatržítka) si volající vkládá jako hotové uzly přes `cell` a `selection`.
- **`components/admin/pagination.tsx`** používá tabulka i seznamy karet (Poptávky, Požadavky),
  **`components/admin/table-search.tsx`** je `method="get"` formulář — hledání bez JavaScriptu.
- **Dotazy obrazovek** jsou v `lib/admin/{completed,invoices,costs,leads,projects,waitlist}.ts`
  a `lib/ws/admin/clients.ts`: filtry, řazení, stránkování i součty dělá databáze, vždy jednou
  dávkou. Součty a počty u filtrů se počítají přes celý filtr, ne přes zobrazenou stránku.
- **Žádný výpis nesmí být bez `LIMIT`.** Kde se stránkovat nedá (přehled výkonnosti, archiv
  faktur, export waitlistu), má dotaz pevný strop a v kódu důvod.
- **Funkci nelze poslat do klientské komponenty.** `LeadsTable` proto dostává hotové odkazy
  na řazení (`sortLinks`), ne `sortHref`. Projeví se to tak, že stránka vrátí 200, ale tabulka
  se nevykreslí na serveru.

**Tabulky `projects`, `client_messages` a `progress_updates` žádná migrace nezakládá** — vznikly ručně v Neon konzoli před migrací 001. Na čistou databázi je dostane `node scripts/apply-migration.js scripts/admin-base-schema.sql`, pak teprve jdou migrace 001+ (AD00).

**Smazané moduly (AD01, R-089):** Škola, Sport a zdraví, Plány a Šablony webu odešly z kódu i z databáze — 24 tabulek maže migrace 100, `project_blocks` a `block_templates` migrace 101. Obsah se před spuštěním vyveze `node scripts/export-before-drop.mjs --ano`.

**Evidence aplikovaných migrací:** `public.schema_migrations` (soubor, čas, hash, počet příkazů) — vede ji `scripts/apply-migration.js`, který už aplikovanou migraci přeskočí a změněný soubor pustí znovu.

### `projects`

```sql
CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  description text,
  focus text,
  status text DEFAULT 'new',
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  price numeric,
  paid boolean DEFAULT false,
  public_token uuid DEFAULT gen_random_uuid(),
  deadline date,
  notes text,
  client_email text,
  project_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
```

| Pole | Typ | Default | Popis |
|------|-----|---------|-------|
| id | uuid | gen_random_uuid() | Primární klíč |
| client_name | text | — | Jméno klienta |
| description | text | — | Popis zakázky |
| focus | text | — | Na co se zakázka zaměřuje |
| status | text | `'new'` | new / in_progress / review / done / paid |
| progress | integer | 0 | Procento hotovosti 0–100 (CHECK constraint) |
| price | numeric | — | Cena zakázky v Kč/EUR |
| paid | boolean | false | Zaplaceno / nezaplaceno |
| public_token | uuid | gen_random_uuid() | Token pro klientský portál — **nikdy negenerovat na frontendu** |
| deadline | date | — | Termín dokončení |
| notes | text | — | Interní poznámky — klient **NEVIDÍ** |
| client_email | text | — | Email klienta — pro automatické notifikace o změně stavu |
| project_url | text | — | Link na živou verzi projektu (např. Vercel deploy) — zobrazí se klientovi i v emailu |
| created_at | timestamptz | now() | Datum vytvoření |
| updated_at | timestamptz | — | Datum poslední úpravy (nastavuje server action) |
| lead_origin | text | `'vizeon'` | Odkud poptávka přišla — `vizeon` / `alteno` / `prvotka` / `jiny`, CHECK (migrace 050 jako `business`, přejmenováno 102) |
| lead_confirmed | boolean | false | Potvrzená poptávka z webu — jeden příznak místo dvojice (migrace 102) |
| lead_confirmed_at | timestamptz | — | Kdy se potvrdila; zapisuje trigger, u historie před 102 je NULL |
| lead_pending | boolean | **generovaný** | `source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed` — jediné pravidlo pro inbox. **Do INSERTu nikdy nepatří** (migrace 102) |
| vizeon_confirmed | boolean | false | Starý příznak; drží ho v souladu trigger, čte se už jen při revertu (zahodí samostatná migrace) |
| alteno_confirmed | boolean | false | Starý příznak, dtto (migrace 050) |

### `client_messages`

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| content | text | Text vzkazu — klient vidí |
| created_at | timestamptz | Datum přidání |

### `progress_updates`

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| progress_from | integer | Progress před změnou |
| progress_to | integer | Progress po změně |
| description | text | Popis co se udělalo |
| created_at | timestamptz | Datum záznamu |

### `client_feedback` (migrace 001)

NPS hodnocení + komentář, odesílá klient z portálu přes `submitFeedback`.

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| nps | integer | 1–10 (CHECK constraint) |
| content | text | Volitelný komentář |
| created_at | timestamptz | Datum hodnocení |

### `consultation_slots` (migrace 001, 002, 003, 004)

Rezervace konzultací, odesílá klient z portálu přes `submitConsultation`. `scheduled_at` je **globálně unikátní** (migrace 002 — jeden admin nemůže mít dvě konzultace ve stejný čas napříč projekty). `channel` nemá CHECK constraint (migrace 003/004 ho odstranily, aby šla uložit hodnota `'other'` s volným textem).

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| scheduled_at | timestamptz | Termín — globálně UNIQUE |
| channel | text | whatsapp / teams / meet / phone / other (bez DB constraintu) |
| client_wish | text | Přání/poznámka klienta k termínu |
| meeting_link | text | Vygenerovaný link na schůzku (WhatsApp/Meet/Teams/tel:) |
| client_email | text | Email klienta — pro potvrzovací email |
| created_at | timestamptz | Datum vytvoření rezervace |

### `calendar_events` (migrace 002)

Ruční admin události/blokace v globálním kalendáři (`/dashboard/calendar`), nezávislé na projektech.

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| title | text | Název události |
| description | text | Volitelný popis |
| starts_at | timestamptz | Začátek |
| ends_at | timestamptz | Konec |
| event_type | text | `manual` / `block` |
| created_at | timestamptz | Datum vytvoření |
| lead_origin | text | `vizeon` / `alteno` / `prvotka` / `jiny`, default `'vizeon'` (migrace 050 jako `business`, přejmenováno 102) — kalendář od AD02 nefiltruje, je to jen štítek |
| lead_id | uuid | FK → client_leads.id, ON DELETE SET NULL (migrace 051) — párový kontakt v Hovorech, viz níže |

**Propojení s Hovory (migrace 051):** vytvoření kalendářní události automaticky založí odpovídající řádek v `client_leads` (company_name = název události, next_action = popis, next_action_date/time odvozeno z `starts_at` v Europe/Prague) a propojí obě strany přes `calendar_events.lead_id` / `client_leads.calendar_event_id`. Smazání jedné strany smaže i druhou (`deleteCalendarEvent` / `deleteLead` v `app/calendar-actions.ts` a `app/calls-actions.ts`). Kalendářová stránka proto z `client_leads` do zobrazení bere jen řádky s `calendar_event_id IS NULL` — jinak by se termín zdvojil (jednou jako reálná `calendar_events` událost, podruhé jako virtuální položka z `next_action`).

### Katalog ostatních tabulek

Detail sloupců hledej v příslušné migraci a v `lib/types.ts` — tady je jen mapa, co kde žije.

| Tabulka | Migrace | K čemu |
|---------|---------|--------|
| `login_attempts` | 006 | Brute-force lockout přihlášení |
| `api_requests` | 007 | Rate limit veřejných API (`lib/api-rate-limit.ts`) |
| `client_leads` | 010, 017, 024, 049, 051 | **Hovory** — kontakty/leady, další akce, telefonát zvednut, portfolio odesláno, vazba na kalendář |
| `lead_notes` | 058 | Poznámky s historií k leadu v Hovorech |
| `agent_leads` | 052 | AI-scorované leady z externího `vizeon-lead-agent` |
| `completed_projects` | 011, 029, 047, 057 | **Dokončené** zakázky (záloha, vazba na zdrojový projekt, odhad) |
| `costs` | 011, 012, 013, 060 | Náklady — firemní (`/dashboard/naklady`) i osobní fixní (`/dashboard/finance`), volitelná vazba na projekt |
| `project_surveys` | 016, 046 | Dotazník spokojenosti (`/h/[token]`, `completed_projects.survey_token`) — max 1 na zakázku |
| `notifications` | 018 | In-app notifikace (`/dashboard/notifications`) |
| `client_requests` | 092 | Požadavky klientů z portálu `/p/[token]` (text nebo přepis hlasu, shrnutí a zadání od AI, stav nové/hotovo/zahozeno); audio se neukládá |
| `invoices` | 053, 056 | Archiv faktur (PDF, AI přepis, vazba na transakci) |
| `tax_news` | 055 | Novinky z legislativy (RSS FS + ČSSZ, cron) |
| `project_notes` | 059, 063 | Log schůzek/hovorů u zakázky (autor + snapshot progressu) |
| `finance_transactions` | 019, 026, 027, 054 | Finance a daně — transakce; `declared` = přiznaná linie (fakturováno na IČO) |
| `finance_goals`, `recurring_cash_flow` | 019, 031 | Finanční cíle, opakované cash-flow položky |
| `startup_projects` (+ `_improvements`, `_changelog`) | 032, 034, 035 | Startup (waitlist DB URL, cenové tiery) |
| `personal_projects` (+ `_improvements`, `_changelog`) | 033 | Projekty |
| `plans_legacy_archived` | 042 | Stará plochá tabulka plánů — jen archiv, nepoužívat |
| `project_activity` | 093 | Aktivita zakázky (KP03): koncepty a schválené zprávy, `status` draft/published/rejected, `source` manual/claude_code/system, `contains_sensitive`, `client_emailed_at` (souhrnný e-mail max. 1× za den) |
| `project_agent_keys` | 094 | Klíče projektů pro hlášení z Claude Code (KP04): prefix + HMAC hash, jeden platný klíč na projekt, kdo a kdy vytvořil/zneplatnil |
| schéma `portal` (`clients`, `members`, `invites`, `projects`, `activity`, `requests`, `messages`, `feedback`) | 095, 096, 098 | Klientský prostor (KP05–KP07), retence 3 roky (098): projekce schváleného, RLS podle `app.client_id`, role `portal_app` bez práv do `public`. Podrobně `docs/klientsky-prostor/PLAN.md` a `.claude/security/DECISIONS.md` #020 |

**DB funkce/triggery:** `check_calendar_overlap`, `check_consultation_overlap` (overlap guard napříč tabulkami, migrace 008/043/044), `projects_lead_confirmed_sync()` + trigger `trg_projects_lead_confirmed` (čas potvrzení a staré příznaky, migrace 102). Funkce `is_vizeon_pending()` a `is_alteno_pending()` (migrace 048/050) v DB zůstaly, ale kód je už nepoužívá — nahradil je generovaný sloupec `lead_pending`.

---

## Struktura aplikace

```
app/
├── (auth)/
│   └── login/page.tsx           ← Přihlášení (NextAuth credentials)
├── api/auth/[...nextauth]/
│   └── route.ts                 ← NextAuth handler
├── actions.ts                   ← Server Actions: createProject, updateProject, deleteProject, client messages
├── portal-actions.ts            ← Public Server Actions: submitFeedback, submitConsultation (token-only auth, rate-limited)
├── calendar-actions.ts          ← Server Actions: createCalendarEvent, deleteCalendarEvent
├── dashboard/
│   ├── layout.tsx               ← Ochrana routy (getServerSession) + kostra; počty posílá jako příslib (AD06)
│   ├── loading.tsx              ← Kostlivec Dnes (další u calls, calendar, faktury, zakazky, klienti…)
│   ├── page.tsx                 ← Přehled zakázek
│   ├── new/page.tsx             ← Nová zakázka
│   ├── calendar/page.tsx        ← Globální kalendář (všechny projekty)
│   ├── faktury/page.tsx         ← Evidence všech vystavených faktur (napříč byznysy)
│   ├── faktury/[id]/page.tsx    ← Detail faktury — kompletní přepsané údaje + PDF + vazba na ledger
│   └── [id]/page.tsx           ← Detail + editace zakázky + FeedbackFeed + ConsultationCalendar
├── p/
│   └── [token]/page.tsx        ← Klientský portál (public, bez auth) — FeedbackBlock + BookingCTA
├── layout.tsx
└── globals.css

components/
├── ProjectCard.tsx              ← Karta zakázky v seznamu (štítek zdroje podle `lead_origin`)
├── ProjectForm.tsx              ← Formulář (volá server actions)
├── LeadCard.tsx                 ← Admin: karta poptávky z webu + potvrzení/smazání (dřív BookingCard.tsx)
├── StatusBadge.tsx              ← Barevný badge stavu
├── ProgressBar.tsx              ← Vizuální progress bar
├── ShareButton.tsx              ← Kopírování klientského linku
├── QRCodeDisplay.tsx            ← QR kód klientského linku
├── NpsRating.tsx                ← Klientský 1–10 rating widget
├── FeedbackBlock.tsx            ← Klientský formulář NPS + komentář
├── FeedbackFeed.tsx             ← Admin: list NPS hodnocení per projekt
├── BookingCTA.tsx               ← Klientské CTA, otevírá BookingModal
├── BookingModal.tsx             ← Klientská rezervace: kalendář + sloty + kanál + email
├── ConsultationCalendar.tsx     ← Admin: kalendář konzultací per projekt
├── SmartCalendar.tsx            ← Admin: globální kalendář (Month/Week/Day)
├── InvoiceRegistry.tsx          ← Admin: evidence faktur (filtry, souhrny po měnách, drag-and-drop PDF)
├── InvoiceDetailActions.tsx     ← Admin: úprava a smazání faktury z jejího detailu
└── AdminEventModal.tsx          ← Admin: vytvoření manuální události/blokace

lib/
├── db.ts                        ← Neon klient: sql tagged template
├── lead-origins.ts              ← Zdroje poptávek: název, doména, `source`, klíče API, okno rate limitu (dřív business.ts)
├── legacy-redirects.mjs         ← Staré adresy adminu → nové (čte next.config.mjs i test)
├── web-leads.ts                 ← Příjem poptávek z webů: booking i kontaktní formulář, jeden inbox (dřív web-booking.ts)
├── web-booking.ts               ← Sdílená implementace veřejného booking endpointu (obě domény)
├── auth.ts                      ← NextAuth authOptions
├── email.ts                     ← Sdílený nodemailer transporter + branded HTML layout (sendBrandedEmail)
├── feedback-schema.ts           ← Zod schémata: feedbackSchema, bookingSchema
├── prague-time.ts               ← Timezone helpery (Europe/Prague), generování slotů, kalendářní utility
├── utils.ts
└── types.ts

proxy.ts                         ← jediný proxy (dřív middleware.ts): NextAuth pro /dashboard (`/alteno` a `/hub` zůstaly jako pojistka před přesměrováním), Clerk jen pro /w a /api/ws, CSP s nonce (B13)
migrations/                      ← Inkrementální SQL migrace nad základním schématem
scripts/                         ← Běhouny migrací (apply-migration.js = obecný) + debug skripty
docs/                            ← Implementační plány velkých celků (viz memory/index.md)
memory/                          ← Paměť projektu: index, pravidla, živý stav + changelog
```

Strom výše ukazuje jádro. **Úplný seznam** souborů server actions, rout a API je níže.

### Server actions (soubory)

| Soubor | Oblast |
|--------|--------|
| `app/actions.ts` | Zakázky: CRUD, vzkazy, `confirmWebLead`/`deleteWebLead` (poptávka z kteréhokoli webu), `markProjectAsCompleted`, `notifyClientOfProjectChange` |
| `app/portal-actions.ts` | Veřejné (token): `submitFeedback`, `submitConsultation`, `submitSurvey`, `submitClientRequest` (AI shrnutí běží v `after()`) |
| `app/client-requests-actions.ts` | Admin: změna stavu požadavku klienta (`/dashboard/pozadavky`) |
| `app/calendar-actions.ts` | Kalendářní události (+ párový lead v Hovorech) |
| `app/calls-actions.ts` | Hovory: leady, poznámky, waiting stav, převod na zakázku, portfolio email, vlastní email |
| `app/completed-actions.ts` | Dokončené zakázky + dotazníky |
| `app/costs-actions.ts` | Náklady — jediný zdroj pravdy pro firemní i osobní náklady |
| `app/notification-actions.ts` | Notifikace (přečteno) |
| `app/project-notes-actions.ts` | Log schůzek u zakázky |
| `app/dashboard/finance/finance-actions.ts` | Transakce, měsíční agregace, opakované cash-flow, příjmy z byznysu |
| `app/dashboard/finance/invoice-actions.ts` | **Veškerá logika faktur** (sdílené jádro v `lib/invoices.ts`) |
| `app/dashboard/finance/tax-news-actions.ts` | Novinky z legislativy |
| `app/dashboard/finance/byznys-actions.ts` | Výkonnost podnikání (příjmy, výdaje, zisk, marže) pro kalkulačku ve Financích |
| `app/dashboard/startup/startup-actions.ts` | Startup projekty (+ waitlist, launch email přes Resend) |
| `app/dashboard/projekty/projekty-actions.ts` | Osobní projekty |

### Mapa rout (admin)

| Sekce | Routy |
|-------|-------|
| Admin (`/dashboard`) | `/dashboard`, `/new`, `/[id]`, `/zakazky`, `/pozadavky` (požadavky klientů z portálu), `/poptavky` (jeden inbox poptávek ze všech webů), `/calendar`, `/calls` (Hovory), `/dokoncene`, `/hodnoceni`, `/naklady`, `/faktury`, `/faktury/[id]`, `/notifications`, `/profil`, `/klienti` + `/klienti/[id]` a `/novinky` (ZakazIQ Workspace, S17 — popis v `docs/AGENTS-REFERENCE.md` → „Admin nad Workspace“) |
| Osobní část (dřív Hub) | `/dashboard/finance`, `/dashboard/projekty` (+ `/new`, `/[id]`), `/dashboard/startup` (+ `/new`, `/[id]`) |
| Zrušené adresy | `/alteno`, `/alteno/new`, `/alteno/[id]`, `/alteno/rezervace`, `/dashboard/vizeon` (AD02) a všechny `/hub/*` včetně rozcestníku `/hub/byznys` (AD03) — trvale přesměrované (`lib/legacy-redirects.mjs`) |

### Veřejné stránky

| Routa | Co |
|-------|----|
| `/p/[token]` | Klientský portál zakázky (`projects.public_token`) |
| `/h/[token]` | Dotazník spokojenosti po dokončení (`completed_projects.survey_token`) |
| `/login` | Přihlášení |

### API routy

| Endpoint | Auth | Účel |
|----------|------|------|
| `POST /api/public/booking` | `x-api-key` = `VIZEON_API_KEY` | Rezervace z vizeon.cz (`lib/web-booking.ts`) |
| `POST /api/public/booking/alteno` | `x-api-key` = `ALTENO_API_KEY` | Rezervace z alteno.cz |
| `POST /api/public/alteno-leads` | `x-alteno-lead-signature` = `ALTENO_LEAD_WEBHOOK_SECRET` | Kontaktní formulář alteno.cz → nepotvrzená poptávka |
| `POST /api/public/prvotka-leads` | `x-prvotka-lead-signature` = `PRVOTKA_LEAD_WEBHOOK_SECRET` | Kontaktní formulář prvotka.cz → nepotvrzená poptávka (AD02; web ještě napojený není) |
| `POST /api/public/leads` | `N8N_API_KEY` | Leady z n8n chatbota → Hovory |
| `POST /api/public/agent-leads` | Bearer `VIZEON_AGENT_API_KEY` | AI-scorované leady z `vizeon-lead-agent` |
| `POST /api/public/invoices` | Bearer `INVOICES_API_KEY` | Zakládání faktur zvenčí (n8n) |
| `POST /api/invoices/parse` | session | AI přepis PDF faktury (nic neukládá) |
| `POST /api/public/portal/[token]/transcribe` | token projektu + limit IP/projekt | Přepis hlasu klienta (OpenAI), nic neukládá, vrací jen text (`lib/transcribe.ts`) |
| `GET /api/invoices/[id]/pdf` | session (kontrola v route — proxy `/api` nehlídá) | PDF faktury. `ETag` z `md5(pdf_data)`, při shodě 304 **bez čtení bajtů** (AD08). `Cache-Control: private, max-age=0, must-revalidate` — `private` nikdy neruš (DECISIONS #022). `X-Frame-Options: SAMEORIGIN` z `next.config.mjs` neměň (DECISIONS #004). |
| `POST /api/ai-assistant` | session | AI asistenti (Anthropic) |
| `/api/cron/*` | Bearer `CRON_SECRET` (`verifyCronSecret`) | Viz crony níže |
| `POST /api/agent/v1/projects/{id}/reports` | `Authorization: Bearer zk_agent_…` | Hlášení z Claude Code jako koncept (KP04). Klíč umí jen zápis konceptu do svého projektu; limity 20/hod na klíč, 60/hod na IP; `AGENT_KEY_PEPPER` |
| `POST /api/klient/transcribe` | přihlášený člen klientského prostoru (Clerk) | Přepis hlasu pro požadavek klienta; limit po IP a členovi |

Veřejná API: vždy `lib/api-auth.ts` (constant-time porovnání klíče, fail-closed) + `lib/api-rate-limit.ts` + Zod validace. Klíč se nikdy neloguje.

### Crony (`vercel.json`, Vercel Hobby = max 1× denně per job)

| Endpoint | Kdy (UTC) | Co |
|----------|-----------|----|
| `/api/cron/send-reminders` | denně 7:00 | Připomínky konzultací a lead akcí (idempotentní příznaky proti duplicitám). **Od AD08 tu vznikají i opakované transakce** — fixní náklady i cash-flow šablony (`lib/recurring-transactions.ts`). Dřív je zakládal render stránky Finance. |
| `/api/cron/tax-news` | pondělí 5:00 | Stažení legislativních novinek (`ON CONFLICT DO NOTHING`) |
| `/api/cron/client-retention` | denně 3:30 | Retence D-K10 (R-076, migrace 098): `public.purge_client_retention(3)` — dokončená zakázka (`done`/`paid`) bez pohybu 3 roky přijde o aktivitu, požadavky (`client_requests`, `portal.requests`), zprávy a slovní hodnocení; zakázka, cena a číselné hodnocení zůstávají. Pozvánky 90 dní po použití/zrušení/vypršení. `lib/client-retention.ts` |

---

## Stránky — co každá dělá

### `/login`
- Email + heslo přes NextAuth Credentials
- Po přihlášení redirect na `/dashboard`
- Čistý minimalistický design

### Kostra administrace (KP01, R-071)
- `/dashboard/*` používá `components/admin/admin-shell.tsx`: postranní menu na počítači, horní lišta a spodní lišta s nabídkou „Více“ na telefonu, hledání ⌘K (stránky, zakázky, hovory, faktury; `app/admin-search-actions.ts`). Od AD03 je menu jedno pro celý admin (skupiny Přehled · Práce · Peníze · Klienti · Osobní v `lib/admin-nav.ts`); Hub zanikl.
- Menu a odznaky: `lib/admin-nav.ts` (skupiny Přehled · Práce · Peníze · Klienti · Osobní) a `lib/admin-counts.ts` (počty jedním požadavkem). **Kostra na čísla nečeká (AD06):** layout předává `AdminShell` **příslib**, ne hodnotu, a odznaky se dokreslují v `<Suspense>`; dokud databáze neodpoví, kreslí se menu s nulami (ne kostlivec — položky menu jsou známé a blikat nemají). Nová stránka adminu = položka v `ADMIN_NAV`; test `lib/__tests__/admin-nav.test.ts` hlídá, že žádná dřívější cesta nezmizela.
- Vzhled: Dílky jsou od AD04 (R-081) design systém celého repa. Paleta je na `:root` (`app/tokens-dilky.css`), takže platí i tam, kde není `data-app` — `/login`, `/p/[token]`, `/h/[token]`. `app/admin-tokens.css` přidává uvnitř `[data-app="admin"]` proměnné shadcn a `--radius: 12px`; admin **nemá tmavý režim**. Písma nese `<html>` v `app/layout.tsx`, Inter se nenačítá.
- Kořen `components/admin/admin-root.tsx` (`AdminShell` ho obaluje) drží `data-app="admin"` a `PortalContainerProvider` — bez něj by Radix portáloval dialogy, menu a tooltipy do `<body>` mimo přepisy. Je to admin obdoba `components/ws/ws-root.tsx`.
- Toasty: admin používá `@/components/ui/toast` (ne `sonner` přímo). Modul si nese vlastní kořen s `data-app`, který nastavuje `AdminRoot` / `WsRoot`. Místo potvrzovacích dialogů se nabízí `undo` („Zpět"). `toast.warning` a `toast.info` existují kvůli převzatým voláním adminu.
- **`cn()` se záměrně nesjednocuje.** `@/lib/utils` (admin) a `@/lib/ws/utils` (Workspace) jsou dvě identické implementace; přejmenovat import ve 153 souborech nic nepřinese a jen by zvětšilo diff každého dalšího sezení.
- **Šířka a hlavička patří stránce (AD05).** `<main>` v `AdminShell` nemá šířku ani okraje, jen místo pro spodní lištu telefonu. Každá obrazovka `/dashboard` se obaluje `<PageShell>` z `components/ws/app/page-header.tsx` a volí si šířku: `narrow` 960 · `default` 1280 · `wide` 1440 · `table` 1600 (jedenáctisloupcové tabulky Dokončených a Hovorů). Nadpis dělá `<PageHeader>` (admin posílá `subtitleFont="sans"`, protože podnadpis je věta, ne čísla), řádek filtrů `<Toolbar>` / `<PillNav>`, prázdný stav `<EmptyState>`. Jsou to komponenty Workspace, ale závisí jen na `AccentHeading` a `cn` — žádná data `ws`. **Nová obrazovka adminu začíná `<PageShell>`, ne vlastním `max-w-*`.**
- **Kostlivci obrazovek (AD06).** `components/admin/page-skeleton.tsx` (`TodaySkeleton`, `TableSkeleton`, `CalendarSkeleton`) a `loading.tsx` u `/dashboard` a devíti podstránek. Kostlivec má **stejnou šířku a rozvržení** jako hotová obrazovka, aby se po načtení nic nepřeskládalo, a nekreslí žádné číslo ani text, co by se dal splést se skutečným údajem. `loading.tsx` u `/dashboard` platí i pro podstránky, které si vlastní nezaložily.
- **`experimental.staleTimes: { dynamic: 30, static: 180 }`** (`next.config.mjs`, AD06): Zpět a Vpřed po dobu 30 s nesahají do databáze. Data po vlastní akci se obnovují cíleně přes `revalidatePath`, takže se stará data ukážou jen při prostém listování tam a zpět.
- **Kořenový layout nemá `SessionProvider` (AD06).** `useSession()` v repu nikdo nepoužívá; admin si session čte na serveru (`getServerSession`) a hlavička landing page dostává `signedIn` jako prop z `Hero` / `LegalPage`. Dřív provider obaloval celou aplikaci, takže NextAuth načítal i Workspace a landing a každý návštěvník po načtení volal `/api/auth/session`. `signIn()` a `signOut()` z `next-auth/react` provider nepotřebují.
- **Odznaky mají jeden systém (AD05, R-091).** `lib/admin-status.ts` má pět tónů `neutral | info | signal | success | danger` a mapy pro stav zakázky, hovoru, typ akce, druh změny, vylepšení, fázi projektu, předplatné klienta a stav faktury. Vykresluje se přes `components/ui/badge.tsx` (`toneVariant(tón)`). **Obrazovka si vlastní barvu odznaku nedefinuje**; nový stav = nový řádek v `lib/admin-status.ts`. Kategorie (typ akce, druh změny, oblast, kategorie nákladu) jsou vždy `neutral`.

### `/dashboard` — Dnes (KP02, AD03)
- Jedna hlavní věc nahoře (`lib/admin-today.ts` → `pickFocus`): požadavek klienta → hlášení ke schválení → faktura po splatnosti → schůzka do 24 h → zakázka bez pohybu 14 dní. Pod ní sekce se stejnými věcmi. Data `lib/admin-today-queries.ts` (každá sekce se načítá zvlášť, chybějící tabulka = prázdná sekce).
- Vpravo (na telefonu pod tím) „Jak se daří tenhle měsíc“ (`loadMonthMoney`): příjem měsíce a z toho přiznaný, nezaplacené faktury **po měnách** (měny se nesčítají, R-011), odhad daně a odvodů za rok a měsíční rezerva. Podmínky jsou stejné jako v `getBusinessIncome` a `getInvoices`, daň počítá `calculateTax` z `lib/tax.ts` — nic se nepočítá podruhé jinak. Dva dotazy, jedna vlna; strop hlídá `lib/__tests__/admin-db-rounds.test.ts`.

### `/dashboard/zakazky`
- Seznam všech zakázek s filtrem zdroje poptávky (`?zdroj=`), filtrem stavu (`?status=`), summary barem a počtem nevyřízených požadavků na kartě. Čekající poptávky tu nejsou (`NOT lead_pending`), ty jsou v `/dashboard/poptavky`.

### `/dashboard/poptavky` — jeden inbox poptávek (AD02)
- Poptávky ze všech webů čekající na potvrzení (`WHERE lead_pending`, `lib/web-leads.ts` → `loadPendingLeads`). Filtr podle zdroje je v adrese (`?zdroj=vizeon|alteno|prvotka`), na kartě je štítek s doménou.
- „Potvrdit jako zakázku“ = `confirmWebLead`: jeden atomický `UPDATE … WHERE id = … AND lead_pending`, takže dvojklik nepošle potvrzovací e-mail dvakrát. „Smazat“ = `deleteWebLead`, smaže jen dosud nepotvrzenou.

### `/dashboard/new`
- Formulář: client_name, description, focus, project_url, status, progress, price, paid, deadline, notes, client_email
- Po uložení redirect na `/dashboard`

### `/dashboard/[id]` — detail zakázky (KP02)
- Jedna komponenta `components/admin/project-detail-view.tsx`, záložky v adrese `?zalozka=`: **Přehled** (editace, sdílení a QR, přidat do dokončených, smazat) · **Aktivita** (koncepty a schvalování, napojení Claude Code) · **Požadavky** (karty z `/dashboard/pozadavky` filtrované na zakázku) · **Zprávy** (vlákno v klientském prostoru, vzkazy, historie postupu, zpětná vazba, konzultace, poznámky) · **Fakturace** (faktury a náklady). Načítají se jen data aktivní záložky.
- Od AD02 má **každá** zakázka všechny záložky — i poptávky z alteno.cz mají Fakturaci, dokončení a poznámky ze schůzek. V záhlaví je štítek zdroje (`lead_origin`).
- Nepřevedeno z plánu: změna stavu a fáze jedním klikem se „Zpět“. `updateProject` posílá klientovi e-mail, takže „Zpět“ by ho poslal podruhé.

### `/dashboard/calendar`
- Globální kalendář (Měsíc / Týden / Den) — konzultace, deadliny, plánované hovory z Hovorů
  a ruční události i blokace. Po AD02 bez filtru zdroje.
- Ruční událost nebo blokaci zakládá `AdminEventModal`.
- **Čte jen okno, ne historii (AD08).** Stránka pošle měsíc kotvy ± 7 dní
  (`windowFor` v `lib/admin/calendar-window.ts`), dotazy jsou v `lib/admin/calendar.ts`
  jednou dávkou. Proklik mimo načtené okno dotáhne server action `loadCalendarMonth`
  (`app/calendar-actions.ts`) a `replaceRange` v `SmartCalendar` vymění, co do okna padá.
  Nový dotaz kalendáře **musí** mít podmínku okna — hlídá to
  `components/admin/__tests__/admin-bundle-guard.test.ts`.
- Dotazy nad `timestamptz` porovnávají **okamžiky** (`starts_at >= $1 AND starts_at < $2`),
  ne `AT TIME ZONE 'Europe/Prague'::date` — jinak se zahodí index z migrace 103.
- **Vykreslování počítá v pražské zóně nad `'YYYY-MM-DD'`** (`pragueDayOf`,
  `pragueMinutesOf`, `isoWeekday`, `addIsoMonths`), ne nad `Date` v zóně prohlížeče.
  `UnifiedEvent` nese `day`, `startMin` a `endMin`; pozice bloku je `blockGeometry`.
  `getHours()` v kalendáři nepoužívej — zahazuje minuty i zónu (AD08 to byla jedna
  ze tří nahlášených chyb).
- `AdminEventModal` se **mountuje až při otevření**; `<AnimatePresence>` je nad ním
  v `SmartCalendar`. Dokud byl uvnitř modalu, komponenta se neodmountovala a formulář
  navždy držel „dnes 10:00".

### `/dashboard/faktury`
- **Evidence všech vystavených faktur** — archiv dokladů, řazený podle data vystavení a seskupený po rocích
- Filtry: hledání (číslo / klient / zakázka / IČO / poznámka), rok, stav (Všechny | Zaplacené | Nezaplacené | Po splatnosti)
- Souhrn nad filtrovaným výběrem: počet, vyfakturováno, zaplaceno, nezaplaceno — **sčítá se po měnách**, CZK a EUR se nikdy neslučují do jednoho čísla
- Nová faktura přes tlačítko nebo přetažením PDF na stránku (AI přepis přes `InvoiceUploadModal`)
- **Záměrně napříč byznysy** — VIZEON i ALTENO fakturuje jedno IČO pod jedním přiznáním, rozdělený archiv by znamenal hledat doklad na špatném místě
- Komponenta `InvoiceRegistry.tsx`; data z `getAllInvoices()` v `app/dashboard/finance/invoice-actions.ts` (veškerá logika faktur žije tam, tahle sekce je jen další pohled)

### `/dashboard/faktury/[id]`
- Kompletní přepis jedné faktury: číslo, částka/měna, vystaveno/splatnost/zaplaceno, odběratel + IČO + DIČ, poznámka
- Náhled přiloženého PDF (`<object>` + odkaz na `/api/invoices/[id]/pdf`), vazba na zakázku, úprava a smazání
- **Přiznaná linie** — jestli faktura v ledgeru příjem založila, nebo jen převzala ten od zakázky (`owned_by_invoice`); bez `paid_on` žádný nemá
- **Co z PDF přečetla AI** — surový `ai_extracted` pro dohledatelnost; pole, kde se uložená hodnota od přepisu liší, jsou označená jako ručně upravená. Platí vždy uložené údaje, ne přepis
- Data z `getInvoiceDetail()`; akce v `InvoiceDetailActions.tsx`

### Zdroje poptávek (AD02, R-088)

VIZEON a ALTENO už nejsou dvě firmy. Je to **jeden byznys**, který přijímá poptávky z několika webů, a u zakázky, termínu i leadu se eviduje jen `lead_origin` — odkud poptávka přišla.

| Zdroj | Doména | `projects.source` | Endpointy |
|---|---|---|---|
| `vizeon` | vizeon.cz | `vizeon_web` | `POST /api/public/booking` (`VIZEON_API_KEY`) |
| `alteno` | alteno.cz | `alteno_web` | `POST /api/public/booking/alteno` (`ALTENO_API_KEY`), `POST /api/public/alteno-leads` (`ALTENO_LEAD_WEBHOOK_SECRET`) |
| `prvotka` | prvotka.cz | `prvotka_web` | `POST /api/public/prvotka-leads` (`PRVOTKA_LEAD_WEBHOOK_SECRET`) — web napojený ještě není |
| `jiny` | — | — | jen štítek pro data bez webu |

Všechno, co se u zdroje liší, je v `lib/lead-origins.ts`. **Přidání dalšího webu (estetik.cz) je jeden řádek v `LEAD_ORIGINS`** plus případně soubor routy s jedním řádkem; žádná nová logika. Každý zdroj má vlastní klíč a vlastní okno rate limitu (`<zdroj>_booking`, `<zdroj>_lead`), aby si weby limit nebraly navzájem a uniklý klíč nepustil poptávky za ostatní weby.

**Payload, adresy a klíče volané cizími repozitáři se nemění** — formuláře na vizeon.cz i alteno.cz žijí v jiných repech. `types/booking.ts` a `types/web-lead.ts` jsou proto parametrizované funkcí podle zdroje, ne nová schémata.

**Čekající poptávka** je `lead_pending` (generovaný sloupec, migrace 102): `source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed`. Každý dotaz píše jen `WHERE lead_pending` nebo `WHERE NOT lead_pending`. Ruční zakázka má `source = 'manual'`, takže v inboxu nikdy není.

**Co se tím sloučilo:** jeden inbox místo dvou (`/dashboard/poptavky`), jeden seznam zakázek, jedna navigace, jedna odesílací schránka. Staré ALTENO zakázky tím **získaly** fakturaci, dokončení a poznámky ze schůzek. Kalendář a Hovory dřív ALTENO filtrovaly pryč — od AD02 jsou tam i historické záznamy.

**Sdílené odjakživa:** klientský portál `/p/[token]`, notifikace, profil, evidence faktur (jedno IČO, jedno přiznání), Finance a daně a DB overlap guard na termínech (jeden člověk = jeden diář).

### `/p/[token]` — Klientský portál (PUBLIC)
- **Bez přihlášení, bez registrace**
- Klient vidí: název projektu, jméno freelancera, popis, focus, vizuální progress bar, status badge, deadline, datum poslední aktualizace, link na živou verzi (pokud vyplněn `project_url`)
- **FeedbackBlock** — klient může nechat NPS hodnocení + komentář
- **ClientRequestBlock** — klient napíše nebo nadiktuje požadavek (mikrofon jen s `OPENAI_API_KEY`); AI z něj udělá shrnutí a zadání pro Claude Code, v adminu je to `/dashboard/pozadavky` (kopírování zadání, Hotovo/Zahodit), upozornění přijde zvonkem a e-mailem. Zadání nic nespouští, vkládá ho člověk
- **Aktivita** (KP03): schválené zprávy o práci (`project_activity`, `status = 'published'`) jsou v jedné časové ose s historií postupu. Koncepty, zdroj ani příznak citlivosti klient nevidí
- **BookingCTA** → **BookingModal** — klient si rezervuje konzultaci (kalendář, sloty po hodinách, kanál, svůj email)
- Klient **NEVIDÍ:** notes, cenu (výchozí skryto), ostatní zakázky
- Moderní branded design — buduje důvěru

---

## Stavy zakázky — barevné odlišení

| Status | Hodnota v DB | Barva | Kdy použít |
|--------|-------------|-------|------------|
| Nová | `new` | Modrá | Zakázka přijata, zatím nezačato |
| V řešení | `in_progress` | Žlutá / oranžová | Aktivně pracuji |
| Čeká na schválení | `review` | Fialová | Čekám na feedback klienta |
| Hotovo | `done` | Zelená | Práce dokončena, čeká se na platbu |
| Zaplaceno | `paid` | Tmavě zelená | Platba přijata, zakázka uzavřena |

---

## TypeScript typy

Zdroj pravdy je `lib/types.ts` — obsahuje `Project`, `ClientMessage`, `ProgressUpdate`, `ClientFeedback`, `ConsultationSlot`, `ConsultationChannel`, `CalendarEvent` a odpovídající `STATUS_LABELS` / `STATUS_STYLES` / `CHANNEL_LABELS` konstanty. Necituj typy do dokumentace (AGENTS.md, memory/) — drift mezi dokumentací a kódem je horší než žádná dokumentace; při změně typu se dívej přímo do souboru.

---

## Emaily

Veškerá email logika je centralizovaná v `lib/email.ts` (`sendBrandedEmail`/`sendPlainEmail`) — branded HTML layout (gradient header, card, CTA tlačítka). Nikdy nepiš novou HTML šablonu inline v server action — rozšiř `sendBrandedEmail`/`buildLayout`, pokud potřebuješ nový vizuální prvek.

**Jedna odesílací schránka (AD02):** všechna pošta odchází z `VIZEON_GMAIL_USER`/`VIZEON_GMAIL_APP_PASSWORD` (info@vizeon.cz) — včetně poptávek z alteno.cz a prvotka.cz. Chybí-li dvojice kompletní, `lib/email.ts` spadne zpět na výchozí `GMAIL_USER` (nikdy nezkouší auth s nesedícím heslem). `sendBrandedEmail`/`sendPlainEmail` už nemají parametr `business`.

- Cíl admin oznámení ber vždy z `adminEmail()` v `lib/lead-origins.ts` (`VIZEON_ADMIN_EMAIL`, záloha `ADMIN_EMAIL`) — nikdy nečti `process.env.ADMIN_EMAIL` přímo.
- Selhání odeslání emailu **nikdy** nesmí shodit DB mutaci — `sendBrandedEmail`/`sendPlainEmail` interně chytají chyby a vrací `false`, voláno bez `await` na výsledek pokud na něm nic nezávisí.
- **Oznámení posílej z `after()`, ne uprostřed akce (AD08).** Gmail SMTP trvá stovky
  milisekund až sekundy a uložení na něj nemá čekat: `import { after } from 'next/server'`
  a odeslání dovnitř. Platí to i pro `createNotification` — plovoucí `void promise` může
  skončit s odpovědí dřív, než se zápis dokončí. Výjimka jsou akce, **jejichž smyslem je
  ten e-mail** (`sendPortfolioEmail`, `sendCustomLeadEmail`): tam UI hlásí, jestli odešel,
  a po odpovědi už by se to uživatel nedozvěděl. Strop drží
  `lib/__tests__/admin-after-emails.test.ts`.
- Emaily se neodešlou, pokud chybí odpovídající dvojice `*_USER`/`*_APP_PASSWORD` — v dev prostředí appka funguje i bez nich, jen nechodí maily.
- Trigger body: `notifyClientOfProjectChange` v `app/actions.ts` (vytvoření/update projektu → klient), `submitConsultation` v `app/portal-actions.ts` (rezervace → admin i klient).

---

## Bezpečnost

- **NextAuth JWT session** — admin chráněn `proxy.ts` (matcher `/dashboard`, plus `/alteno` a `/hub` jako pojistka, vč. podcest) + `getServerSession` v layoutu. `/api/*` proxy **nehlídá** — každá neveřejná API routa si session kontroluje sama
- **Security hlavičky** v `next.config.mjs`, CSP s nonce v `proxy.ts` (admin zatím Report-Only) — stav a pravidla v B13 a `.claude/security/STATE.md`; server actions body limit 5 MB kvůli PDF faktur
- **Public token** — UUID v4 generovaný databází (`gen_random_uuid()`), nelze uhádnout
- **HTTPS** — Vercel automaticky
- **Heslo uloženo jako bcrypt hash** v env proměnné `ADMIN_PASSWORD_HASH`
- **Veřejné server actions** (`submitFeedback`, `submitConsultation`) jsou chráněné jen tokenem (bez auth) — mají DB-backed rate limit (`isRateLimited` v `app/portal-actions.ts`: max 3 hodnocení / 10 min, max 3 rezervace / 30 min per projekt), aby nešlo endpoint zaspamovat
- **Race condition na rezervacích** řešená přes DB `UNIQUE` constraint na `scheduled_at` + catch na Postgres chybový kód `23505` — nikdy přes "zkontroluj a pak vlož"

---

## UX pravidla (neporušovat)

1. **Mobilně responzivní** — freelancer aktualizuje zakázky v terénu na telefonu
2. **Žádné registrace na klientském portálu** — absolutně žádná friction
3. **Progress bar vždy vizuální** — nikdy jen číslo
4. **Status badge barevně odlišený** — na první pohled jasné
5. **Lucide React ikony** — `strokeWidth={1.5}` konzistentně napříč celou aplikací
6. **`notes` nikdy na klientském portálu**
7. **Sdílení linku jedním klikem** — kopírovat do schránky + toast potvrzení

---

## Poznámky pro AI

- Vždy **App Router** — složka `app/`, nikdy `pages/`
- DB dotazy přes `sql` tag z `lib/db.ts` — pouze v server components nebo server actions
- Mutace admin strany jsou v `app/actions.ts` a `app/calendar-actions.ts` jako Server Actions (`'use server'`), chráněné `requireAuth()`
- Mutace klientské strany (bez auth, jen token) jsou v `app/portal-actions.ts` — validuj vždy přes Zod (`lib/feedback-schema.ts`) a nezapomeň na rate limit u nových veřejných akcí
- Nová emailová šablona → rozšiř `lib/email.ts`, nepiš HTML inline v actions
- `notes` je výhradně pro admina — **nikdy ho neposílej na `/p/[token]`**
- `public_token` se generuje v databázi — **nikdy ho negeneruj na frontendu**
- Auth check v server komponentě: `getServerSession(authOptions)` z `next-auth`
- Výchozí chování na portálu: cena je **skrytá** (volitelné zapnutí)
- Nová DB změna → nová idempotentní migrace v `migrations/`, ne přímá úprava základního schématu výše
- Časové sloty/kalendářní logika → vždy přes `lib/prague-time.ts`, nepřepočítávej timezony znovu v komponentě
- **Zdroje poptávek:** domény, `source`, názvy a klíče ber vždy z `LEAD_ORIGINS` v `lib/lead-origins.ts` — nikdy nehardcoduj `'vizeon_web'` ani doménu v nové logice. Cestu k zakázce dává `projectPath(id)`
- **`lead_pending` je generovaný sloupec** — do žádného `INSERT INTO projects` nepatří, jinak Postgres celý zápis odmítne. Čekající poptávku poznáš `WHERE lead_pending`, ne porovnáváním `source` a příznaků
- **Stará adresa se nesmí stát 404:** nová nebo přesunutá obrazovka = řádek v `lib/legacy-redirects.mjs` (odkazy leží v `notifications.link` a ve starých e-mailech)
- Dotaz nad `projects` nebo `calendar_events` už **nefiltruje podle byznysu** — je jeden. `lead_origin` je štítek pro zobrazení a filtry v UI, ne hranice dat
- Neon vrací `date`/`timestamptz` jako **`Date` objekt, ne string** — nikdy na tom nevolej `.split()` apod. (opakovaný zdroj pádů v historii)
- Daně a odvody počítej **jen** přes `lib/tax.ts` + `lib/tax-constants.ts`; daňové termíny jsou pevný kalendář v `lib/tax-deadlines.ts`
- AI přepis faktury **nikdy neblokuje** ruční uložení — bez `ANTHROPIC_API_KEY` musí appka fungovat dál
- Částky v různých měnách (CZK/EUR) se **nikdy** nesčítají do jednoho čísla
