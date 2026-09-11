# ZakazIQ — Poznámky, Náklady, Šablony webu, Design skladač

## Kontext

Aplikace ZakazIQ dnes řeší admin-only "poznámky" u kontaktů v Hovorech (`client_leads.notes`) i u zakázek (`projects.notes`) jako jedno ploché textové pole bez historie a bez struktury — u Hovorů je navíc schované za rozkliknutím řádku. Uživatel při telefonátu s klientem potřebuje mít místo, kam si zapíše užitečný kontext a příště se v tom vyzná — dnešní řešení tenhle účel neplní.

Sekce "Náklady" (`/dashboard/naklady`) a finanční modul "Hub" (`/hub/finance`) sdílejí jednu DB tabulku `costs`, ale ta nemá žádnou vazbu (FK) na `projects` — jediné propojení je jednorázová, nepovinná konverze při označení zakázky jako dokončené, po které se náklad stane neadresovatelným string záznamem. V praxi se tak náklady u probíhajících zakázek do Hubu nikdy nepropíšou, což uživatel popsal jako "nedává to smysl".

Uživatel dále chce nástroj, ve kterém si pro každou zakázku zvlášť naplánuje strukturu webu — vybere sekce (hero, ceník, reference...), poskládá jejich pořadí a napíše k nim návrhy textů — jako přípravu před samotným vývojem klientského webu. Typy sekcí ale nechce mít předdefinované v kódu — chce si je sám vytvářet, mazat a přebarvovat, a přesně vědět, co má v knihovně k dispozici. Nad tím pak chce jednoduchý "skladač" s přetahováním karet myší (ne plnohodnotný Figma-style canvas s vrstvami a volným pozicováním — jen řazení a základní vizuální úpravy).

Průzkum kódu (viz "Critical Files" níže) potvrdil, že v repu už existuje ustálený vzor pro přesně tenhle typ potřeby — dedikovaná child-tabulka (`id`, `parent_id` FK `ON DELETE CASCADE`, typované sloupce, `created_at`) + `'use server'` akce + timeline/list komponenta — použitý už pro `progress_updates`, `client_messages`, `client_feedback`, `consultation_slots`. Žádné JSON blob sloupce se v repu nikde nepoužívají a nový kód by je neměl zavádět. Repo dnes nemá žádnou drag-and-drop knihovnu ani nainstalované shadcn/ui (přestože ho CLAUDE.md deklaruje) — všechny komponenty jsou ručně psaný Tailwind kód v `components/`.

Rozsah: všechny čtyři fáze jsou **jen pro VIZEON** (`/dashboard/...`), ne pro ALTENO — ALTENO má dnes záměrně jen jádro (bez kalendáře, Hovorů, Dokončených) a tahle rozšíření zapadají do stejné filozofie odděleného rozsahu.

Plán je rozdělený do 4 fází, aby šlo pracovat průběžně napříč více sessions. Fáze 1A, 1B, 2 a 3 na sobě nezávisí a lze je dělat v libovolném pořadí. Fáze 4 staví na datovém modelu z Fáze 3.

**Před zahájením KAŽDÉ fáze v nové session:** spustit `ls migrations | tail -5` pro zjištění skutečně posledního čísla migrace (čísla v tomto plánu jsou orientační) a `grep` na zmíněné funkce/soubory pro ověření, že se mezitím nezměnily.

---

## FÁZE 1A — Hovory (`client_leads`): poznámky s historií

**Cíl:** Nahradit jedno přepisovatelné pole `client_leads.notes` chronologickým logem zápisků (analogie `progress_updates`), viditelným přímo v hlavní tabulce (ne jen po rozkliknutí), plus rychlým formulářem pro zápis přímo z rozbaleného řádku.

**Mimo rozsah:** editace historických záznamů (jen přidat/smazat), @mentions, notifikace.

### DB migrace — `migrations/058_lead_notes.sql`
```sql
CREATE TABLE IF NOT EXISTS lead_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON lead_notes (lead_id, created_at DESC);

-- Backfill: existující notes se stanou prvním záznamem historie
INSERT INTO lead_notes (lead_id, content, created_at)
SELECT id, notes, COALESCE(updated_at, created_at)
FROM client_leads
WHERE notes IS NOT NULL AND btrim(notes) <> ''
  AND NOT EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = client_leads.id);
```

### Typy (`lib/types.ts`)
```ts
export interface LeadNote {
  id: string
  lead_id: string
  content: string
  created_at: string | Date
}
```

### Server actions (`app/calls-actions.ts`)
- `getAllLeadNotes()` — vrátí všechny `lead_notes` (`ORDER BY created_at DESC`), volané společně s `getLeads()` v `app/dashboard/calls/page.tsx` (žádné N+1 dotazy, stejný `Promise.all` vzor jako `app/dashboard/[id]/page.tsx:25-31`); grouping podle `lead_id` se dělá až v komponentě.
- `addLeadNote(leadId: string, content: string)` — INSERT, `revalidatePath('/dashboard/calls')`.
- `deleteLeadNote(id: string)` — smazání jednoho zápisu.

### Komponenty
- `app/dashboard/calls/page.tsx` — přidat `getAllLeadNotes()` vedle `getLeads()`, předat do `LeadsTable`.
- `components/LeadsTable.tsx` (1059 řádků, upravovat opatrně):
  - Do sbaleného řádku přidat ikonku `StickyNote` (už importovaná) s počtem poznámek + tooltip s posledním zápiskem.
  - `LeadDetailRow` (515-576) — nahradit statický odstavec timeline seznamem: vzor zkopírovat z `app/dashboard/[id]/page.tsx:111-137` (tečka + linka, timestamp, `whitespace-pre-wrap`), nad ním malý formulář "+ Poznámka" (textarea + tlačítko, `useTransition` + `sonner` toast).
  - `WaitingRow` (697-703) — truncated náhled ukazuje poslední záznam z `lead_notes` místo `notes`.
  - `LeadForm`/`WaitingLeadForm` — přejmenovat textarea `notes` na "Shrnutí (kontext leadu)", ať je jasné, že hlavní log žije jinde.

**Odhad:** M. **Ověření:** `npm run dev` → `/dashboard/calls` → rozkliknout lead → ověřit backfillovanou poznámku → přidat novou → refresh → ověřit perzistenci a pořadí i badge v hlavním řádku.

---

## FÁZE 1B — Zakázky (`projects`): admin-only poznámkové sekce

**Cíl:** Samostatný panel na `/dashboard/[id]`, oddělený od `ProjectForm`, kde si uživatel vytváří libovolný počet **vlastnoručně pojmenovaných** poznámkových sekcí (např. "Na co primárně cílit", "Poznámky z hovorů") s historií zápisů v čase — analogie "Historie postupu", ale obecnější a bez fixních názvů sekcí.

**Mimo rozsah:** sdílení s klientem, bohaté formátování textu, mazání/přejmenování celé sekce v MVP (lze doplnit později).

Stávající `projects.notes` sloupec zůstává beze změny (rychlé jednořádkové shrnutí v `ProjectForm`) — nový panel je doplněk, ne náhrada.

### DB migrace — `migrations/059_project_notes.sql`
```sql
CREATE TABLE IF NOT EXISTS project_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_notes_project_idx ON project_notes (project_id, section, created_at DESC);
```

### Typy (`lib/types.ts`)
```ts
export interface ProjectNote {
  id: string
  project_id: string
  section: string
  content: string
  created_at: string | Date
}
```

### Server actions — nový soubor `app/project-notes-actions.ts`
(samostatný soubor podle vzoru `app/calls-actions.ts` — `app/actions.ts` je už na 500+ řádků)
- `getProjectNotes(projectId: string): Promise<ProjectNote[]>` — `ORDER BY created_at DESC`.
- `addProjectNote(projectId: string, section: string, content: string)` — `requireAuth()`, Zod validace, INSERT, `revalidatePath`.
- `deleteProjectNote(id: string, projectId: string)`.

### Komponenty
- Nová `components/ProjectNotesPanel.tsx` (client component): grupuje `ProjectNote[]` podle `section` (client-side), každá sekce jako sbalitelná karta s timeline uvnitř (vzor `app/dashboard/[id]/page.tsx:111-137`). Nahoře "+ Přidat poznámku": `<select>` s existujícími sekcemi projektu + volba "+ Nová sekce" (po výběru text input na název), textarea na obsah.
- `app/dashboard/[id]/page.tsx` — přidat `sql` dotaz do `Promise.all` (25-31). Panel vložit **hned po hlavičce, před "Editace zakázky"** — je to přehled, co chce uživatel vidět jako první. Styl: stejný `bg-white border rounded-2xl p-6`, nadpis "Poznámky k zakázce", podtitulek "Jen pro tebe — klient je nikdy neuvidí."

**Odhad:** M. **Ověření:** `/dashboard/[id]` → přidat poznámky do 2-3 sekcí → ověřit řazení a perzistenci → smazat zakázku → ověřit CASCADE smazání `project_notes`.

---

## FÁZE 2 — Náklady/Hub: sjednocení do jednoho zdroje pravdy

**Cíl:** `costs` je datově sdílená tabulka, ale (a) kód `getCosts()` je duplicitně napsaný na dvou místech a (b) tabulka nemá `project_id`, takže náklady u probíhající zakázky se do Hubu nikdy nedostanou. `estimated_costs` na zakázce zůstává **čistě orientační odhad** (pro rychlou představu při zakládání zakázky) — **skutečné, počítané náklady se zadávají ručně přes nový panel u zakázky**, a to je zdroj pravdy pro Hub. Žádná skrytá automatika/live-sync mezi odhadem a skutečností.

**Mimo rozsah:** přepis `CostCategory` typu/sjednocení kategorií, změna `finance_transactions` schématu.

### DB migrace — `migrations/060_costs_project_link.sql`
```sql
ALTER TABLE costs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS costs_project_idx ON costs (project_id);
```
(`ON DELETE SET NULL`, ne `CASCADE` — smazání zakázky nesmí smazat historii nákladů, stejně jako `invoices.project_id`.)

### Typy (`lib/types.ts`)
`Cost` (dosud v `app/completed-actions.ts` jako součást payloadu) doplnit `project_id: string | null`.

### Server actions — konsolidace do nového souboru `app/costs-actions.ts`
Než se pustí implementace: `grep -rn "getCosts\|from '@/app/completed-actions'" app components` pro nalezení všech volajících míst.

- Přesunout `getCosts`, `createCost`, `updateCost`, `deleteCost`, `CostPayload` z `app/completed-actions.ts` do `app/costs-actions.ts`.
- Smazat duplicitní `getCosts` z `app/hub/finance/finance-actions.ts:393-410`, přesměrovat import v `app/hub/finance/page.tsx:12`.
- Přesměrovat import v `components/CostsManager.tsx:5`.
- Nová `getProjectCosts(projectId: string): Promise<Cost[]>` — vzor `getProjectInvoices` (`app/hub/finance/invoice-actions.ts:145`).
- `createCost`/`updateCost` — přidat `project_id` do INSERT/UPDATE (`null`, když náklad není vázaný na zakázku — zachovává zpětnou kompatibilitu s dnešním obecným použitím v `/dashboard/naklady` a Hub "Osobní").

### Oprava `markProjectAsCompleted` (`app/actions.ts:445-536`, konkrétně 515-533)
- Přidat `project_id: projectId` do auto-generovaného INSERTu.
- Před vytvořením souhrnného nákladu zkontrolovat `SELECT COUNT(*) FROM costs WHERE project_id = ${projectId}` — pokud už existují ručně zadané položky, auto-generování přeskočit (žádné duplicitní součty), v `MarkCompletedButton` zobrazit info "Zakázka už má evidované náklady, přeskakuji odhad."

### Komponenty
- Rozšířit `components/CostsManager.tsx` (426 řádků) o volitelný prop `projectId` — když je nastavený, komponenta použije `getProjectCosts` místo `getCosts` a předvyplní `project_id` při vytváření. Lepší než duplikovat UI do nové komponenty (menší riziko divergence).
- `app/dashboard/[id]/page.tsx` — nový panel "Náklady zakázky" vedle "Faktury zakázky": `<CostsManager projectId={project.id} />`.

**Odhad:** L (refaktor sdíleného kódu, víc rizika regrese ve 2 existujících UI). **Ověření:** přidat náklad z panelu na zakázce → ověřit shodu v `/dashboard/naklady` i `/hub/finance` → smazat odkudkoliv → zmizí všude → dokončit zakázku bez ručních nákladů → auto-generovaný náklad má `project_id` → dokončit zakázku s ručními náklady → žádný duplicitní souhrn.

---

## FÁZE 3 — Šablony webu: vlastní knihovna bloků + per-projekt výběr

**Cíl:** Uživatel si sám spravuje knihovnu typů bloků webu (přidává, přejmenovává, maže, barví — žádný pevný seznam v kódu) a pro každou zakázku zvlášť z ní vybírá, řadí a dopisuje texty. Cílová plocha: nová podstránka `/dashboard/[id]/sablona`. Klientský portál `/p/[token]` se v této fázi nemění.

**Architektura (katalog NENÍ v kódu):** Na rozdíl od typického repo-vzoru (kde konfigurace jako `lib/business.ts` žije v kódu), tady je katalog typů bloků sám o sobě uživatelská data, protože se má měnit za běhu bez zásahu do kódu. Řeší se druhou DB tabulkou:
- `block_templates` — uživatelova osobní, znovupoužitelná knihovna (název, popis, barva). Spravuje se přes vlastní CRUD UI.
- `project_blocks` — konkrétní použití bloku u konkrétní zakázky. Při přidání bloku ze šablony se hodnoty (název, barva) **zkopírují** do `project_blocks` (denormalizace), takže pozdější úprava bloku na jedné zakázce neovlivní knihovnu ani jiné zakázky, a smazání položky z knihovny nerozbije už použité bloky. Uživatel může blok u zakázky i vytvořit rovnou "od ruky" bez knihovny (šablona je pohodlnost, ne povinnost).

### DB migrace — `migrations/061_block_templates.sql`
```sql
CREATE TABLE IF NOT EXISTS block_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  color text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS block_templates_position_idx ON block_templates (position);
```

### DB migrace — `migrations/062_project_blocks.sql`
```sql
CREATE TABLE IF NOT EXISTS project_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_template_id uuid REFERENCES block_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  color text,
  content text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS project_blocks_project_idx ON project_blocks (project_id, position);
```
(`source_template_id` je jen informativní odkaz "odkud blok vznikl" — `ON DELETE SET NULL`, aby smazání šablony nikdy nesmazalo už použité bloky u zakázek.)

### Typy (`lib/types.ts`)
```ts
export interface BlockTemplate {
  id: string
  name: string
  description: string | null
  color: string | null
  position: number
  created_at: string | Date
  updated_at: string | Date | null
}

export interface ProjectBlock {
  id: string
  project_id: string
  source_template_id: string | null
  title: string
  color: string | null
  content: string | null
  position: number
  created_at: string | Date
  updated_at: string | Date | null
}
```

### Server actions — nový soubor `app/block-templates-actions.ts` (knihovna, globální)
- `getBlockTemplates()`, `createBlockTemplate({name, description, color})`, `updateBlockTemplate(id, data)`, `deleteBlockTemplate(id)` — `requireAuth()` na všech, `revalidatePath('/dashboard/sablony')`.

### Server actions — nový soubor `app/project-blocks-actions.ts` (per-projekt)
- `getProjectBlocks(projectId)` — `ORDER BY position ASC`.
- `addProjectBlockFromTemplate(projectId, templateId)` — načte šablonu, zkopíruje `name→title`, `color`, vloží s `position = MAX(position)+1`.
- `addCustomProjectBlock(projectId, title, color)` — přidání bloku bez šablony, rovnou "od ruky".
- `updateProjectBlock(id, data: {title?, color?, content?})` — částečný update (název, barva, text najednou).
- `reorderProjectBlocks(projectId, orderedIds: string[])` — smyčka `UPDATE ... SET position = ${i} WHERE id = ${orderedIds[i]} AND project_id = ${projectId}`.
- `removeProjectBlock(id, projectId)`.

### Komponenty/stránky
- Nová stránka `app/dashboard/sablony/page.tsx` — globální knihovna bloků (mimo konkrétní zakázku): grid karet `block_templates`, každá s inline editací názvu/popisu/barvy a tlačítkem smazat, formulář "+ Nová šablona bloku" nahoře. Přidat odkaz do hlavní navigace vedle "Kalendář"/"Hovory".
- Nová stránka `app/dashboard/[id]/sablona/page.tsx` — server component, `sql` dotaz na projekt + `getBlockTemplates()` + `getProjectBlocks(params.id)`. Layout `max-w-4xl`, header s odkazem zpět na `/dashboard/[id]`.
- `components/BlockLibraryPicker.tsx` — grid karet z `BlockTemplate[]`, tlačítko "+ Přidat na zakázku" volá `addProjectBlockFromTemplate`; plus samostatné tlačítko "+ Vlastní blok" (bez šablony) otevírající malý formulář název+barva.
- `components/ProjectBlockList.tsx` — seřazený seznam `project_blocks` dané zakázky: karta s inline editovatelným názvem, barevnou tečkou (klik otevře paletu barev — pevná sada ~8 odstínů, ne libovolný color picker), šipkami nahoru/dolů pro řazení (nahrazeno drag-and-dropem ve Fázi 4), textarea na `content` (autosave na blur), tlačítko smazat.
- `app/dashboard/[id]/page.tsx` — kompaktní odkazovací panel "Šablona webu" (počet bloků + link "Otevřít →" na `/dashboard/[id]/sablona`), umístit za "Vzkazy pro klienta".

**Odhad:** L (dvě nové tabulky, dvě nové stránky, knihovní CRUD i per-projektová logika). **Ověření:** `/dashboard/sablony` → vytvořit 3-4 vlastní typy bloků s barvami → smazat jeden → `/dashboard/[id]/sablona` → přidat bloky ze šablony i jeden vlastní ad-hoc → přeuspořádat šipkami → napsat texty → refresh a ověřit perzistenci → smazat šablonu v knihovně a ověřit, že už použité bloky na zakázce zůstanou beze změny (jen `source_template_id` spadne na `NULL`).

---

## FÁZE 4 — Design skladač: drag-and-drop řazení

**Cíl:** Nahradit šipky nahoru/dolů z Fáze 3 skutečným přetahováním karet myší/dotykem. Barvy a CRUD nad bloky jsou už hotové z Fáze 3 — tahle fáze je čistě o interakci řazení.

**Mimo rozsah:** cokoliv canvas/Figma-úrovně (volné pozicování, vrstvy, zoom/pan, přesná typografie) — bylo explicitně vyloučeno.

### Volba knihovny
Repo nemá žádnou DnD závislost. Doporučení: **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** — stavěné přesně na "seřaď karty v seznamu" (`SortableContext`/`useSortable`), ne obecné canvas API; nativní klávesnicová i dotyková podpora bez extra práce; malé (~10 kB), aktivně udržované. Nativní HTML5 DnD má slabou touch podporu; `react-beautiful-dnd` je neudržovaný; `react-flow`/`konva` jsou zbytečně těžké pro tento rozsah.

### Změny
- `package.json` — přidat `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- `components/ProjectBlockList.tsx` — refaktor na `'use client'` s `DndContext` + `SortableContext` (`items={blocks.map(b=>b.id)}`, `verticalListSortingStrategy`) + `useSortable` v každé kartě, `GripVertical` (z `lucide-react`, už závislost) jako úchyt. Drag-end zavolá **stejnou** `reorderProjectBlocks` akci z Fáze 3 beze změny tvaru parametrů. Šipky ponechat jako klávesnicově přístupnou alternativu vedle `@dnd-kit` keyboard senzoru.
- `PointerSensor` s `activationConstraint: { distance: 8 }`, aby krátký tap/scroll na mobilu neomylem nespustil drag.

**Odhad:** M (server-side logika reorderu je hotová z Fáze 3, tady jde hlavně o UI refaktor). **Ověření:** `/dashboard/[id]/sablona` s 4+ bloky → přetáhnout kartu myší → ověřit perzistovanou pozici po refreshi → otestovat klávesnicí (Tab na úchyt, mezerník zvednutí, šipky přesun, mezerník puštění) → otestovat na zúženém/touch emulovaném okně v devtools.

---

## Shrnutí

| Fáze | Obsah | Odhad | Závislost |
|---|---|---|---|
| 1A | Hovory — timeline poznámek | M | žádná |
| 1B | Zakázky — pojmenované poznámkové sekce | M | žádná |
| 2 | Náklady/Hub sjednocení (`costs.project_id` + dedup) | L | žádná |
| 3 | Šablony — vlastní knihovna bloků + per-projekt výběr/pořadí/texty/barvy | L | žádná |
| 4 | Design skladač — drag-and-drop řazení | M | Fáze 3 |

Fáze 1A, 1B, 2, 3 lze dělat v libovolném pořadí v samostatných sessions. Fáze 4 vyžaduje dokončenou Fázi 3.

## Critical Files
- `migrations/057_completed_project_estimate.sql` — poslední migrace, odtud navazovat číslováním (ověřit aktuální stav před každou fází)
- `lib/types.ts` — centrální typy: doplnit `LeadNote`, `ProjectNote`, `Cost.project_id`, `BlockTemplate`, `ProjectBlock`
- `app/dashboard/[id]/page.tsx` — hlavní integrační bod pro nové panely (1B, 2, 3), `Promise.all` vzor na řádcích 25-31, timeline vzor na řádcích 111-137
- `components/LeadsTable.tsx` — Fáze 1A, velký soubor (1059 řádků), upravovat opatrně
- `app/completed-actions.ts` a `app/hub/finance/finance-actions.ts` — Fáze 2, zdroj duplicitního `getCosts()` k deduplikaci
- `app/hub/finance/invoice-actions.ts` — vzor `getProjectInvoices` pro `getProjectCosts` (Fáze 2)
- `components/CostsManager.tsx` — Fáze 2, rozšířit o `projectId` prop
- `app/actions.ts:445-536` (`markProjectAsCompleted`) — Fáze 2, oprava auto-generování nákladu
