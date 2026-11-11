# AD02 — Jeden byznys, tři zdroje poptávek

## Cíl
Alteno přestává být druhá firma a stává se **zdrojem poptávky**. Web alteno.cz funguje dál beze
změny, přidává se prvotka.cz. Dva inboxy se slučují do jednoho.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → AD02,
`docs/admin/AGENTS-ADMIN.md`, a **R-088** (toto rozhodnutí mění R-008 „dva byznysy nad jedním
datovým modelem"). Společná pravidla: `00-README.md`. Navazuje na AD01.

> **Nejcitlivější sezení celého plánu zvenku:** `alteno.cz` a `vizeon.cz` jsou **cizí repozitáře**,
> které volají veřejná API. Payload, klíče ani adresy endpointů se nesmí změnit.

## Kroky

### 1. Migrace 102 — `business` se přejmenuje, nezahazuje
`migrations/102_jeden_inbox_poptavek.sql`, idempotentní, **expand** (nic se nemaže):
- `business` → **`lead_origin`** v `projects`, `calendar_events`, `agent_leads` (+ přejmenovat
  indexy `idx_projects_business`, `idx_calendar_events_business`).
  **Proč nezahodit:** ruční zakázka založená v `/alteno` má `source='manual'` a informace „přišel
  přes Alteno" je **výhradně** v `business`. Zahodit sloupec = ztratit historii u ručních zakázek.
  **Proč přejmenovat:** jméno `business` by lhalo a TypeScript s grepem tě donutí projít všechna
  čtecí místa — to je nejspolehlivější obrana proti mrtvému kódu.
- `CHECK (lead_origin IN ('vizeon','alteno','prvotka','jiny'))` a rozšířený `CHECK` na `source`
  o `'prvotka_web'`. Dej je **`NOT VALID`** a `VALIDATE` až po kontrole, ať migrace nespadne
  na historické hodnotě, o které nevíš. Nejdřív si vypiš `SELECT DISTINCT source, lead_origin`.
- Při té příležitosti: `projects.status` dodnes **nemá žádný CHECK**. Doplň
  `CHECK (status IN ('new','in_progress','review','done','paid'))`, taky `NOT VALID`.
- `lead_confirmed boolean` + `lead_confirmed_at` místo dvojice `vizeon_confirmed`/`alteno_confirmed`.
  Backfill **musí běžet dřív** než případný trigger, jinak si trigger vymyslí `lead_confirmed_at = now()`
  u historie, kde datum neznáme — tam nech NULL.
- Místo funkcí `is_vizeon_pending()` / `is_alteno_pending()` **generovaný sloupec**
  `lead_pending GENERATED ALWAYS AS (source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed) STORED`
  + částečný index. Každý dotaz pak píše jen `WHERE lead_pending`.
  **Do generovaného sloupce se nikdy nezapisuje** — projdi všechny `INSERT INTO projects`
  (`lib/web-booking.ts`, `app/api/public/alteno-leads/route.ts`, `app/actions.ts`) a ověř,
  že ho neuvádějí, jinak Postgres zápis odmítne.
- Staré sloupce i funkce **nech být** — starý i nový kód tak běží souběžně a revert nic nerozbije.
  Jejich `DROP` je samostatná migrace až po týdnu provozu.

### 2. Jeden seznam zdrojů místo `lib/business.ts`
Nový **`lib/lead-origins.ts`**: `label`, `domain`, `source`, `defaultServiceType`, klíč API a vlastní
okno rate limitu — pro `vizeon`, `alteno`, `prvotka`. Zanikají `basePath`, `inboxPath`, `projectPath`,
`toBusiness`; `adminEmailFor` se scvrkne na jednu adresu.
Přidání estetik.cz musí být **jeden řádek**, ne nová routa.

### 3. Jeden inbox
- `/dashboard/vizeon` a `/alteno/rezervace` → **`/dashboard/poptavky`** s filtrem podle zdroje.
- `lib/admin-counts.ts`: dva počty → jeden. `lib/admin-nav.ts`: jedna položka místo dvou.
- Sekce `app/alteno/**` (5 souborů) zaniká. **Trvalé přesměrování `/alteno/:path*` → `/dashboard/:path*`**
  v `next.config.mjs` — uložené odkazy v `notifications.link` a ve starých e-mailech musí fungovat.

### 4. Smazat obcházení, které přestalo být potřeba
Sedm míst s natvrdo zapsaným `business: 'vizeon'`, protože některé tabulky ten sloupec neměly:
`app/actions.ts:511`, `app/portal-actions.ts:268,279`, `app/calls-actions.ts:184,209,227`,
`app/api/cron/send-reminders/route.ts:146`.

Staré ALTENO zakázky tím **získají fakturaci, dokončení i poznámky schůzek** — dnes je nemají kvůli
pěti podmínkám `business === 'vizeon'` v `components/admin/project-detail-view.tsx:50–53, 81, 196,
340, 414` a dvěma v `components/ProjectForm.tsx:478, 554`.

### 5. Prvotka.cz
Zobecni `lib/web-booking.ts` na `leadHandler(origin)` a přidej `/api/public/prvotka-leads`
s **vlastním** `PRVOTKA_LEAD_WEBHOOK_SECRET` (ne sdíleným — stejný důvod, jaký je v komentáři
u alteno-leads). Payload navrhni podle `types/alteno-lead.ts`. Zapiš env do `.env.example`
a připomeň Kryštofovi Vercel. **Napojení webu Prvotky je práce v cizím repu, ne tady.**

## Na co si dát pozor
1. `types/alteno-lead.ts:8` vyžaduje `section: z.literal('alteno')`, `types/booking.ts:22`
   `source: z.literal('alteno_web')`. **Schéma musí zůstat kompatibilní** — endpoint jen uloží
   jiný `lead_origin`. Jinak přestane fungovat formulář na alteno.cz.
2. `ALTENO_API_KEY` a `ALTENO_LEAD_WEBHOOK_SECRET` zůstávají v platnosti.
3. Rate limit musí zůstat **per zdroj** (`lib/api-rate-limit.ts`), jinak si tři weby berou limit navzájem.
4. Kalendář a Hovory dnes ALTENO filtrují pryč (`app/dashboard/calendar/page.tsx:22,29,35`,
   `app/calendar-actions.ts:31`). Po sloučení se tam historické záznamy objeví — je to správně,
   ale řekni to Kryštofovi dopředu.
5. Typ oznámení `alteno_booking` nech v `lib/notifications.ts` kvůli starým řádkům; nové se nezakládají.
6. ALTENO poptávky začnou chodit z `info@vizeon.cz` — ověř, že `VIZEON_GMAIL_APP_PASSWORD` je nastavené.

## Hotovo, když
- Zkušební poptávka z **každého ze tří zdrojů** dorazí do jednoho inboxu se správným štítkem.
- Stará ALTENO zakázka má záložku Fakturace; `/alteno/rezervace` přesměruje; odkaz ze starého
  oznámení funguje.
- `git grep "'alteno'" ` v adminu vrací jen `lib/lead-origins.ts`, veřejná API a `types/`.
- `npm test`, `tsc`, build zelené; migrace 102 vyzkoušená na testovací DB.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD02 v plánu, changelog, R-088 ověřit v paměti.
Commit `admin/byznys: jeden inbox poptávek ze tří webů`.
