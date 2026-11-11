# AD11 — Zakázka jako jediná pravda: Dokončené a průvodka

## Cíl
Zakázka ve stavu hotovo/zaplaceno **je** dokončená. Konec kopie s vlastní cenou a konec rizika,
že se příjem započítá dvakrát. Detail zakázky dostane průvodku — osu, na které je vidět další krok.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → AD11
a `docs/FINANCE_SYSTEM_PLAN.md` → Zafixovaná rozhodnutí. Platí **R-090**.
Navazuje na AD09 (kontakty). Společná pravidla: `00-README.md`.

> **Sezení sahá na daňová čísla.** Nic nemigruj dřív, než si vytiskneš součty příjmů za 2026 a 2025.

## Co je dnes špatně (ověřeno v kódu)
- `completed_projects` je **plná kopie** zakázky (`title`, `client_name`, `amount`, `notes`)
  a žije vlastním životem — editace dokončeného nezmění zakázku a naopak.
- `createCompletedProject` (`app/completed-actions.ts:43–113`) umí založit záznam **bez zakázky**
  a vloží k němu příjem se `source_completed_project_id` — nezávisle na tom, jestli zakázka svůj
  příjem už má. **Odtud dvojí započtení.**
- `/dashboard/dokoncene` a `/dashboard/hodnoceni` čtou **týž dataset** (`getCompletedProjects()`
  + `getProjectSurveys()`, obojí bez `LIMIT`), liší se jen filtrem `project_type === 'client'`.
- `markProjectAsCompleted` nejde vzít zpět (žádná `unmark…`), jen smazat z Dokončených.

## Kroky

### 1. Součty před migrací
`SELECT date_trunc('year', date) AS rok, SUM(amount) FROM finance_transactions
WHERE type='income' AND user_id IS NULL GROUP BY 1 ORDER BY 1;`
Ulož výstup do plánu (sekce 11). **Stejný dotaz po migraci musí dát stejná čísla na korunu.**

### 2. Migrace 106
`migrations/106_zakazka_jedina_pravda.sql`, idempotentní:
- `projects.closed_at timestamptz`, `projects.project_type text` (`client` / `vlastni`).
- `project_surveys.project_id uuid REFERENCES projects(id)` + backfill přes
  `completed_projects.source_project_id`.
- Dokončené **se** `source_project_id` → doplnit `closed_at` (a `project_type`) do zakázky.
- Dokončené **bez** `source_project_id` (ručně doplněná historie) → **založit zakázku** ve stavu
  `paid`, aby se neztratil příjem ani hodnocení; navázat na ni transakci i dotazník.
- `completed_projects` **přejmenovat** na `completed_projects_archiv`. **Nemazat** — originál
  zůstává, dokud součty nesedí. Jeho `DROP` je samostatný krok až po AD18.

### 3. Kód
- `/dashboard/dokoncene` a `/dashboard/hodnoceni` pryč z menu; obsah je v zakázce a na kartě
  kontaktu (AD09). `PerformanceOverview` přesunout na Dnes.
- `app/completed-actions.ts`: `createCompletedProject` zaniká, `markProjectAsCompleted` se mění
  na „uzavřít zakázku" (nastaví `status`, `closed_at`, volitelně převede `estimated_costs`
  na náklad — ta část v `app/actions.ts:517–549` je v pořádku, jen ji přenes).
- Uzavření zakázky jde **vzít zpět** (`closed_at = NULL`), protože už se nikam nekopíruje.

### 4. Průvodka zakázky
Osa v detailu (`components/admin/project-detail-view.tsx`), nová záložka nebo pruh nad záložkami.
Nečte nic nového, jen skládá, co v DB je:

| Krok | Splněno, když |
|---|---|
| Poptávka | `source` z webu, nebo zakázka vznikla z leadu |
| Hovor | existuje lead nebo kalendářní událost se zakázkou |
| Nabídka | vyplněná `price` |
| Záloha | `deposit_paid` |
| Práce | `status = 'in_progress'` |
| Předáno | `status = 'review'` nebo vystavený předávací dokument (AD16) |
| Faktura | existuje vystavená faktura (AD12) |
| Zaplaceno | `paid_on` na faktuře nebo `projects.paid` |
| Hodnocení | existuje `project_surveys` |

Pod osou **jedno tlačítko na další krok**. Texty podle `zakaziq-ux-texty-cs`.

### 5. Změna stavu jedním klikem
`AGENTS-ADMIN.md:355` říká, že to nejde, protože `updateProject` pošle klientovi e-mail a „Zpět"
by ho poslal podruhé. Vyřeš to **odkladem**: e-mail klientovi jde přes `after()` s 60s prodlevou
a „Zpět" ho zruší (vzor R-050 z Workspace, ale bez fronty — `lib/ws/email/outbox.ts` je per účet).
Po opravě smaž ten řádek z `AGENTS-ADMIN.md`.

## Hotovo, když
- **Součet příjmů za 2026 a 2025 je po migraci na korunu stejný jako před ní.** Když ne, revert.
- Žádná cesta nevytvoří druhý příjem ke stejné zakázce (test).
- Detail zakázky ukazuje průvodku a další krok; uzavření jde vzít zpět.
- Změna stavu je jeden klik se „Zpět" a klient dostane **jeden** e-mail (test na `after()`).
- `npm test`, `tsc`, build zelené.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD11 v plánu, changelog (migrace 106, „aplikována: ne"),
R-090 ověřit. Commit `admin/zakazky: dokončené do zakázky, průvodka`.
