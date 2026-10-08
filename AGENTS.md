# ZakazIQ — AGENTS.md

> **Pravidla a technická fakta pro všechny agenty v repu** — Claude Code, Cursor, Codex, Copilot i lidi. Co projekt je, z čeho se skládá a jaká pravidla platí.
>
> **Než začneš pracovat:** přečti [`memory/index.md`](memory/index.md) → [`memory/memory.md`](memory/memory.md) (aktuální stav, rozhodnutí, otevřené problémy) a dodržuj [`memory/pravidla.md`](memory/pravidla.md) — včetně povinnosti zapsat každou dokončenou změnu do changelogu v `memory/memory.md`.
>
> Chování a proces specifické pro Claude Code jsou v [`CLAUDE.md`](CLAUDE.md) — krátký rozcestník sem. **Když se pravidla v těchto dvou souborech rozcházejí, platí `AGENTS.md` a rozpor oprav.** Stav práce a historie sem nepatří.

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
| Bezpečnost (celé repo) | `middleware.ts`, `next.config.mjs` (hlavičky), `lib/security/`, `public/.well-known/`, `.github/workflows/security.yml`, `.claude/security/` | mění se jen spolu se zápisem do `.claude/security/` (B13) |

Co se z adminu přebírá (příjem poptávek, časové helpery, faktury, daně, e-maily, portál), se **zkopíruje** do `lib/ws/` a tam zobecní. Původní soubor zůstává netknutý.

---

# Část A — Admin konzole

> Kryštofův osobní produkční systém (VIZEON, ALTENO, Hub, klientský portál). Popis níže je popis **existujícího kódu** — platí pro údržbu adminu, ne jako vzor pro Workspace.

## Vize a cíl

**ZakazIQ** je jednoduchý nástroj pro freelancery, živnostníky a řemeslníky. V první fázi jde o **osobní nástroj pro vlastní potřebu** — přehled projektů, jejich stav a sdílení s klientem přes jednoduchý link.

**Filozofie UX:** Nejlepší design je ten, který uživatel vůbec nevnímá, protože mu nepřekáží v práci. Freelanceři nemají čas bojovat se složitým softwarem. Chtějí otevřít aplikaci, jedním pohledem zjistit stav byznysu a jedním kliknutím poslat klientovi update.

**Klientský portál musí být absolutně „frictionless"** — žádné registrace, žádná hesla, jen čistá a profesionálně vypadající pravda o projektu.

---

## Tech Stack

| Vrstva | Technologie | Poznámka |
|--------|-------------|----------|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, App Router — nikdy Pages Router |
| Styling | Tailwind CSS (+ `clsx`, `tailwind-merge`) | Vlastní komponenty, brand-* barvy — shadcn/ui admin nepoužívá |
| Animace | Framer Motion | Booking modal, success states |
| Ikony | Lucide React | Konzistentní `strokeWidth={1.5}` napříč celou app |
| Databáze | Neon (serverless PostgreSQL) | `@neondatabase/serverless`, připojení přes `DATABASE_URL` |
| Validace | Zod + react-hook-form | `lib/feedback-schema.ts` |
| Auth | NextAuth.js v4 + Credentials | Jediný admin účet v env proměnných, JWT session, chráněno i přes `middleware.ts` |
| Email | Nodemailer + Gmail SMTP | `lib/email.ts` — dva účty (výchozí + VIZEON) + branded HTML layout |
| Deployment | Vercel | Zero-ops, napojení na GitHub, Hobby plán (crony max 1× denně) |
| AI | `@anthropic-ai/sdk` | AI asistenti (Startup) + AI přepis PDF faktur (`lib/invoice-ai.ts`) |
| Drag-and-drop | `@dnd-kit/*` | Řazení bloků šablony webu (`ProjectBlockList`) |
| Scraping | `puppeteer-core` + `@sparticuz/chromium` | Hub › Škola (LernSax, Beste Schule) |
| Testy | Vitest | `npm test` — testy v `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |

### Příkazy

```bash
npm run dev      # lokální vývoj (http://localhost:3000)
npm run build    # produkční build — musí projít před commitem větší změny
npm test         # vitest run
npm run lint     # next lint
node scripts/apply-migration.js 063_project_notes_meeting_log.sql   # aplikace migrace na DATABASE_URL z .env.local
```

### Env proměnné

Kompletní a komentovaný seznam je v **`.env.example`** — to je zdroj pravdy, udržuj ho v sync. Přehled:

| Skupina | Proměnné |
|---------|----------|
| DB + auth | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` |
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

## Databázový model

Základní schéma je v tomto souboru níže. Inkrementální změny (nové tabulky/sloupce, opravy constraintů) jsou v `migrations/*.sql` — čísluj sekvenčně a pište idempotentně (`IF NOT EXISTS`, `DO $$ ... $$` guard na constrainty).

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
| business | text | `'vizeon'` | Do které sekce zakázka patří — `vizeon` / `alteno` (migrace 050) |
| alteno_confirmed | boolean | false | Potvrzená poptávka z alteno.cz — obdoba `vizeon_confirmed` (migrace 050) |

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
| business | text | `vizeon` / `alteno`, default `'vizeon'` (migrace 050) — VIZEON kalendář zobrazuje jen své události |
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
| `costs` | 011, 012, 013, 060 | Náklady — firemní (`/dashboard/naklady`) i osobní fixní (`/hub/finance`), volitelná vazba na projekt |
| `project_surveys` | 016, 046 | Dotazník spokojenosti (`/h/[token]`, `completed_projects.survey_token`) — max 1 na zakázku |
| `notifications` | 018 | In-app notifikace (`/dashboard/notifications`) |
| `invoices` | 053, 056 | Archiv faktur (PDF, AI přepis, vazba na transakci) |
| `tax_news` | 055 | Novinky z legislativy (RSS FS + ČSSZ, cron) |
| `project_notes` | 059, 063 | Log schůzek/hovorů u zakázky (autor + snapshot progressu) |
| `block_templates` | 061 | Globální knihovna bloků šablon webu |
| `project_blocks` | 062 | Bloky šablony per zakázka (řazení drag-and-drop) |
| `finance_transactions` | 019, 026, 027, 054 | Hub › Finance — transakce; `declared` = přiznaná linie (fakturováno na IČO) |
| `finance_goals`, `recurring_cash_flow` | 019, 031 | Finanční cíle, opakované cash-flow položky |
| `school_*` | 019, 020, 022, 025 | Hub › Škola — známky, termíny, zprávy, rozvrh, ruční záznamy, sync log |
| `nutrition_logs`, `workout_logs`, `health_scores`, `weight_logs` | 019, 021, 023 | Hub › Sport |
| `startup_projects` (+ `_improvements`, `_changelog`) | 032, 034, 035 | Hub › Byznys › Startup (waitlist DB URL, cenové tiery) |
| `personal_projects` (+ `_improvements`, `_changelog`) | 033 | Hub › Projekty |
| `plan_*` | 036–041 | Hub › Plány (škola, projekty, byznys, sport, finance) |
| `plans_legacy_archived` | 042 | Stará plochá tabulka plánů — jen archiv, nepoužívat |

**DB funkce/triggery:** `check_calendar_overlap`, `check_consultation_overlap` (overlap guard napříč tabulkami, migrace 008/043/044), `is_vizeon_pending()`, `is_alteno_pending()` (migrace 048/050).

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
├── providers.tsx                ← SessionProvider wrapper (client)
├── dashboard/
│   ├── layout.tsx               ← Ochrana routy (getServerSession) + nav
│   ├── page.tsx                 ← Přehled zakázek
│   ├── new/page.tsx             ← Nová zakázka
│   ├── calendar/page.tsx        ← Globální kalendář (všechny projekty)
│   ├── faktury/page.tsx         ← Evidence všech vystavených faktur (napříč byznysy)
│   ├── faktury/[id]/page.tsx    ← Detail faktury — kompletní přepsané údaje + PDF + vazba na ledger
│   └── [id]/page.tsx           ← Detail + editace zakázky + FeedbackFeed + ConsultationCalendar
├── alteno/                      ← Sekce ALTENO (AI automatizace) — jádro stejné jako VIZEON
│   ├── layout.tsx               ← Auth + ALTENO nav (Zakázky | Rezervace), amber branding
│   ├── page.tsx                 ← Přehled ALTENO zakázek
│   ├── new/page.tsx             ← Nová ALTENO zakázka
│   ├── rezervace/page.tsx       ← Inbox nepotvrzených poptávek z alteno.cz
│   └── [id]/page.tsx           ← Detail + editace ALTENO zakázky
├── p/
│   └── [token]/page.tsx        ← Klientský portál (public, bez auth) — FeedbackBlock + BookingCTA
├── layout.tsx
└── globals.css

components/
├── ProjectCard.tsx              ← Karta zakázky v dashboardu (prop `business` řídí cestu i barvy)
├── ProjectForm.tsx              ← Formulář (volá server actions, prop `business`)
├── BookingCard.tsx              ← Admin: karta poptávky z webu + potvrzení/smazání (VIZEON i ALTENO)
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
├── business.ts                  ← VIZEON/ALTENO konfigurace: cesty, domény, source, branding
├── web-booking.ts               ← Sdílená implementace veřejného booking endpointu (obě domény)
├── auth.ts                      ← NextAuth authOptions
├── email.ts                     ← Sdílený nodemailer transporter + branded HTML layout (sendBrandedEmail)
├── feedback-schema.ts           ← Zod schémata: feedbackSchema, bookingSchema
├── prague-time.ts               ← Timezone helpery (Europe/Prague), generování slotů, kalendářní utility
├── utils.ts
└── types.ts

middleware.ts                    ← jediný middleware: NextAuth pro /dashboard, /alteno, /hub (vč. podcest) + CSP s nonce (B13)
migrations/                      ← Inkrementální SQL migrace nad základním schématem
scripts/                         ← Běhouny migrací (apply-migration.js = obecný) + debug skripty
docs/                            ← Implementační plány velkých celků (viz memory/index.md)
memory/                          ← Paměť projektu: index, pravidla, živý stav + changelog
```

Strom výše ukazuje jádro. **Úplný seznam** souborů server actions, rout a API je níže.

### Server actions (soubory)

| Soubor | Oblast |
|--------|--------|
| `app/actions.ts` | Zakázky: CRUD, vzkazy, potvrzení/smazání poptávek z webu (VIZEON/ALTENO), `markProjectAsCompleted`, `notifyClientOfProjectChange` |
| `app/portal-actions.ts` | Veřejné (token): `submitFeedback`, `submitConsultation`, `submitSurvey` |
| `app/calendar-actions.ts` | Kalendářní události (+ párový lead v Hovorech) |
| `app/calls-actions.ts` | Hovory: leady, poznámky, waiting stav, převod na zakázku, portfolio email, vlastní email |
| `app/completed-actions.ts` | Dokončené zakázky + dotazníky |
| `app/costs-actions.ts` | Náklady — jediný zdroj pravdy pro firemní i osobní náklady |
| `app/notification-actions.ts` | Notifikace (přečteno) |
| `app/project-notes-actions.ts` | Log schůzek u zakázky |
| `app/block-templates-actions.ts`, `app/project-blocks-actions.ts` | Šablony webu — knihovna bloků / bloky zakázky |
| `app/hub/finance/finance-actions.ts` | Transakce, měsíční agregace, opakované cash-flow, příjmy z byznysu |
| `app/hub/finance/invoice-actions.ts` | **Veškerá logika faktur** (sdílené jádro v `lib/invoices.ts`) |
| `app/hub/finance/tax-news-actions.ts` | Novinky z legislativy |
| `app/hub/byznys/…` | Přehled byznysu, Startup projekty (+ waitlist, launch email přes Resend) |
| `app/hub/projekty/projekty-actions.ts` | Osobní projekty |
| `app/hub/plany/**/…-actions.ts` | Plány po kategoriích |
| `app/hub/school/actions.ts`, `app/hub/sport/sport-actions.ts` | Škola, Sport |

### Mapa rout (admin)

| Sekce | Routy |
|-------|-------|
| VIZEON (`/dashboard`) | `/dashboard`, `/new`, `/[id]`, `/[id]/sablona` (šablona webu zakázky), `/vizeon` (inbox poptávek z vizeon.cz), `/calendar`, `/calls` (Hovory), `/dokoncene`, `/hodnoceni`, `/naklady`, `/faktury`, `/faktury/[id]`, `/sablony` (knihovna bloků), `/notifications`, `/profil` |
| ALTENO (`/alteno`) | `/alteno`, `/new`, `/[id]`, `/rezervace` |
| Hub (`/hub`) | `/hub`, `/byznys` (+ `/startup`, `/startup/new`, `/startup/[id]`), `/finance`, `/plany` (+ `/skola`, `/projekty`, `/byznys`, `/byznys/[id]`, `/sport`, `/finance`), `/projekty` (+ `/new`, `/[id]`), `/school`, `/sport` |
| Legacy | `/dashboard/projekty/**` — z navigace odstraněno (přesunuto do Hubu), soubory zůstaly, viz `memory/memory.md` |

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
| `POST /api/public/leads` | `N8N_API_KEY` | Leady z n8n chatbota → Hovory |
| `POST /api/public/agent-leads` | Bearer `VIZEON_AGENT_API_KEY` | AI-scorované leady z `vizeon-lead-agent` |
| `POST /api/public/invoices` | Bearer `INVOICES_API_KEY` | Zakládání faktur zvenčí (n8n) |
| `POST /api/invoices/parse` | session | AI přepis PDF faktury (nic neukládá) |
| `GET /api/invoices/[id]/pdf` | session (kontrola v route — middleware `/api` nehlídá) | PDF faktury |
| `POST /api/ai-assistant` | session | AI asistenti (Anthropic) |
| `GET /api/fatsecret/search` | — | Vyhledávání jídla (dnes Open Food Facts, název je historický) |
| `POST /api/school/sync` | session | Ruční spuštění školního scraperu (proxy na cron) |
| `/api/cron/*` | Bearer `CRON_SECRET` (`verifyCronSecret`) | Viz crony níže |

Veřejná API: vždy `lib/api-auth.ts` (constant-time porovnání klíče, fail-closed) + `lib/api-rate-limit.ts` + Zod validace. Klíč se nikdy neloguje.

### Crony (`vercel.json`, Vercel Hobby = max 1× denně per job)

| Endpoint | Kdy (UTC) | Co |
|----------|-----------|----|
| `/api/cron/scrape-school` | denně 6:00 | LernSax + Beste Schule scraping |
| `/api/cron/send-reminders` | denně 7:00 | Připomínky konzultací, lead akcí, školních termínů (idempotentní příznaky proti duplicitám) |
| `/api/cron/tax-news` | pondělí 5:00 | Stažení legislativních novinek (`ON CONFLICT DO NOTHING`) |

---

## Stránky — co každá dělá

### `/login`
- Email + heslo přes NextAuth Credentials
- Po přihlášení redirect na `/dashboard`
- Čistý minimalistický design

### `/dashboard`
- **Summary bar:** počet aktivních zakázek · celková očekávaná platba · celkem nezaplaceno
- **Tlačítko + Nová zakázka** — přechod na `/dashboard/new`
- **Filtry:** Všechny | Probíhající | Čeká na platbu | Hotové
- **Karta zakázky** zobrazuje: jméno klienta, popis, progress bar (%), status badge, cena, zaplaceno/ne, deadline, tlačítko Sdílet link
- Kliknutí na kartu = přechod na `/dashboard/[id]`

### `/dashboard/new`
- Formulář: client_name, description, focus, project_url, status, progress, price, paid, deadline, notes, client_email
- Po uložení redirect na `/dashboard`

### `/dashboard/[id]`
- Editace všech polí zakázky
- Tlačítko **Kopírovat klientský link** — zkopíruje `/p/[public_token]` do schránky + toast potvrzení
- QR kód pro sdílení
- **FeedbackFeed** — NPS hodnocení od klienta pro tento projekt
- **ConsultationCalendar** — rezervované konzultace pro tento projekt
- Tlačítko smazat zakázku

### `/dashboard/calendar`
- Globální kalendář (Month/Week/Day) napříč VIZEON projekty — konzultace + manuální události/blokace
- Admin může vytvořit ruční událost nebo blokaci přes `AdminEventModal`

### `/dashboard/faktury`
- **Evidence všech vystavených faktur** — archiv dokladů, řazený podle data vystavení a seskupený po rocích
- Filtry: hledání (číslo / klient / zakázka / IČO / poznámka), rok, stav (Všechny | Zaplacené | Nezaplacené | Po splatnosti)
- Souhrn nad filtrovaným výběrem: počet, vyfakturováno, zaplaceno, nezaplaceno — **sčítá se po měnách**, CZK a EUR se nikdy neslučují do jednoho čísla
- Nová faktura přes tlačítko nebo přetažením PDF na stránku (AI přepis přes `InvoiceUploadModal`)
- **Záměrně napříč byznysy** — VIZEON i ALTENO fakturuje jedno IČO pod jedním přiznáním, rozdělený archiv by znamenal hledat doklad na špatném místě
- Komponenta `InvoiceRegistry.tsx`; data z `getAllInvoices()` v `app/hub/finance/invoice-actions.ts` (veškerá logika faktur žije tam, tahle sekce je jen další pohled)

### `/dashboard/faktury/[id]`
- Kompletní přepis jedné faktury: číslo, částka/měna, vystaveno/splatnost/zaplaceno, odběratel + IČO + DIČ, poznámka
- Náhled přiloženého PDF (`<object>` + odkaz na `/api/invoices/[id]/pdf`), vazba na zakázku, úprava a smazání
- **Přiznaná linie** — jestli faktura v ledgeru příjem založila, nebo jen převzala ten od zakázky (`owned_by_invoice`); bez `paid_on` žádný nemá
- **Co z PDF přečetla AI** — surový `ai_extracted` pro dohledatelnost; pole, kde se uložená hodnota od přepisu liší, jsou označená jako ručně upravená. Platí vždy uložené údaje, ne přepis
- Data z `getInvoiceDetail()`; akce v `InvoiceDetailActions.tsx`

### `/alteno` — sekce ALTENO (AI automatizace)
Druhý byznys vedle VIZEONu. **Stejný software jako jádro VIZEON dashboardu**, jen nad daty s `business = 'alteno'` a s vlastním brandingem (amber/orange místo brand-*). Rozsah je záměrně jen jádro:

| Stránka | Co dělá |
|---------|---------|
| `/alteno` | Přehled ALTENO zakázek — SummaryBar, nadcházející konzultace, filtry, karty |
| `/alteno/new` | Nová ALTENO zakázka |
| `/alteno/[id]` | Detail + editace, sdílení klientského linku, vzkazy, historie postupu, feedback, konzultace, smazání |
| `/alteno/rezervace` | Inbox nepotvrzených poptávek z alteno.cz — potvrdit jako zakázku / smazat |

Co ALTENO **nemá** (zůstává jen ve VIZEONu): Kalendář, Hovory, Dokončené, Hodnocení, Náklady, Faktury. Proto detail ALTENO zakázky nenabízí „Přidat do dokončených" a `ProjectForm` tam skrývá checkbox „Ihned přidat do dokončených".

**Oddělení dat:** `projects.business` a `calendar_events.business` (`'vizeon' | 'alteno'`, default `'vizeon'`). VIZEON stránky filtrují `business = 'vizeon'`, ALTENO `= 'alteno'`. `consultation_slots` vlastní sloupec nemá — business se dohledá joinem přes `projects`.

**Sdílené napříč oběma:** klientský portál `/p/[token]`, notifikace (`/dashboard/notifications`), profil (`/dashboard/profil` — statistiky napříč byznysy), evidence faktur (`/dashboard/faktury` — jedno IČO, jedno přiznání), Hub finance a DB overlap guard na termínech (jeden člověk = jeden diář, dvě konzultace ve stejný čas nelze rezervovat ani napříč byznysy).

`/dashboard/[id]` a `/alteno/[id]` se navzájem přesměrovávají podle `business` — starší odkazy z notifikací a emailů tak nikdy nekončí na 404.

### `/p/[token]` — Klientský portál (PUBLIC)
- **Bez přihlášení, bez registrace**
- Klient vidí: název projektu, jméno freelancera, popis, focus, vizuální progress bar, status badge, deadline, datum poslední aktualizace, link na živou verzi (pokud vyplněn `project_url`)
- **FeedbackBlock** — klient může nechat NPS hodnocení + komentář
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

**Dva odesílací účty:** VIZEON má vlastní Gmail schránku (`VIZEON_GMAIL_USER`/`VIZEON_GMAIL_APP_PASSWORD` = info@vizeon.cz), oddělenou od výchozího `GMAIL_USER` (přihlášení + ALTENO + Hub). `lib/email.ts` drží samostatný nodemailer transporter per účet a vybírá ho podle volitelného `business` parametru v `sendBrandedEmail`/`sendPlainEmail` — chybí-li VIZEON dvojice env proměnných kompletní, spadne zpět na výchozí účet (nikdy nezkouší auth s nesedícím heslem).

- **Nová volaná funkce, kde jde jasně určit byznys projektu/leadu → vždy pošli `business`.** Cíl admin notifikace se stejně tak odvozuje přes `adminEmailFor(business)` z `lib/business.ts` (VIZEON → `VIZEON_ADMIN_EMAIL`, jinak `ADMIN_EMAIL`) — nikdy nečti `process.env.ADMIN_EMAIL` přímo, pokud je byznys známý.
- Funkce, které existují jen ve VIZEON sekci (Hovory/`client_leads`, Dokončené/`completed_projects`, dotazník spokojenosti) → volej s natvrdo `business: 'vizeon'`, protože v DB nemají sloupec `business` k odvození.
- Selhání odeslání emailu **nikdy** nesmí shodit DB mutaci — `sendBrandedEmail`/`sendPlainEmail` interně chytají chyby a vrací `false`, voláno bez `await` na výsledek pokud na něm nic nezávisí.
- Emaily se neodešlou, pokud chybí odpovídající dvojice `*_USER`/`*_APP_PASSWORD` — v dev prostředí appka funguje i bez nich, jen nechodí maily.
- Trigger body: `notifyClientOfProjectChange` v `app/actions.ts` (vytvoření/update projektu → klient), `submitConsultation` v `app/portal-actions.ts` (rezervace → admin i klient).

---

## Bezpečnost

- **NextAuth JWT session** — admin chráněn `middleware.ts` (matcher `/dashboard`, `/alteno`, `/hub` vč. podcest) + `getServerSession` v layoutu. `/api/*` middleware **nehlídá** — každá neveřejná API routa si session kontroluje sama
- **Security hlavičky** v `next.config.mjs`, CSP s nonce v `middleware.ts` (admin zatím Report-Only) — stav a pravidla v B13 a `.claude/security/STATE.md`; server actions body limit 5 MB kvůli PDF faktur
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
- **Dva byznysy:** cesty, domény, `source` a názvy ber vždy z `BUSINESSES` v `lib/business.ts` — nikdy nehardcoduj `/dashboard`, `/alteno` ani `'vizeon_web'` v nové logice
- Nový dotaz nad `projects` nebo `calendar_events` → rozmysli, jestli patří jen jednomu byznysu, a filtruj `business`. Bez filtru se ALTENO data objeví ve VIZEONu
- Nová sdílená komponenta pro obě sekce → prop `business?: Business` s defaultem `'vizeon'`, ne duplikát souboru
- Podmínka „nepotvrzená poptávka z webu" žije v DB jako `is_vizeon_pending()` / `is_alteno_pending()` — neon `sql` tag neumí skládat fragmenty, takže ji nelze sdílet jako JS konstantu
- Neon vrací `date`/`timestamptz` jako **`Date` objekt, ne string** — nikdy na tom nevolej `.split()` apod. (opakovaný zdroj pádů v historii)
- Daně a odvody počítej **jen** přes `lib/tax.ts` + `lib/tax-constants.ts`; daňové termíny jsou pevný kalendář v `lib/tax-deadlines.ts`
- AI přepis faktury **nikdy neblokuje** ruční uložení — bez `ANTHROPIC_API_KEY` musí appka fungovat dál
- Částky v různých měnách (CZK/EUR) se **nikdy** nesčítají do jednoho čísla

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

## B4. Přihlášení a role

- Clerk: Organization = účet (firma, jedno IČO, předplatné). Role `owner`, `staff`.
- Přihlášení bez hesla: e-mailový kód nebo Google.
- Jedna doména: landing na `/`, aplikace na `/w/*`, jedna Clerk instance (R-017). Cesty veřejných částí viz Hranice v repu (R-016).
- Jeden `middleware.ts`: veřejné cesty; Workspace přes Clerk; admin cesty přes NextAuth token jako dnes. Admin přihlášení zůstává na `/login`, odkaz „Admin" ve footeru landing page.
- Webhook Clerk (`/api/clerk/webhook`, ověření podpisu) synchronizuje účty a členy do `ws`.

## B5. Platby

- Jeden produkt, jedna měsíční cena `STRIPE_PRICE_MONTHLY`: **249 Kč konečná cena** (provozovatel je neplátce DPH, R-018).
- Zkušební doba **14 dní bez platební karty**; po ní výzva k platbě, bez předplatného jen čtení (R-019).
- V ceně **1 byznys a neomezeně pracovníků**. Datový model a URL počítají s více byznysy na účet (`business_id`, `/w/[byznys]`), přidání dalšího byznysu je v UI zatím vypnuté (R-026).
- Checkout se zakládá na serveru, `account_id` v metadatech. Customer Portal pro změny a zrušení.
- Webhook ověřuje podpis, každou událost uloží do `ws.stripe_events` a zpracuje jen jednou.
- Přístup řídí `hasActiveSubscription(accountId)`. Po neúspěšné platbě 7 dní lhůta, pak jen čtení. Data se nikdy nemažou, poptávky z webu se ukládají dál.

## B6. Příjem poptávek z webů

- `GET /api/public/v1/schema` a `POST /api/public/v1/requests`.
- Dva druhy klíčů na byznys: veřejný (widget, kontrola domény přes CORS) a tajný (server-server, posílá se v `Authorization: Bearer`). Tajný klíč se ukládá jen jako hash.
- Validace podle kolonek byznysu, rate limit, přiřazení zákazníka podle telefonu/e-mailu, notifikace, e-mail. Uložení poptávky nesmí nikdy shodit selhání e-mailu ani notifikace.
- Chyby vrací `{ success: false, code, error }`, `error` česky a srozumitelně.

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

1. `npm run build` a `npm test` prochází.
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
| Admin přihlášení (NextAuth), místo pro Clerk (S07) | `middleware.ts` — pořadí: admin auth → Clerk → CSP |
| `frame-ancestors` pro `/r/[slug]`, CORS pro `/api/public/v1/*` | `lib/security/embed.ts` (`frameAncestorsFor`, `corsHeaders`, `preflightResponse`) |
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
| [`memory/index.md`](memory/index.md) | Mapa — kde co najít (dokumenty i kód podle úlohy) |
| [`memory/pravidla.md`](memory/pravidla.md) | Pravidla paměti — co se kam zapisuje, kdy a v jakém formátu |
| [`memory/memory.md`](memory/memory.md) | Živý stav: aktuální stav, rozhodnutí s důvody, otevřené problémy, changelog |

**Povinné:** po každé dokončené změně zapiš záznam do changelogu v `memory/memory.md` podle `memory/pravidla.md`. Změníš-li technický fakt popsaný v tomto souboru (tabulka, routa, env, pravidlo), oprav ho tady ve stejném commitu.
