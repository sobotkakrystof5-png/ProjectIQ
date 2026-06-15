#ZakazIQ — CLAUDE.md (MVP)

> Kontext pro Claude Code — **ČÁST 1: MVP**. Zahrnuje pouze přehled zakázek a klientský portál.

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
| Styling | Tailwind CSS + shadcn/ui | Rychlé, profesionální komponenty |
| Ikony | Lucide React | Konzistentní `strokeWidth={1.5}` napříč celou app |
| Databáze | Neon (serverless PostgreSQL) | `@neondatabase/serverless`, připojení přes `DATABASE_URL` |
| Auth | NextAuth.js v4 + Credentials | Jediný admin účet v env proměnných, JWT session |
| Deployment | Vercel | Zero-ops, napojení na GitHub |

### Env proměnné

```env
DATABASE_URL=             # Neon connection string (pooled)
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=             # http://localhost:3000 (dev) / https://... (prod)
ADMIN_EMAIL=              # e-mail pro přihlášení
ADMIN_PASSWORD_HASH=      # bcrypt hash hesla (generuj: node -e "require('bcryptjs').hash('heslo',12).then(console.log)")
```

---

## Databázový model

### SQL — spusť v Neon SQL Editoru

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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE client_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE progress_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_from integer NOT NULL,
  progress_to integer NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Popis polí — `projects`

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
| public_token | uuid | gen_random_uuid() | Token pro klientský portál |
| deadline | date | — | Termín dokončení |
| notes | text | — | Interní poznámky — klient **NEVIDÍ** |
| created_at | timestamptz | now() | Datum vytvoření |
| updated_at | timestamptz | — | Datum poslední úpravy (nastavuje server action) |

### Popis polí — `client_messages`

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| content | text | Text vzkazu — klient vidí |
| created_at | timestamptz | Datum přidání |

### Popis polí — `progress_updates`

| Pole | Typ | Popis |
|------|-----|-------|
| id | uuid | Primární klíč |
| project_id | uuid | FK → projects.id (CASCADE DELETE) |
| progress_from | integer | Progress před změnou |
| progress_to | integer | Progress po změně |
| description | text | Popis co se udělalo |
| created_at | timestamptz | Datum záznamu |

---

## Struktura aplikace

```
app/
├── (auth)/
│   └── login/page.tsx           ← Přihlášení (NextAuth credentials)
├── api/auth/[...nextauth]/
│   └── route.ts                 ← NextAuth handler
├── actions.ts                   ← Server Actions: createProject, updateProject, deleteProject
├── providers.tsx                ← SessionProvider wrapper (client)
├── dashboard/
│   ├── layout.tsx               ← Ochrana routy (getServerSession)
│   ├── page.tsx                 ← Přehled zakázek
│   ├── new/page.tsx             ← Nová zakázka
│   └── [id]/page.tsx           ← Detail + editace zakázky
├── p/
│   └── [token]/page.tsx        ← Klientský portál (public, bez auth)
├── layout.tsx
└── globals.css

components/
├── ui/                          ← shadcn/ui komponenty
├── ProjectCard.tsx              ← Karta zakázky v dashboardu
├── ProjectForm.tsx              ← Formulář (volá server actions)
├── StatusBadge.tsx              ← Barevný badge stavu
├── ProgressBar.tsx              ← Vizuální progress bar
└── ShareButton.tsx              ← Kopírování klientského linku

lib/
├── db.ts                        ← Neon klient: sql tagged template
├── auth.ts                      ← NextAuth authOptions
├── utils.ts
└── types.ts
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
- Formulář: client_name, description, focus, status, progress, price, paid, deadline, notes
- Po uložení redirect na `/dashboard`

### `/dashboard/[id]`
- Editace všech polí zakázky
- Tlačítko **Kopírovat klientský link** — zkopíruje `/p/[public_token]` do schránky + toast potvrzení
- QR kód pro sdílení
- Tlačítko smazat zakázku

### `/p/[token]` — Klientský portál (PUBLIC)
- **Bez přihlášení, bez registrace**
- Klient vidí: název projektu, jméno freelancera, popis, focus, vizuální progress bar, status badge, deadline, datum poslední aktualizace
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

```typescript
// lib/types.ts

export type ProjectStatus = 'new' | 'in_progress' | 'review' | 'done' | 'paid';

export interface Project {
  id: string;
  client_name: string;
  description: string | null;
  focus: string | null;
  status: ProjectStatus;
  progress: number;
  price: number | null;
  paid: boolean;
  public_token: string;
  deadline: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
}

export type ProjectInsert = Omit<Project, 'id' | 'public_token' | 'user_id' | 'created_at'>;
export type ProjectUpdate = Partial<ProjectInsert>;
```

---

## Bezpečnost

- **NextAuth JWT session** — dashboard chráněn middleware + `getServerSession` v layout
- **Public token** — UUID v4 generovaný databází (`gen_random_uuid()`), nelze uhádnout
- **HTTPS** — Vercel automaticky
- **Heslo uloženo jako bcrypt hash** v env proměnné `ADMIN_PASSWORD_HASH`

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

## TypeScript typy

```typescript
// lib/types.ts

export type ProjectStatus = 'new' | 'in_progress' | 'review' | 'done' | 'paid';

export interface Project {
  id: string;
  client_name: string;
  description: string | null;
  focus: string | null;
  status: ProjectStatus;
  progress: number;
  price: number | null;
  paid: boolean;
  public_token: string;
  deadline: string | null;
  notes: string | null;
  created_at: string;
}
```

---

## Poznámky pro AI

- Vždy **App Router** — složka `app/`, nikdy `pages/`
- DB dotazy přes `sql` tag z `lib/db.ts` — pouze v server components nebo server actions
- Mutace (create/update/delete) jsou v `app/actions.ts` jako Server Actions (`'use server'`)
- `notes` je výhradně pro admina — **nikdy ho neposílej na `/p/[token]`**
- `public_token` se generuje v databázi — **nikdy ho negeneruj na frontendu**
- Auth check v server komponentě: `getServerSession(authOptions)` z `next-auth`
- Výchozí chování na portálu: cena je **skrytá** (volitelné zapnutí)