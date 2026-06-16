# ProjectIQ — Prompt pro Claude Code: Automatizace konzultací a komunikace s klienty

> Jednej jako senior full-stack inženýr a architektonický stratég. Cílem je finalizovat a zdokonalit systém pro automatizaci rezervací konzultací, klientského feedbacku a emailové komunikace v aplikaci ProjectIQ. Část kódu je již implementována — tvůj úkol je identifikovat mezery, doplnit je a zajistit plně funkční end-to-end tok.

---

## Kontext projektu

**ProjectIQ** je Next.js 14 (App Router) aplikace pro freelancery. Tech stack: TypeScript, Tailwind CSS, shadcn/ui, Neon (serverless PostgreSQL přes `@neondatabase/serverless`), NextAuth.js v4, Resend (emaily), Framer Motion (animace).

**Klíčová pravidla:**
- Výhradně App Router — složka `app/`, nikdy `pages/`
- DB dotazy přes `sql` tagged template z `lib/db.ts`
- Mutace jako Server Actions (`'use server'`) v `app/actions.ts` nebo `app/portal-actions.ts`
- Ikony Lucide React, `strokeWidth={1.5}` konzistentně
- Design: moderní, minimalistický, luxusní — brand barvy `brand-*` (viz Tailwind config), CSS třída `brand-gradient`
- `notes` pole projektu je interní — **nikdy ho neposílej klientovi**

---

## Co je JIŽ implementováno (nerebuilduj)

Následující soubory jsou kompletní a funkční — pouze je čti pro kontext, neupravuj pokud to není explicitně požadováno níže:

| Soubor | Co dělá |
|--------|---------|
| `lib/types.ts` | Typy `Project`, `ClientFeedback`, `ConsultationSlot`, `CHANNEL_LABELS` atd. |
| `lib/prague-time.ts` | Timezone utility (Prague/CET/CEST), slot generation, calendar helpers |
| `lib/feedback-schema.ts` | Zod schémata `feedbackSchema`, `bookingSchema` |
| `components/FeedbackBlock.tsx` | Klientský formulář — NPS 1–10 + text komentář |
| `components/NpsRating.tsx` | Interaktivní hodnocení 1–10 (tlačítka) |
| `components/BookingCTA.tsx` | CTA tlačítko "Konzultace o aktuálním stavu projektu" |
| `components/BookingModal.tsx` | Kompletní modální dialog: mini-kalendář + time sloty + kanál + přání |
| `components/FeedbackFeed.tsx` | Admin zobrazení všech NPS feedbacků projektu |
| `components/ConsultationCalendar.tsx` | Admin kalendář konzultací per-projekt s detail modalem |
| `app/p/[token]/page.tsx` | Klientský portál — zobrazuje FeedbackBlock + BookingCTA |
| `app/dashboard/[id]/page.tsx` | Admin detail zakázky — zobrazuje FeedbackFeed + ConsultationCalendar |
| `app/portal-actions.ts` | Server actions `submitFeedback`, `submitConsultation` (email admina přes Resend) |

---

## Co je NUTNÉ implementovat (tvůj úkol)

### KROK 1 — Databázové migrace (Neon SQL)

Spusť v Neon SQL Editoru (nebo přidej do skriptu) tyto migrace. **Nejdřív zkontroluj zda tabulky neexistují (`IF NOT EXISTS`).**

```sql
-- Tabulka klientských hodnocení (NPS + komentář)
CREATE TABLE IF NOT EXISTS client_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nps integer NOT NULL CHECK (nps >= 1 AND nps <= 10),
  content text,
  created_at timestamptz DEFAULT now()
);

-- Tabulka rezervovaných konzultačních termínů
CREATE TABLE IF NOT EXISTS consultation_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'teams', 'meet', 'phone')),
  client_wish text NOT NULL,
  meeting_link text,
  client_email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, scheduled_at)
);

-- Přidej email klienta do projektů (pro automatické potvrzení)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email text;
```

### KROK 2 — Přidat `client_email` do projektů

**Cíl:** Admin vyplní email klienta při vytváření/editaci projektu. Systém pak automaticky posílá klientovi potvrzovací email při rezervaci konzultace.

**Soubory k úpravě:**

**`lib/types.ts`** — přidej `client_email` do interface `Project`:
```typescript
client_email: string | null  // přidej za pole 'notes'
```

**`app/actions.ts`** — přidej `client_email` do `createProject` a `updateProject` server actions. Pole je volitelné (může být `null`). Přidej do Zod schema validace jako `z.string().email().optional().nullable()`.

**`components/ProjectForm.tsx`** — přidej input pole pro email klienta:
- Label: "E-mail klienta (pro automatické potvrzení)"
- Typ: `email`
- Placeholder: "klient@email.cz"
- Umísti ho za pole `client_name` (logická poloha — kontaktní údaje blízko sebe)
- Design musí být konzistentní s ostatními poli formuláře

### KROK 3 — Klientský email v `BookingModal`

**Cíl:** Při rezervaci konzultace klient uvede svůj email, aby mu mohlo přijít potvrzení.

**Soubor:** `components/BookingModal.tsx`

Přidej pole email do formuláře:
- Za textarea `clientWish`, před výběr kanálu
- Label: "Váš e-mail (pro potvrzení rezervace)"
- Type: `email`, required
- Placeholder: "vas@email.cz"

**Soubor:** `lib/feedback-schema.ts` — rozšiř `bookingSchema`:
```typescript
export const bookingSchema = z.object({
  clientWish: z.string().min(1).max(1000),
  scheduledAt: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Neplatný datum/čas' }),
  channel: z.enum(['whatsapp', 'teams', 'meet', 'phone']),
  clientEmail: z.string().email({ message: 'Neplatný e-mail' }),
})
export type BookingInput = z.infer<typeof bookingSchema>
```

### KROK 4 — Potvrzovací email KLIENTOVI v `portal-actions.ts`

**Soubor:** `app/portal-actions.ts`

Ve funkci `submitConsultation` po úspěšném INSERT do DB přidej odeslání emailu klientovi. Aktuálně chodí email jen adminovi — přidej druhý email klientovi.

**Email klientovi musí obsahovat:**

1. **Potvrzení rezervace** — "Vaše konzultace byla potvrzena"
2. **Datum a čas** — formátovaný česky (formát jako `neděle, 15. června 2025, 16:00`)
3. **Komunikační kanál** — název služby (WhatsApp / Microsoft Teams / Google Meet / Klasický hovor)
4. **Tlačítko / odkaz na schůzku** — podle kanálu:
   - WhatsApp: `https://wa.me/${process.env.ADMIN_PHONE}?text=Konzultace+${encodeURIComponent(formattedTime)}`
   - Google Meet: hodnota z `process.env.GOOGLE_MEET_LINK` (fallback: '#')
   - Teams: hodnota z `process.env.TEAMS_MEETING_LINK` (fallback: '#')
   - Telefon: `tel:${process.env.ADMIN_PHONE}`
5. **Přání klienta** — echo zpět co napsal (jako potvrzení)
6. **Zpráva:** "S vaší rezervací počítám a na konzultaci se důkladně připravuji."

**Design emailu:** Stejný luxusní branded HTML template jako existující admin email v `buildEmail()` — brand gradient header (`background: linear-gradient(135deg,#1b3868 0%,#23478b 100%)`), čisté white body, rounded cards.

**Env proměnné** pro `generateMeetingLink()` — uprav funkci aby používala:
```
ADMIN_PHONE=        # telefon pro WhatsApp a hovor (bez +, např. 420601234567)
GOOGLE_MEET_LINK=   # permanentní Google Meet link (např. https://meet.google.com/xxx-yyyy-zzz)
TEAMS_MEETING_LINK= # Teams meeting link
```

Ulož `client_email` do sloupce `consultation_slots.client_email` při INSERT.

**Odeslání emailu klientovi (po existujícím admin emailu):**
```typescript
// send to client
if (apiKey && parsed.data.clientEmail) {
  await resend.emails.send({
    from: 'ProjectIQ <noreply@projectiq.app>',
    to: parsed.data.clientEmail,
    subject: 'Potvrzení rezervace konzultace – ProjectIQ',
    html: buildClientEmail(formattedTime, channelLabel[...], parsed.data.clientWish, meetingLink),
  })
}
```

### KROK 5 — Globální kalendář konzultací na `/dashboard`

**Cíl:** Na hlavní stránce dashboardu (`/dashboard`) přidat přehled **všech** nadcházejících konzultací napříč všemi projekty — ne jen per-projekt.

**Soubor:** `app/dashboard/page.tsx`

Přidej SQL query (paralelně s existujícími queries):
```sql
SELECT 
  cs.id, cs.scheduled_at, cs.channel, cs.client_wish, cs.meeting_link,
  p.client_name, p.id as project_id
FROM consultation_slots cs
JOIN projects p ON cs.project_id = p.id
WHERE cs.scheduled_at > now()
ORDER BY cs.scheduled_at
LIMIT 20
```

**Nová komponenta:** `components/UpcomingConsultations.tsx`

Zobraz jako kompaktní list pod summary barem, nad kartami projektů. Design:
- Sekce title: "Nadcházející konzultace" + ikona `CalendarDays`
- Každá položka: brand-gradient ikona s časem `HH:00`, jméno klienta, datum+čas (česky), kanál badge, klik → `href="/dashboard/${project_id}"`
- Pokud žádné konzultace → nezobrazuj sekci vůbec (null render)
- Maximálně zobrazit 5 nejbližších, ostatní skrýt za "Zobrazit vše" (toggle state)

### KROK 6 — `.env.local` dokumentace

Přidej do projektu soubor `.env.example` (ne `.env.local`!) s dokumentací nových proměnných:

```env
# Resend — emailová brána
RESEND_API_KEY=re_...

# Kontakt admin
ADMIN_PHONE=420601234567        # Pro WhatsApp a hovorové konzultace (bez mezery, bez +)

# Meeting linky (vyplň pevné linky pro Teams/Meet místnosti)
GOOGLE_MEET_LINK=https://meet.google.com/xxx-yyyy-zzz
TEAMS_MEETING_LINK=https://teams.microsoft.com/l/meetup-join/...
```

---

## Pravidla kvality (dodržuj přísně)

1. **TypeScript strict** — žádné `any`, žádné ignorované chyby
2. **Server/Client boundary** — DB volání pouze v Server Components nebo Server Actions; `'use client'` jen tam kde je stav nebo event handlers
3. **Email odeslání nesmí shodit booking** — wrap do `try/catch`, loguj chybu do konzole, ale vrať `{ success: true }` pokud se DB INSERT povedl
4. **Lucide ikony** — vždy `strokeWidth={1.5}`, velikost dle kontextu (13–18px v UI)
5. **Žádné komentáře vysvětlující WHAT** — jen WHY pokud je to neočekávané chování
6. **Mobilní first** — vše musí fungovat na telefonu (freelancer aktualizuje v terénu)
7. **Toast notifikace** — pokud projekt používá toast systém, přidej success/error toasty tam kde dávají smysl
8. **Neporušuj existující funkčnost** — před každou úpravou přečti celý dotčený soubor

---

## Pořadí implementace (doporučené)

1. Spusť SQL migrace → ověř v Neon že tabulky existují
2. Uprav `lib/types.ts` → přidej `client_email`
3. Uprav `lib/feedback-schema.ts` → přidej `clientEmail` do `bookingSchema`
4. Uprav `app/actions.ts` → přidej `client_email` do create/update
5. Uprav `components/ProjectForm.tsx` → přidej email pole
6. Uprav `components/BookingModal.tsx` → přidej email pole do formuláře
7. Uprav `app/portal-actions.ts` → uprav `generateMeetingLink`, přidej client email do INSERT, přidej `buildClientEmail`, pošli email klientovi
8. Přidej `components/UpcomingConsultations.tsx`
9. Uprav `app/dashboard/page.tsx` → přidej query a render UpcomingConsultations
10. Vytvoř `.env.example`
11. Spusť `npm run build` → oprav všechny TypeScript chyby
12. Otestuj: vyplň projekt s emailem → otevři klientský portál → odešli feedback → rezervuj konzultaci → zkontroluj zda email přišel → zkontroluj dashboard kalendář

---

## Finální kontrolní seznam

- [ ] Tabulky `client_feedback` a `consultation_slots` existují v Neon
- [ ] Sloupec `client_email` existuje v tabulce `projects`
- [ ] `ProjectForm` obsahuje pole pro email klienta
- [ ] `BookingModal` obsahuje pole pro email klienta
- [ ] Po odeslání rezervace přijde email KLIENTOVI s meeting linkem
- [ ] Po odeslání rezervace přijde email ADMINOVI (existující funkce)
- [ ] `/dashboard` zobrazuje sekci "Nadcházející konzultace"
- [ ] `/dashboard/[id]` zobrazuje FeedbackFeed a ConsultationCalendar (již hotovo)
- [ ] Klientský portál `/p/[token]` zobrazuje FeedbackBlock a BookingCTA (již hotovo)
- [ ] `npm run build` bez chyb
- [ ] `.env.example` dokumentuje všechny nové proměnné
