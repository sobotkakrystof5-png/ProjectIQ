# ZakazIQ — Admin konzole (popis kódu)

> Vyčleněno z `AGENTS.md` (část A) 2026-10-09, aby se popis adminu nenačítal do každého sezení (R-042). **Čti před každou změnou admin konzole.** Příkazy a env proměnné zůstaly v [`../../AGENTS.md`](../../AGENTS.md) → Část A. Pravidla a hranice v repu platí z `AGENTS.md`.

> Kryštofův osobní produkční systém (VIZEON, ALTENO, Hub, klientský portál). Popis níže je popis **existujícího kódu** — platí pro údržbu adminu, ne jako vzor pro Workspace.

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
| Animace | Framer Motion | Booking modal, success states |
| Ikony | Lucide React | Konzistentní `strokeWidth={1.5}` napříč celou app |
| Databáze | Neon (serverless PostgreSQL) | `@neondatabase/serverless`, připojení přes `DATABASE_URL` |
| Validace | Zod + react-hook-form | `lib/feedback-schema.ts` |
| Auth | NextAuth.js v4 + Credentials | Jediný admin účet v env proměnných, JWT session s platností 12 h (`lib/auth.ts`, od 2026-11-03), zámek 5 chybných pokusů za 15 min na IP, chráněno i přes `proxy.ts` |
| Email | Nodemailer + Gmail SMTP | `lib/email.ts` — dva účty (výchozí + VIZEON) + branded HTML layout |
| Deployment | Vercel | Zero-ops, napojení na GitHub, Hobby plán (crony max 1× denně) |
| AI | `@anthropic-ai/sdk` | AI asistenti (Startup) + AI přepis PDF faktur (`lib/invoice-ai.ts`) |
| Drag-and-drop | `@dnd-kit/*` | Řazení bloků šablony webu (`ProjectBlockList`) |
| Scraping | `puppeteer-core` + `@sparticuz/chromium` | Hub › Škola (LernSax, Beste Schule) |
| Testy | Vitest | `npm test` — testy v `lib/__tests__`, `components/__tests__`, `types/__tests__`, `app/api/**/__tests__` |


> Příkazy a env proměnné: [`AGENTS.md`](../../AGENTS.md) → Část A.

---

## Databázový model

Základní schéma je v tomto souboru níže. Inkrementální změny (nové tabulky/sloupce, opravy constraintů) jsou v `migrations/*.sql` — čísluj sekvenčně a pište idempotentně (`IF NOT EXISTS`, `DO $$ ... $$` guard na constrainty).

**Tabulky `projects`, `client_messages` a `progress_updates` žádná migrace nezakládá** — vznikly ručně v Neon konzoli před migrací 001. Na čistou databázi je dostane `node scripts/apply-migration.js scripts/admin-base-schema.sql`, pak teprve jdou migrace 001+ (AD00).

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
| `client_requests` | 092 | Požadavky klientů z portálu `/p/[token]` (text nebo přepis hlasu, shrnutí a zadání od AI, stav nové/hotovo/zahozeno); audio se neukládá |
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
| `project_activity` | 093 | Aktivita zakázky (KP03): koncepty a schválené zprávy, `status` draft/published/rejected, `source` manual/claude_code/system, `contains_sensitive`, `client_emailed_at` (souhrnný e-mail max. 1× za den) |
| `project_agent_keys` | 094 | Klíče projektů pro hlášení z Claude Code (KP04): prefix + HMAC hash, jeden platný klíč na projekt, kdo a kdy vytvořil/zneplatnil |
| schéma `portal` (`clients`, `members`, `invites`, `projects`, `activity`, `requests`, `messages`, `feedback`) | 095, 096, 098 | Klientský prostor (KP05–KP07), retence 3 roky (098): projekce schváleného, RLS podle `app.client_id`, role `portal_app` bez práv do `public`. Podrobně `docs/klientsky-prostor/PLAN.md` a `.claude/security/DECISIONS.md` #020 |

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

proxy.ts                         ← jediný proxy (dřív middleware.ts): NextAuth pro /dashboard, /alteno, /hub (vč. podcest), Clerk jen pro /w a /api/ws, CSP s nonce (B13)
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
| `app/portal-actions.ts` | Veřejné (token): `submitFeedback`, `submitConsultation`, `submitSurvey`, `submitClientRequest` (AI shrnutí běží v `after()`) |
| `app/client-requests-actions.ts` | Admin: změna stavu požadavku klienta (`/dashboard/pozadavky`) |
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
| VIZEON (`/dashboard`) | `/dashboard`, `/new`, `/[id]`, `/pozadavky` (požadavky klientů z portálu, napříč VIZEON i ALTENO), `/[id]/sablona` (šablona webu zakázky), `/vizeon` (inbox poptávek z vizeon.cz), `/calendar`, `/calls` (Hovory), `/dokoncene`, `/hodnoceni`, `/naklady`, `/faktury`, `/faktury/[id]`, `/sablony` (knihovna bloků), `/notifications`, `/profil`, `/klienti` + `/klienti/[id]` a `/novinky` (ZakazIQ Workspace, S17 — popis v `docs/AGENTS-REFERENCE.md` → „Admin nad Workspace“) |
| ALTENO (`/alteno`) | `/alteno`, `/new`, `/[id]`, `/rezervace` |
| Hub (`/hub`) | `/hub`, `/byznys` (+ `/startup`, `/startup/new`, `/startup/[id]`), `/finance`, `/plany` (+ `/skola`, `/projekty`, `/byznys`, `/byznys/[id]`, `/sport`, `/finance`), `/projekty` (+ `/new`, `/[id]`), `/school`, `/sport` |

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
| `POST /api/public/portal/[token]/transcribe` | token projektu + limit IP/projekt | Přepis hlasu klienta (OpenAI), nic neukládá, vrací jen text (`lib/transcribe.ts`) |
| `GET /api/invoices/[id]/pdf` | session (kontrola v route — proxy `/api` nehlídá) | PDF faktury |
| `POST /api/ai-assistant` | session | AI asistenti (Anthropic) |
| `GET /api/fatsecret/search` | — | Vyhledávání jídla (dnes Open Food Facts, název je historický) |
| `POST /api/school/sync` | session | Ruční spuštění školního scraperu (proxy na cron) |
| `/api/cron/*` | Bearer `CRON_SECRET` (`verifyCronSecret`) | Viz crony níže |
| `POST /api/agent/v1/projects/{id}/reports` | `Authorization: Bearer zk_agent_…` | Hlášení z Claude Code jako koncept (KP04). Klíč umí jen zápis konceptu do svého projektu; limity 20/hod na klíč, 60/hod na IP; `AGENT_KEY_PEPPER` |
| `POST /api/klient/transcribe` | přihlášený člen klientského prostoru (Clerk) | Přepis hlasu pro požadavek klienta; limit po IP a členovi |

Veřejná API: vždy `lib/api-auth.ts` (constant-time porovnání klíče, fail-closed) + `lib/api-rate-limit.ts` + Zod validace. Klíč se nikdy neloguje.

### Crony (`vercel.json`, Vercel Hobby = max 1× denně per job)

| Endpoint | Kdy (UTC) | Co |
|----------|-----------|----|
| `/api/cron/scrape-school` | denně 6:00 | LernSax + Beste Schule scraping |
| `/api/cron/send-reminders` | denně 7:00 | Připomínky konzultací, lead akcí, školních termínů (idempotentní příznaky proti duplicitám) |
| `/api/cron/tax-news` | pondělí 5:00 | Stažení legislativních novinek (`ON CONFLICT DO NOTHING`) |
| `/api/cron/client-retention` | denně 3:30 | Retence D-K10 (R-076, migrace 098): `public.purge_client_retention(3)` — dokončená zakázka (`done`/`paid`) bez pohybu 3 roky přijde o aktivitu, požadavky (`client_requests`, `portal.requests`), zprávy a slovní hodnocení; zakázka, cena a číselné hodnocení zůstávají. Pozvánky 90 dní po použití/zrušení/vypršení. `lib/client-retention.ts` |

---

## Stránky — co každá dělá

### `/login`
- Email + heslo přes NextAuth Credentials
- Po přihlášení redirect na `/dashboard`
- Čistý minimalistický design

### Kostra administrace (KP01, R-071)
- `/dashboard/*` a `/alteno/*` sdílí `components/admin/admin-shell.tsx`: postranní menu na počítači, horní lišta a spodní lišta s nabídkou „Více“ na telefonu, hledání ⌘K (stránky, zakázky, hovory, faktury; `app/admin-search-actions.ts`). Hub (`/hub`) má dál vlastní postranní panel.
- Menu a odznaky: `lib/admin-nav.ts` (skupiny Dnes · Zakázky · Kalendář a hovory · Peníze · Klienti · Osobní) a `lib/admin-counts.ts` (počty jedním dotazem). Nová stránka adminu = položka v `ADMIN_NAV`; test `lib/__tests__/admin-nav.test.ts` hlídá, že žádná dřívější cesta nezmizela.
- Vzhled: kostra používá Dílky (`data-app="admin"`, `app/admin-tokens.css`, jen barevné tokeny, bez přepsání proměnných shadcn). Obsah stránek zůstává na původním vzhledu (Inter, `brand-*`), dokud se nepřepne.

### `/dashboard` — Dnes (KP02)
- Jedna hlavní věc nahoře (`lib/admin-today.ts` → `pickFocus`): požadavek klienta → hlášení ke schválení → faktura po splatnosti → schůzka do 24 h → zakázka bez pohybu 14 dní. Pod ní sekce se stejnými věcmi. Data `lib/admin-today-queries.ts` (každá sekce se načítá zvlášť, chybějící tabulka = prázdná sekce).

### `/dashboard/zakazky`
- Seznam zakázek VIZEON i ALTENO s přepínačem firmy (`?firma=`), filtrem stavu (`?status=`), summary barem a počtem nevyřízených požadavků na kartě. `/alteno` zůstává seznamem ALTENO.

### `/dashboard/new`
- Formulář: client_name, description, focus, project_url, status, progress, price, paid, deadline, notes, client_email
- Po uložení redirect na `/dashboard`

### `/dashboard/[id]` a `/alteno/[id]` — detail zakázky (KP02)
- Jedna komponenta `components/admin/project-detail-view.tsx`, záložky v adrese `?zalozka=`: **Přehled** (editace, sdílení a QR, šablona webu, přidat do dokončených, smazat) · **Aktivita** (koncepty a schvalování, napojení Claude Code) · **Požadavky** (karty z `/dashboard/pozadavky` filtrované na zakázku) · **Zprávy** (vlákno v klientském prostoru, vzkazy, historie postupu, zpětná vazba, konzultace, poznámky) · **Fakturace** (jen VIZEON: faktury a náklady). Načítají se jen data aktivní záložky.
- Špatná sekce (`/dashboard/[id]` pro ALTENO zakázku a naopak) přesměruje na správnou.
- Nepřevedeno z plánu: změna stavu a fáze jedním klikem se „Zpět“. `updateProject` posílá klientovi e-mail, takže „Zpět“ by ho poslal podruhé.

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

**Dva odesílací účty:** VIZEON má vlastní Gmail schránku (`VIZEON_GMAIL_USER`/`VIZEON_GMAIL_APP_PASSWORD` = info@vizeon.cz), oddělenou od výchozího `GMAIL_USER` (přihlášení + ALTENO + Hub). `lib/email.ts` drží samostatný nodemailer transporter per účet a vybírá ho podle volitelného `business` parametru v `sendBrandedEmail`/`sendPlainEmail` — chybí-li VIZEON dvojice env proměnných kompletní, spadne zpět na výchozí účet (nikdy nezkouší auth s nesedícím heslem).

- **Nová volaná funkce, kde jde jasně určit byznys projektu/leadu → vždy pošli `business`.** Cíl admin notifikace se stejně tak odvozuje přes `adminEmailFor(business)` z `lib/business.ts` (VIZEON → `VIZEON_ADMIN_EMAIL`, jinak `ADMIN_EMAIL`) — nikdy nečti `process.env.ADMIN_EMAIL` přímo, pokud je byznys známý.
- Funkce, které existují jen ve VIZEON sekci (Hovory/`client_leads`, Dokončené/`completed_projects`, dotazník spokojenosti) → volej s natvrdo `business: 'vizeon'`, protože v DB nemají sloupec `business` k odvození.
- Selhání odeslání emailu **nikdy** nesmí shodit DB mutaci — `sendBrandedEmail`/`sendPlainEmail` interně chytají chyby a vrací `false`, voláno bez `await` na výsledek pokud na něm nic nezávisí.
- Emaily se neodešlou, pokud chybí odpovídající dvojice `*_USER`/`*_APP_PASSWORD` — v dev prostředí appka funguje i bez nich, jen nechodí maily.
- Trigger body: `notifyClientOfProjectChange` v `app/actions.ts` (vytvoření/update projektu → klient), `submitConsultation` v `app/portal-actions.ts` (rezervace → admin i klient).

---

## Bezpečnost

- **NextAuth JWT session** — admin chráněn `proxy.ts` (matcher `/dashboard`, `/alteno`, `/hub` vč. podcest) + `getServerSession` v layoutu. `/api/*` proxy **nehlídá** — každá neveřejná API routa si session kontroluje sama
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
- **Dva byznysy:** cesty, domény, `source` a názvy ber vždy z `BUSINESSES` v `lib/business.ts` — nikdy nehardcoduj `/dashboard`, `/alteno` ani `'vizeon_web'` v nové logice
- Nový dotaz nad `projects` nebo `calendar_events` → rozmysli, jestli patří jen jednomu byznysu, a filtruj `business`. Bez filtru se ALTENO data objeví ve VIZEONu
- Nová sdílená komponenta pro obě sekce → prop `business?: Business` s defaultem `'vizeon'`, ne duplikát souboru
- Podmínka „nepotvrzená poptávka z webu" žije v DB jako `is_vizeon_pending()` / `is_alteno_pending()` — neon `sql` tag neumí skládat fragmenty, takže ji nelze sdílet jako JS konstantu
- Neon vrací `date`/`timestamptz` jako **`Date` objekt, ne string** — nikdy na tom nevolej `.split()` apod. (opakovaný zdroj pádů v historii)
- Daně a odvody počítej **jen** přes `lib/tax.ts` + `lib/tax-constants.ts`; daňové termíny jsou pevný kalendář v `lib/tax-deadlines.ts`
- AI přepis faktury **nikdy neblokuje** ruční uložení — bez `ANTHROPIC_API_KEY` musí appka fungovat dál
- Částky v různých měnách (CZK/EUR) se **nikdy** nesčítají do jednoho čísla
