#ZakazIQ — CLAUDE.md

> Kontext pro Claude Code. Zahrnuje přehled zakázek, klientský portál, klientský feedback (NPS), rezervace konzultací a globální kalendář.

---

## Vize a cíl

**ZakazIQ** je jednoduchý nástroj pro freelancery, živnostníky a řemeslníky. V první fázi jde o **osobní nástroj pro vlastní potřebu** — přehled projektů, jejich stav a sdílení s klientem přes jednoduchý link.

**Filozofie UX:** Nejlepší design je ten, který uživatel vůbec nevnímá, protože mu nepřekáží v práci. Freelanceři nemají čas bojovat se složitým softwarem. Chtějí otevřít aplikaci, jedním pohledem zjistit stav byznysu a jedním kliknutím poslat klientovi update.

**Klientský portál musí být absolutně „frictionless"** — žádné registrace, žádná hesla, jen čistá a profesionálně vypadající pravda o projektu.

---

## Tech Stack

| Vrstva | Technologie | Poznámka |
|--------|-------------|----------|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, App Router — nikdy Pages Router |
| Styling | Tailwind CSS + shadcn/ui | Rychlé, profesionální komponenty, brand-* barvy |
| Animace | Framer Motion | Booking modal, success states |
| Ikony | Lucide React | Konzistentní `strokeWidth={1.5}` napříč celou app |
| Databáze | Neon (serverless PostgreSQL) | `@neondatabase/serverless`, připojení přes `DATABASE_URL` |
| Validace | Zod + react-hook-form | `lib/feedback-schema.ts` |
| Auth | NextAuth.js v4 + Credentials | Jediný admin účet v env proměnných, JWT session, chráněno i přes `middleware.ts` |
| Email | Nodemailer + Gmail SMTP | `lib/email.ts` — sdílený mailer + branded HTML layout |
| Deployment | Vercel | Zero-ops, napojení na GitHub |

### Env proměnné

```env
DATABASE_URL=             # Neon connection string (pooled)
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=             # http://localhost:3000 (dev) / https://... (prod)
ADMIN_EMAIL=              # e-mail pro přihlášení i pro notifikace o nových rezervacích
ADMIN_PASSWORD_HASH=      # bcrypt hash hesla (generuj: node -e "require('bcryptjs').hash('heslo',12).then(console.log)")

GMAIL_USER=               # Gmail adresa, ze které se odesílají emaily
GMAIL_APP_PASSWORD=       # App password (Google Account → Security → App passwords)

ADMIN_PHONE=               # Telefon pro WhatsApp/hovor, bez mezery a bez + (např. 420601234567)
GOOGLE_MEET_LINK=          # Permanentní Google Meet link
TEAMS_MEETING_LINK=        # Teams meeting link
```

Vzor je v `.env.example` — udržuj ho v sync s realitou, pokud přidáváš novou env proměnnou.

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
│   └── [id]/page.tsx           ← Detail + editace zakázky + FeedbackFeed + ConsultationCalendar
├── p/
│   └── [token]/page.tsx        ← Klientský portál (public, bez auth) — FeedbackBlock + BookingCTA
├── layout.tsx
└── globals.css

components/
├── ui/                          ← shadcn/ui komponenty
├── ProjectCard.tsx              ← Karta zakázky v dashboardu
├── ProjectForm.tsx              ← Formulář (volá server actions)
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
└── AdminEventModal.tsx          ← Admin: vytvoření manuální události/blokace

lib/
├── db.ts                        ← Neon klient: sql tagged template
├── auth.ts                      ← NextAuth authOptions
├── email.ts                     ← Sdílený nodemailer transporter + branded HTML layout (sendBrandedEmail)
├── feedback-schema.ts           ← Zod schémata: feedbackSchema, bookingSchema
├── prague-time.ts               ← Timezone helpery (Europe/Prague), generování slotů, kalendářní utility
├── utils.ts
└── types.ts

middleware.ts                    ← next-auth middleware, chrání /dashboard/:path*
migrations/                      ← Inkrementální SQL migrace nad základním schématem
```

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
- Globální kalendář (Month/Week/Day) napříč všemi projekty — konzultace + manuální události/blokace
- Admin může vytvořit ruční událost nebo blokaci přes `AdminEventModal`

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

Zdroj pravdy je `lib/types.ts` — obsahuje `Project`, `ClientMessage`, `ProgressUpdate`, `ClientFeedback`, `ConsultationSlot`, `ConsultationChannel`, `CalendarEvent` a odpovídající `STATUS_LABELS` / `STATUS_STYLES` / `CHANNEL_LABELS` konstanty. Necituj typy zde do CLAUDE.md — drift mezi dokumentací a kódem je horší než žádná dokumentace; při změně typu se dívej přímo do souboru.

---

## Emaily

Veškerá email logika je centralizovaná v `lib/email.ts` (`sendBrandedEmail`) — jeden nodemailer transporter (Gmail SMTP), jeden branded HTML layout (gradient header, card, CTA tlačítka). Nikdy nepiš novou HTML šablonu inline v server action — rozšiř `sendBrandedEmail`/`buildLayout`, pokud potřebuješ nový vizuální prvek.

- Selhání odeslání emailu **nikdy** nesmí shodit DB mutaci — `sendBrandedEmail` interně chytá chyby a vrací `false`, voláno bez `await` na výsledek pokud na něm nic nezávisí.
- Emaily se neodešlou, pokud chybí `GMAIL_USER`/`GMAIL_APP_PASSWORD` — v dev prostředí bez těchto proměnných appka funguje, jen nechodí maily.
- Trigger body: `notifyClientOfProjectChange` v `app/actions.ts` (vytvoření/update projektu → klient), `submitConsultation` v `app/portal-actions.ts` (rezervace → admin i klient).

---

## Bezpečnost

- **NextAuth JWT session** — dashboard chráněn `middleware.ts` (matcher `/dashboard/:path*`) + `getServerSession` v layoutu
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
