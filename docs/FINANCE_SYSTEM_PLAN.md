# ZakazIQ — Finanční systém, fakturace a daně

> Realizační plán rozdělený do fází. Každá fáze je samostatně dokončitelná a nasaditelná — dá se na tom pracovat napříč více sessions, aniž by zůstal rozbitý mezistav.

**Stav dokumentu:** Fáze 0–8 hotové — celý plán je hotový.
**Poslední aktualizace:** 2026-09-11

---

## Jak s tímto dokumentem pracovat

1. Na začátku session si přečti **Zafixovaná rozhodnutí** — ta už jsou dohodnutá, neotvírej je znovu.
2. Najdi první fázi, která není odškrtnutá, a dělej jen ji.
3. Po dokončení fáze odškrtni její kroky, doplň datum a napiš do changelogu na konci, co reálně vzniklo.
4. Fáze 0, 7 a 8 jsou **nezávislé** na zbytku — dají se udělat kdykoli, i mimo pořadí.

---

## Zafixovaná rozhodnutí

Tohle vzešlo z úvodní analýzy. Neptej se na to znovu.

| Téma | Rozhodnutí |
|------|-----------|
| Plátcovství DPH | **Není plátce DPH.** Žádné DPH na výstupu, žádné přiznání k DPH. Systém jen hlídá limit 2 mil. Kč. |
| Význam „dvou linií" | **Přiznané** (fakturováno na IČO, jde do daňového přiznání) vs. **nepřiznané** příjmy. Nemá to nic společného s DPH. |
| Režim OSVČ | **Vedlejší činnost — student.** Bez minimálních záloh, sociální až po překročení rozhodné částky. |
| Výdaje | **60% výdajový paušál** (živnost volná). Skutečné náklady se neuplatňují. |
| Kdy vzniká zdanitelný příjem | **Až při zaplacení** (`paid_on`), ne při vystavení faktury. Daňová evidence = hotovostní princip. Záloha je příjem ve chvíli, kdy dorazí. |
| Kde finance žijí | **`/hub/finance`**, rozšířené o záložky `Osobní` / `Podnikání`. Nezakládat novou sekci v dashboardu. |
| Úložiště PDF | **Přímo v Neonu** jako `bytea`. Žádný Vercel Blob, žádné S3. |
| Archiv faktur | **Podsekce pod přiznanou linií**, ne samostatná stránka. |
| Přepis faktur | **AI čte PDF a předvyplní**, uživatel potvrdí. Ruční vyplnění musí fungovat i bez AI. |
| n8n | **Teď ne.** Postavit `/api/public/invoices` s API klíčem, aby šlo n8n přivěsit později. |
| Nahrávání faktur | Nová zakázka · detail existující zakázky · přímo ve Financích (faktura bez zakázky). |
| Novinky o legislativě | **RSS z oficiálních zdrojů zdarma**, žádné AI tokeny. |
| Dokončené zakázky | Zůstávají jako **výkonnost podnikání** (hodiny, náročnost, sazba, spokojenost). Peníze a daně se přesouvají do Financí. |
| Historická data | **Nechat být.** Rozdíl 31 000 vs 48 700 Kč není chyba — viz Diagnostika níže. |
| ALTENO | Mimo rozsah. Datový model to ale nesmí zablokovat. |

---

## Daňové parametry 2026

Všechno patří do jednoho souboru `lib/tax-constants.ts` s odkazy na zdroj — nikdy nezadrátovat do komponenty.

| Parametr | Hodnota 2026 | Zdroj |
|----------|-------------|-------|
| Výdajový paušál (živnost volná) | 60 % | zákon o daních z příjmů |
| Strop příjmů pro paušál | 2 000 000 Kč (paušál max 1 200 000 Kč) | — |
| Sazba daně — 1. pásmo | 15 % | — |
| Sazba daně — 2. pásmo | 23 % nad daňový základ 1 762 812 Kč | — |
| Sleva na poplatníka | 30 840 Kč / rok | — |
| Sociální — sazba | 29,2 % z vyměřovacího základu | ČSSZ |
| Sociální — vyměřovací základ | **55 %** daňového základu | ČSSZ |
| Sociální — rozhodná částka (vedlejší) | **117 521 Kč** daňového základu | [ČSSZ 2026](https://www.cssz.gov.cz/-/prehled-nejdulezitejsich-udaju-pro-socialni-zabezpeceni-v-roce-2026) |
| Sociální — min. záloha (vedlejší) | 1 574 Kč / měsíc | ČSSZ |
| Zdravotní — sazba | 13,5 % z vyměřovacího základu | VZP |
| Zdravotní — vyměřovací základ | **50 %** daňového základu | [VZP](https://www.vzp.cz/platci/informace/stat/vymerovaci-zaklad-a-vypocet-pojistneho) |
| Průměrná mzda 2026 | 48 967 Kč | ČSSZ |
| Limit pro povinnou registraci k DPH | 2 000 000 Kč / 12 měsíců | — |

> ⚠️ **Pozor na rozpor ve zdrojích.** Blog SuperFaktury uvádí vyměřovací základ 55 % pro sociální *i* zdravotní. VZP jako plátce uvádí u zdravotního **50 %**. Plán počítá s oficiálním čtením: **sociální 55 %, zdravotní 50 %.** Konstanty jsou proto editovatelné a v UI bude u kalkulačky uvedeno, ze kterých sazeb počítá.

### Odvozené hranice (zobrazit uživateli v hlídači limitů)

Pro vedlejší činnost / studenta, 60% paušál, daňový základ = 40 % příjmů:

| Hranice | Příjem za rok | Co se stane při překročení |
|---------|--------------|---------------------------|
| Sociální pojištění | **293 802 Kč** | Vzniká povinnost platit sociální (ZD > 117 521 Kč) |
| Daň z příjmu | **514 000 Kč** | Sleva na poplatníka přestane pokrýt daň, začínáš reálně platit |
| Paušál + DPH | **2 000 000 Kč** | Konec paušálu, povinná registrace k DPH |

### Výpočetní postup

```
P   = přiznané příjmy (declared = true, podle paid_on, za daný rok)
V   = min(0.60 × P, 1_200_000)
ZD  = P − V                                    // daňový základ
daň = 0.15 × min(ZD, 1_762_812) + 0.23 × max(0, ZD − 1_762_812)
daň_po_slevě = max(0, daň − 30_840)

sociální = ZD <= 117_521 ? 0 : 0.292 × (0.55 × ZD)
zdravotní = 0.135 × (0.50 × ZD)                // student: bez minima, bez záloh

odvody_celkem = daň_po_slevě + sociální + zdravotní
čistý = P − odvody_celkem
```

---

## Datový model

### Migrace 053 — `invoices`

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_name text,
  client_ico text,
  client_dic text,
  issued_on date NOT NULL,
  due_on date,
  paid_on date,                       -- NULL = pohledávka; vyplněno = zdanitelný příjem
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'CZK',
  note text,
  pdf_data bytea,
  pdf_filename text,
  pdf_size integer,
  ai_extracted jsonb,                 -- co vytáhla AI, pro dohledatelnost
  finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_key ON invoices (invoice_number);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices (project_id);
CREATE INDEX IF NOT EXISTS invoices_paid_on_idx ON invoices (paid_on);
```

### Migrace 054 — dvě linie příjmů

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS invoiced_on_ico boolean NOT NULL DEFAULT false;

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS declared boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS finance_transactions_declared_idx
  ON finance_transactions (declared, date) WHERE type = 'income';
```

**Proč příznak na transakci, a ne na faktuře:** do nepřiznané linie musí spadnout i zakázka, na kterou nikdy nebyla vystavena faktura. Kdyby linie visela na existenci faktury, nepřiznané příjmy by se nedaly evidovat vůbec.

**Default `false` je záměr** — historická data se nesmí sama označit za přiznaná. Uživatel si je označí ručně, nebo zůstanou v nepřiznané linii.

### Migrace 055 — novinky z legislativy

```sql
CREATE TABLE IF NOT EXISTS tax_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,               -- 'financni_sprava' | 'cssz'
  guid text NOT NULL,                 -- identifikátor z RSS, pro idempotenci
  title text NOT NULL,
  link text NOT NULL,
  published_at timestamptz,
  summary text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_news_guid_key ON tax_news (source, guid);
CREATE INDEX IF NOT EXISTS tax_news_published_idx ON tax_news (published_at DESC);
```

### Migrace 056 — vlastnictví příjmu založeného fakturou

```sql
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_invoice_idx
  ON finance_transactions (source_invoice_id);
```

Vznikla ve Fázi 4, v původním návrhu nebyla. Bez ní nejde rozlišit transakci, kterou **založila faktura** (zrušení `paid_on` ji má smazat), od transakce, kterou faktura jen **převzala od zakázky** (tu smazat nesmí). Detail viz Fáze 4.

---

## FÁZE 0 — Rychlé opravy `[nezávislá]`

**Cíl:** Srovnat zjevně špatná čísla dřív, než se na ně naváže cokoli dalšího.

- [x] `components/EarningsCalculator.tsx:87` — počet zakázek počítá i osobní projekty. Filtrovat na `project_type === 'client'`, stejně jako už dělají všechny ostatní metriky v té komponentě.
- [x] Projít zbytek `EarningsCalculator` a sjednotit sémantiku `amount` vs `deposit_amount` (viz Diagnostika — dnes si řádek 50 a řádek 115 odporují).
- [x] Ověřit, že po opravě sedí počet zakázek se skutečností — ověřeno dotazem do produkční DB (3 řádky `project_type = 'client'`). **Klik v UI zbývá na uživatele**, přihlášení do dashboardu nejde z konzole (heslo je jen jako bcrypt hash).

**Hotovo když:** Dokončené ukazují 3 klientské zakázky, ne 5. ✅ **Dokončeno 2026-09-11**

> **Jak zní sjednocená sémantika:** `amount` je celá částka zakázky **včetně** zálohy, `deposit_amount` říká, kolik z ní už dorazilo jako záloha. Doplatek = `amount − deposit_amount`. Stejně to čte ledger (`createCompletedProject` zakládá příjmovou transakci na `amount`) i `projects.price` (`app/actions.ts` počítá zbytek jako `price − deposit`). Špatný byl řádek 50, ne řádek 115.
>
> Dvojí započtení zálohy zatím nikde neprosáklo do čísel — všech 5 řádků `completed_projects` má `deposit_amount = NULL`. Součty (31 000 Kč klientské, 48 700 Kč ledger) se opravou nezměnily, jen se přestane rozcházet, až se záloha poprvé vyplní.

---

## FÁZE 1 — Databáze a konstanty

**Cíl:** Položit schéma a daňové parametry. Žádné UI.

- [x] `migrations/053_invoices.sql` — viz Datový model
- [x] `migrations/054_declared_income.sql` — viz Datový model
- [x] `migrations/055_tax_news.sql` — viz Datový model
- [x] Migrace spustit proti Neonu a ověřit, že jsou idempotentní (druhý běh nesmí spadnout)
- [x] `lib/tax-constants.ts` — všechny sazby z tabulky výše, s odkazy na zdroj v komentáři a s explicitním `TAX_YEAR = 2026`
- [x] `lib/types.ts` — typy `Invoice`, `TaxNews`, rozšířit `Project` o `invoiced_on_ico`

**Hotovo když:** `npm run build` prochází, tabulky existují, aplikace se chová jako dřív. ✅ **Dokončeno 2026-09-11**

> Migrace se spouští přes `node scripts/apply-migration.js 053_invoices.sql …` (nový obecný běhoun, `--dry` vypíše příkazy bez provedení). Nahrazuje jednorázové `apply-*.js` skripty.
>
> `INCOME_THRESHOLD_SOCIAL` a `INCOME_THRESHOLD_TAX` se v `tax-constants.ts` **dopočítávají ze sazeb**, neopisují se z tabulky — po změně sazby se hranice srovnají samy. Ověřeno, že vychází 293 802 a 514 000 Kč.
>
> `FinanceTransaction` v `app/hub/finance/finance-actions.ts` sloupec `declared` zatím nezná — dotazy ho nevybírají, patří to k Fázi 3.

---

## FÁZE 2 — Daňová logika a kalkulačka

**Cíl:** Spočítat daně. Zatím nad existujícími daty, bez faktur.

- [x] `lib/tax.ts` — čistá funkce `calculateTax({ income, regime, year })` podle postupu výše. Žádné DB dotazy, žádný React — jen matematika.
- [x] `lib/__tests__/tax.test.ts` — testy na hraniční hodnoty: 0 Kč, těsně pod a nad 293 802 Kč (sociální), těsně pod a nad 514 000 Kč (daň), nad 2 mil. (strop paušálu), nad 1 762 812 Kč ZD (druhé pásmo). Projekt už používá vitest.
- [x] `components/TaxCalculator.tsx` — vstup: příjem (předvyplněný z ledgeru, ručně přepsatelný), režim, rok. Výstup: daňový základ, daň před/po slevě, sociální, zdravotní, odvody celkem, čistý zisk, efektivní zdanění v %, doporučená měsíční rezerva.
- [x] `components/TaxLimitWatch.tsx` — hlídač limitů: tři ukazatele podle tabulky odvozených hranic, s informací „do hranice ti zbývá X Kč".
- [x] Pod kalkulačkou uvést, z jakých sazeb a kterého roku počítá (`TAX_BASIS_NOTE`).

**Hotovo když:** Kalkulačka na papírovém příkladu (např. 300 000 Kč příjmů) vrátí ověřitelně správná čísla a testy procházejí. ✅ **Dokončeno 2026-09-11**

> **Papírový příklad 300 000 Kč** (pokrytý testem): paušál 180 000 → základ 120 000 → daň 18 000, sleva ji celou pokryje → 0. Sociální 19 272 (základ nad rozhodnou částkou), zdravotní 8 100. Odvody 27 372 Kč, čistý zisk 272 628 Kč, efektivní zdanění 9,1 %, rezerva 2 281 Kč/měsíc.
>
> **`regime` má zatím jedinou hodnotu** `'secondary_student'`. Hlavní činnost chybí schválně — potřebovala by minimální vyměřovací základy, které v `tax-constants.ts` nejsou, a odhadovat je by znamenalo vracet čísla, co vypadají přesně, ale nejsou. V UI je proto režim napsaný jako fakt, ne jako výběr s jedinou položkou.
>
> **Rok** se předává jen jako údaj o tom, za co se počítá. Sazby existují pro 2026; pro jiný rok vrátí `ratesMatchYear: false` a kalkulačka to nahlásí, místo aby tiše počítala cizími sazbami.
>
> **Hranice sociálního je skok, ne náběh** — o korunu příjmu nad 293 802 Kč skočí odvod o víc než 18 000 Kč, protože se platí z celého vyměřovacího základu. Hlídač limitů to ukazuje; test to hlídá.
>
> Obě komponenty zatím **nikde nevisí** — zapojuje je Fáze 3 (`Zapojit kalkulačku na příjem přiznané linie`).

---

## FÁZE 3 — Dvě linie příjmů ve Financích

**Cíl:** Rozdělit příjmy na přiznané a nepřiznané a dostat je do UI.

- [x] `app/hub/finance/page.tsx` — přidat záložky `Osobní` (všechen současný obsah beze změny) a `Podnikání` (nový obsah). Stav záložky držet v URL (`?tab=podnikani`), ať jde odkazovat a přežije reload.
- [x] `app/hub/finance/BusinessSection.tsx` — přepínač roku + dvě karty linií (příjem, počet zakázek, z toho nezaplaceno)
- [x] `app/hub/finance/finance-actions.ts` — dotazy na příjmy podle `declared` a roku (`getBusinessIncome`)
- [x] Do formuláře transakce přidat přepínač přiznané / nepřiznané
- [x] `components/ProjectForm.tsx` — checkbox „fakturováno na IČO" (`projects.invoiced_on_ico`); příjmová transakce ze zakázky z něj dědí `declared`
- [x] Zapojit kalkulačku z Fáze 2 na příjem přiznané linie
- [x] **Nad rámec plánu:** přeřazení už existujícího příjmu mezi liniemi (`setTransactionDeclared`, kliknutí na IČO štítek u transakce). Bez toho by věta z migrace 054 „uživatel si historická data označí ručně" nešla splnit — přepínač ve formuláři platí jen pro nově zakládané transakce.

**Hotovo když:** Součet obou linií se rovná celkovému příjmu za rok a kalkulačka bere jen přiznanou linii. ✅ **Dokončeno 2026-09-11**

> **Ověřeno proti produkční DB:** za 2026 je v ledgeru 48 700 Kč příjmů, zatím celé v nepřiznané linii (default `false` drží, historie se sama nepřiznala). Rozpad na dvě linie ověřen simulací přes CTE bez zápisu do dat: 17 700 + 31 000 = 48 700 Kč, součet sedí.
>
> **Rok = datum zaplacení** (`finance_transactions.date`), ne datum vystavení. Hotovostní princip.
>
> **„Nezaplacené zakázky" nejsou filtrované rokem** — dokud peníze nedorazí, nepatří žádnému roku. V kartě je to popsané, ať se to nesčítá s ročním příjmem. Bere se `cena − už zaplacená záloha` a **napříč oběma byznysy**: je to jedno IČO a jedno daňové přiznání, takže ALTENO zakázky do výpočtu patří.
>
> **Zdroj pravdy pro příjmy ze zakázky je checkbox na zakázce.** Přepnutí „fakturováno na IČO" přerovná i příjmy, které ze zakázky už vznikly (`updateProject`) — jinak by zakázka byla v jedné linii a její peníze v druhé. Ruční přeřazení jednotlivé transakce proto přežije jen do nejbližší úpravy té zakázky; u transakcí bez zakázky platí trvale.
>
> **„Zakázky v příjmech" počítají jen transakce se zdrojovou zakázkou.** Ručně zadaná transakce žádnou zakázkou není — když se počty liší, karta dopíše „· N transakcí".
>
> **Data se tahají jen pro zobrazenou záložku.** Osobní záložka se chová přesně jako dřív.
>
> **Zbývá mimo rozsah fáze:** `createCompletedProject` (ruční přidání v Dokončených) zakládá příjem vždy jako nepřiznaný — `completed_projects` nemá vlastní příznak linie. Přeřadit jde kliknutím na IČO štítek. Řeší se ve Fázi 8, kde se peníze z Dokončených stěhují do Financí.

---

## FÁZE 4 — Archiv faktur (bez AI)

**Cíl:** Nahrát, uložit, zobrazit a stáhnout fakturu. AI zatím nikde.

- [x] `app/hub/finance/invoice-actions.ts` — `createInvoice`, `updateInvoice`, `deleteInvoice`, `getInvoices(year)`. Všechno pod `requireAuth()`.
- [x] Validace uploadu: pouze PDF, **max 4 MB** (viz poznámka níže — 5 MB by na Vercelu neprošlo), kontrola magic bytes `%PDF-`, ne jen přípony.
- [x] `app/api/invoices/[id]/pdf/route.ts` — servírování PDF za `getServerSession`. `middleware.ts` na `/api` nesahá, takže je to jediná ochrana, ne pojistka navíc.
- [x] `components/InvoiceArchive.tsx` — podsekce pod přiznanou linií: číslo, klient, vystaveno, splatnost, zaplaceno, částka, PDF. Rok řídí přepínač roku ve Financích, stav zaplacení dělí na dvě skupiny.
- [x] `components/InvoiceUploadModal.tsx` — ruční formulář + upload PDF (pole sdílená přes `components/InvoiceFields.tsx`)
- [x] Napojeno na tři místa: nová zakázka (`ProjectForm` → `createProject`), detail zakázky (`/dashboard/[id]`), Finance (faktura bez zakázky)
- [x] Při vyplnění `paid_on` vzniká příjmová transakce s `declared = true`; při zrušení `paid_on` mizí. Jeden příjem vstupuje do ledgeru právě jednou — viz „Převzetí příjmu" níže.
- [x] Pohledávky (faktury bez `paid_on`) zobrazené zvlášť, mimo daňový základ

**Hotovo když:** Fakturu lze nahrát u zakázky i samostatně, otevřít její PDF, a po označení za zaplacenou se objeví v přiznané linii a promítne se do kalkulačky. ✅ **Dokončeno 2026-09-11**

> **Strop PDF je 4 MB, ne 5 MB.** Vercel odmítne request s tělem nad 4,5 MB dřív, než se kód vůbec spustí — u souboru mezi 4,5 a 5 MB by uživatel dostal platformní 413 bez vysvětlení. 4 MB nechává rezervu na multipart overhead a chybu hlásí appka vlastními slovy. Konstanta je v `lib/invoice-constants.ts` (samostatný soubor, protože ji potřebují i klientské komponenty a `lib/invoices.ts` tahá `lib/db.ts`).
>
> **Server actions mají zvednutý `bodySizeLimit` na 5 MB** (`next.config.mjs`) — výchozí 1 MB by propustilo jen ty nejmenší PDF.
>
> **Převzetí příjmu místo druhého zápisu (migrace 056).** Zaplacená zakázka a faktura na tutéž zakázku jsou dvě cesty ke stejným penězům — Past č. 2. `syncInvoiceTransaction` proto nejdřív hledá příjem, který zakázka už do ledgeru zapsala se **stejnou částkou** a který si zatím nezabrala jiná faktura. Když ho najde, převezme ho (naváže a přepne do přiznané linie) místo aby založil druhý. Nová dvojice sloupců to rozlišuje:
> - `invoices.finance_transaction_id` — která transakce fakturu v ledgeru zastupuje
> - `finance_transactions.source_invoice_id` — kdo tu transakci **založil**
>
> Zrušení `paid_on` nebo smazání faktury maže jen vlastněnou transakci; převzatou nechá být, protože patří zakázce.
>
> **Když částky nesedí (např. záloha 3 000 + doplatek 7 000 vs. faktura na 10 000), převzetí neproběhne** a faktura založí vlastní příjem — to je reálné dvojí započtení. Archiv proto u takového řádku ukazuje amber štítek „Zkontrolovat příjem": zakázka má v ledgeru i vlastní příjem, který faktura nezastupuje. Štítek je upozornění, ne chyba — u faktury jen na doplatek je to legitimní stav.
>
> **Rok u faktur = rok zaplacení**, stejně jako u linií příjmů. Pohledávky se rokem nefiltrují vůbec — dokud peníze nedorazí, nepatří žádnému roku (stejné pravidlo jako „Nezaplacené zakázky" ve Fázi 3).
>
> **`createProject` teď umí vrátit `{ error }`.** Faktura přiložená k nové zakázce se validuje **před** vložením zakázky — jinak by po chybě zůstala viset zakázka bez faktury a uživatel by četl hlášku, že se nic neuložilo. Na úspěšné cestě se pořád redirectuje, návratová hodnota existuje jen kvůli chybě.
>
> **Blok „Přiložit fakturu" je jen ve VIZEON nové zakázce** — fakturace v ALTENU je mimo rozsah, blok by tam vedl do prázdna. Výběr zakázky ve Financích naopak nabízí obě sekce: je to jedno IČO a jedno přiznání.
>
> **bytea přes neonový HTTP driver** neumí přijmout `Buffer` — PDF se posílá jako base64 parametr a skládá přes `decode(…, 'base64')`, zpět se čte přes `encode(…, 'base64')`. Ověřeno round-tripem včetně diakritiky v názvu souboru.
>
> Ověřeno proti produkční DB třemi scénáři (faktura bez zakázky založí a zase smaže svůj příjem; faktura na zakázku převezme existující příjem a zrušení zaplacení ho nesmaže; PDF projde bytea beze změny). Testovací data uklizena, ledger za 2026 je pořád 48 700 Kč.

## FÁZE 5 — AI přepis faktur a veřejný endpoint

**Cíl:** Ať se pole vyplní sama.

- [x] `app/api/invoices/parse/route.ts` — přijme PDF, pošle ho Claudovi jako document content block, vrátí JSON: číslo faktury, datum vystavení, splatnost, částka, měna, odběratel, IČO, DIČ.
- [x] Odpověď validovat Zodem. **Když AI vrátí nesmysl nebo spadne, formulář musí jít vyplnit ručně** — parsování nikdy neblokuje uložení.
- [x] Tlačítko „Načíst z PDF" + stav načítání. Uživatel vždy vidí, co AI vyplnila, a může to přepsat.
- [x] Uložit surový výstup do `invoices.ai_extracted` pro pozdější dohledání
- [x] `app/api/public/invoices/route.ts` — endpoint s API klíčem (`INVOICES_API_KEY`), stejný vzor jako existující `/api/public/agent-leads`. Pro pozdější napojení n8n.
- [x] Doplnit `INVOICES_API_KEY` do `.env.example`

**Hotovo když:** Nahráním reálné faktury se předvyplní pole a po potvrzení vznikne správný záznam. Vypnutí `ANTHROPIC_API_KEY` nesmí rozbít ruční zadání. ✅ **Dokončeno 2026-09-11**

> **Ověřeno na reálném PDF.** Testovací česká faktura (dodavatel i odběratel, dvě položky, součet 37 500 Kč) prošla přepisem se všemi osmi poli správně — včetně toho, že model vzal **odběratele**, ne dodavatele, a celkovou sumu, ne položku. Doba odpovědi ~3 s.
>
> **Tlačítko žije v `InvoiceFields`, ne v `InvoiceUploadModal`.** Plán mluvil o modalu, ale pole jsou sdílená — stejný blok je i v „Přiložit fakturu" u nové zakázky. V modalu by to obsloužilo jen jedno ze dvou míst.
>
> **Přepis pole doplňuje, nemaže.** `applyInvoiceExtract` přepíše jen to, co model skutečně našel; co si uživatel napsal a AI to nenajde, zůstane. Na `paid_on` a `project_id` nesahá vůbec — o zdanitelném příjmu a zařazení rozhoduje uživatel, ne doklad. Systémový prompt to modelu říká taky, takže datum zaplacení se ani nevrací.
>
> **Přepis se ukládá k faktuře, ale nikdy nepřepíše historii.** `ai_extracted` se zapisuje jen když přepis reálně proběhl — běžná editace faktury ho nevymaže. Po výměně PDF se výstup zahodí, aby nezůstal viset u dokumentu, který už u faktury není.
>
> **Model a nastavení:** `claude-opus-5`, structured outputs přes Zod schéma (všechna pole povinná, ale nullable — model musí ke každému říct „nenašel jsem" místo tichého vynechání), `effort: 'low'` — přepis dokladu je jednoduchá extrakce. Datum i částka se po modelu ještě normalizují: co neprojde `YYYY-MM-DD`, spadne na null, aby se do `<input type="date">` nedostal nesmysl.
>
> **Selhání nikdy neblokuje.** `extractInvoiceFromPdf` nevyhazuje — vrací `{ error }` s českou hláškou. Chybějící klíč, rate limit i pád sítě skončí amber hláškou u formuláře, který zůstane celý vyplnitelný ručně. Hlídáno testy v `lib/__tests__/invoice-ai.test.ts`, které běží bez klíče a nesahají na síť.
>
> **Veřejný endpoint umí obě cesty.** Buď hotová pole v JSONu, nebo `pdf_base64`, kde chybějící pole doplní tentýž přepis (`ai_used` v odpovědi říká, která cesta se použila). Když se ani z PDF nedají vyčíst povinná pole, vrátí **422 a jmenuje, co chybí** — nikdy nezaloží fakturu s vymyšlenými čísly. Model se nepouští, když jsou pole v těle kompletní.
>
> **`paid_on` na veřejném endpointu určuje jen volající.** Z dokladu se nikdy neodvozuje — je to hranice mezi pohledávkou a zdanitelným příjmem.
>
> **Ověřeno proti produkční DB** sedmi scénáři: bez klíče 401, JSON faktura, neúplný požadavek 422, jen PDF (AI doplnila všech 8 polí, PDF prošlo bytea beze změny — 39 643 B tam i zpět), duplicitní číslo 409, nepodstrčené PDF 400, `/api/invoices/parse` bez přihlášení 401. Zaplacená faktura z endpointu založila příjem 37 500 Kč v přiznané linii s kategorií `faktura`. Testovací data uklizena, ledger za 2026 je pořád 48 700 Kč a archiv prázdný.
>
> **Nová notifikace `invoice_received`** — faktura zvenčí se jinak nemá jak připomenout; v adminu vede na `/hub/finance?tab=podnikani`.
>
> **`vitest.config.ts` dostal `oxc.jsx`** — tsconfig má kvůli Nextu `jsx: preserve`, takže do té doby nešlo z testu importovat ani čistou funkci ležící v `.tsx` komponentě.

---

## FÁZE 6 — Legislativa a termíny

**Cíl:** Blok novinek živený zdarma z oficiálních zdrojů.

Ověřené funkční RSS kanály (bez registrace, bez tokenů):

| Zdroj | URL |
|-------|-----|
| Finanční správa — Novinky | `https://financnisprava.gov.cz/cs/rss/rss-novinky` |
| Finanční správa — Tiskové zprávy | `https://financnisprava.gov.cz/cs/rss/rss-tiskove-zpravy` |
| ČSSZ — Novinky | `https://www.cssz.cz/web/cz/rss-kanal-novinky` |

- [x] `lib/tax-news.ts` — stažení a parsování RSS 2.0. Bez další závislosti, nebo lehký XML parser.
- [x] Filtr podle klíčových slov (`OSVČ`, `paušál`, `daň z příjmů`, `zálohy`, `přiznání`, `přehled`, `pojistné`) — **obyčejné porovnání řetězců, žádná AI.**
- [x] `app/api/cron/tax-news/route.ts` — týdenní běh, zápis do `tax_news`, idempotentní přes unikátní `(source, guid)`
- [x] Zaregistrovat cron ve `vercel.json`
- [x] `components/TaxNewsBlock.tsx` — seznam novinek s odkazem na zdroj a možností označit za přečtené. **Vždy zobrazit zdroj a datum** — je to informace, ne daňové poradenství.
- [x] Blok daňových termínů (přiznání, přehledy ČSSZ a zdravotní pojišťovny) — pevný roční kalendář, ne feed

**Hotovo když:** Cron naplní novinky, blok je zobrazí s odkazy a opakovaný běh nezaloží duplicity. ✅ **Dokončeno 2026-09-11**

> **Finanční správa neposílá `<guid>` vůbec.** Ověřeno na živém feedu: 50 položek, nula `<guid>` elementů. Kdyby na něm stála idempotence, každý běh cronu by ten kanál založil znovu — parser proto padá zpátky na `<link>`, což je přesně to, co předpokládá komentář u migrace 055. ČSSZ vlastní `<guid isPermaLink="false">` má a ten se respektuje.
>
> **Oba kanály Finanční správy sdílí jeden `source`.** „Novinky" a „Tiskové zprávy" se z větší části překrývají (50 + 50 položek, 68 prošlo filtrem, ale vloženo jen 49). Překryv zahodí unikátní index `(source, guid)` a v rámci jednoho běhu i `Set` v `syncTaxNews` — jinak by druhý insert v téže dávce narazil na constraint kvůli položce, kterou právě založil první.
>
> **Parser je vlastní, ne závislost navíc.** RSS 2.0 je plochý formát a feedy mají desítky kilobajtů; regex nad `<item>` s ošetřením CDATA, HTML tagů a entit (`&nbsp;`, `&#237;`) stačí. Popisy z Finanční správy chodí jako HTML v CDATA, z ČSSZ jako čistý text — do DB jde v obou případech čistý text zkrácený na 1000 znaků.
>
> **Filtr je opravdu jen `includes`**, ale nad normalizovaným textem — diakritika pryč, vše na malá písmena, takže „OSVČ" najde i „osvc". Na živých datech pustí dál 68 z 200 položek; odmítnuté jsou EET, důchody a poradenské dny, tedy věci mimo OSVČ. Pár falešně pozitivních projde (slovo „přehled" je běžné) — u informačního bloku je to lepší chyba než propásnutá změna zákona.
>
> **Jeden mrtvý feed nesmí shodit ostatní.** Stahuje se přes `Promise.allSettled` s 15s timeoutem; spadlý kanál se jmenuje v odpovědi cronu (`failedFeeds`), zbytek se zapíše.
>
> **Termíny se nestahují, dopočítávají se.** Lhůty plynou ze zákona a mění se jen tím, na jaký den v týdnu vyjdou — `lib/tax-deadlines.ts` je odvozuje z roku a ze způsobu podání (papírově 1. 4. / elektronicky 1. 5. / s poradcem 1. 7.) a posouvá na nejbližší pracovní den podle § 33 odst. 4 daňového řádu. Svátky včetně pohyblivých Velikonoc se počítají, ne vypisují.
>
> **Přehledy pro ČSSZ i zdravotní se odvozují od lhůty přiznání** (měsíc po ní), ne z pevného data. Zadrátovat „2. května" by při elektronickém podání lhalo o měsíc — přepínač způsobu podání proto posune všechny tři termíny najednou.
>
> **Kalendář přetáčí ročníky sám.** V lednu až červnu je aktuální termín ten za loňský rok; `getUpcomingTaxDeadlines` prochází tři období zpět a vrací tři nejbližší nesplněné, takže termín nezmizí dřív, než se stihne splnit.
>
> **Ověřeno proti produkční DB.** První běh: 200 staženo, 68 prošlo filtrem, 49 vloženo. Druhý běh: 0 vloženo, počet řádků beze změny, nula duplicit podle `(source, guid)`, nula položek bez data nebo popisu. Přečtená novinka po resyncu zůstala přečtená — `ON CONFLICT DO NOTHING` nesahá na `read`, takže odbavená položka příští týden nevyskočí znovu jako nová. Endpoint ověřen i přes HTTP: bez klíče i se špatným klíčem 401, se správným 200 a opakované volání nic nepřidá.
>
> **Tlačítko „Načíst teď" v bloku** existuje kvůli prvnímu nasazení — čekat na pondělní cron by znamenalo dívat se týden na prázdný blok. Jede stejnou idempotentní cestou jako cron, takže je bezpečné ho mačkat opakovaně.
>
> **Cron běží v pondělí v 5:00 UTC** (`vercel.json`). Novinky nejsou urgentní; denní běh by jen platil requesty za feed, který se mění jednou za pár dní.
>
> **Žádná nová env proměnná** — `CRON_SECRET` už v `.env.example` je a sdílí ho s ostatními crony.

---

## FÁZE 7 — Kalendář → Hovory `[nezávislá]`

**Cíl:** Z hovoru v kalendáři se dostat rovnou ke kontaktu.

Dnešní stav: `components/SmartCalendar.tsx:180` posílá do modalu jen `{ description: next_action }` — telefon, e-mail ani status tam nedorazí. Řádek 367 linkuje natvrdo na `/dashboard/calls` bez ID.

- [x] `app/dashboard/calendar/page.tsx` — do dotazu na leady doplnit `phone`, `email`, `lead_status`, `estimated_value`, `notes`
- [x] `components/SmartCalendar.tsx` — rozšířit `RawLead` a `buildUnified` o tato pole + `leadId`
- [x] Modal události: u hovoru zobrazit firmu, kontakt, telefon, e-mail, status, odhadovanou hodnotu a poznámky, s akcemi volat / napsat / WhatsApp
- [x] Tlačítko „Otevřít hovory" → `/dashboard/calls?lead=ID`
- [x] `components/LeadsTable.tsx` — číst `?lead=` ze searchParams, na kontakt odscrollovat, zvýraznit ho a rozbalit jeho detail

**Hotovo když:** Kliknutí na hovor v kalendáři ukáže celý kontakt a tlačítko otevře přímo jeho detail v Hovorech. ✅ **Dokončeno 2026-09-11**

> **`leadId` nežije samostatně, ale v `meta.lead`.** Plán mluvil o `leadId` + pěti polích vedle sebe. Ve výsledku je celý kontakt jeden volitelný objekt — `meta.lead` existuje právě u `kind === 'call'`, takže se jedním `if` odemkne celý blok místo pěti nezávislých `undefined` polí. Zbytek `meta` (konzultace, deadliny, události) zůstal beze změny.
>
> **`estimated_value` je numeric — neonový driver ho vrací jako string.** Ověřeno dotazem do produkční DB (76 leadů v kalendáři, všechny hodnoty typu `string`). Stránka ho proto převádí na `Number` už na serveru; bez toho by `toLocaleString('cs-CZ')` na stringu tiše neformátoval nic.
>
> **`whatsappHref` je v `lib/utils.ts`, ne v komponentě** — potřebují ho kalendářní modal i rozbalený řádek v Hovorech. Normalizuje na mezinárodní tvar bez `+`: devítimístné číslo doplní o 420, `00` prefix zahodí. Ověřeno na reálných tvarech z DB (`+420 731374177`, `+420 728 950 105 `, `00420…`, i německé číslo). Degenerovaný záznam `"+420 "` vrátí `null` — místo rozbitého odkazu se tlačítko nezobrazí vůbec.
>
> **Kontakt se v Hovorech hledá špatně — proto zvýraznění.** Aktivní tabulka má 11 sloupců, `min-w-[1100px]` a 76 řádků. Příchod z kalendáře proto řádek rozbalí, odscrolluje na střed a na 4 s ho orámuje; po vypršení zůstane jen rozbalený. Kotva je `id="lead-<uuid>"` na `<tr>`.
>
> **Rozbalený detail ukazuje to, co se do tabulky nevešlo** — `notes` (v aktivní tabulce nejsou vůbec, jen ve formuláři editace), datum přidání, příznak „založeno z kalendáře" a akce volat / napsat / WhatsApp. Sbalit/rozbalit jde i ručně šipkou u názvu firmy.
>
> **Zvýraznění funguje i v tabulce Čekání.** Kalendář filtruje jen `converted`/`lost`, takže `waiting` leady v něm jsou (aktuálně většina). Rozbalovací detail tam ale není — Čekání už sloupec Poznámka má.
>
> **`?lead=` se čte na serveru a padá dolů propem**, ne přes `useSearchParams` v klientu. Stránka je stejně dynamická (`getServerSession`) a odpadá tím povinná `Suspense` hranice kolem tabulky.
>
> Neexistující nebo cizí `?lead=` se ignoruje — efekt se spustí jen když ID mezi načtenými kontakty opravdu je.

---

## FÁZE 8 — Dokončené jako výkonnost podnikání `[nezávislá]`

**Cíl:** Vyčistit sekci od peněz a dat, která patří do Financí.

- [x] Přesunout daňová a příjmová čísla z `EarningsCalculator` do Financí; v Dokončených nechat výkonnost
- [x] Metriky výkonnosti: hodinová sazba, náročnost vs. skutečný čas, odhad vs. realita, vývoj v čase
- [x] Napojit spokojenost klientů z `project_surveys`
- [x] Zkontrolovat, že v sekci nezůstalo žádné číslo, které si odporuje s Financemi

**Hotovo když:** Dokončené odpovídají na otázku „jak dobře pracuju", Finance na otázku „kolik vydělávám a kolik odvedu". Žádné číslo není na dvou místech jinak. ✅ **Dokončeno 2026-09-11**

> **`EarningsCalculator.tsx` je pryč, nahradil ho `components/PerformanceOverview.tsx`.** Nejde o edit, ale přepis — původní komponenta byla ze tří čtvrtin peníze (Celkové příjmy, Celkové náklady s projekcí na N měsíců, Čistý výdělek, Zálohy), což je přesně to, co teď spolehlivěji počítá `BusinessSection` ve Financích nad `finance_transactions` (s rozlišením přiznané/nepřiznané linie a bez rizika dvojího započtení). Nová komponenta peníze nepočítá vůbec, kromě **hodinové sazby** — ta zůstala, protože je to poměr (příjem/čas), ne částka sama o sobě, a plán ji jmenuje jako výkonnostní metriku.
>
> **`/dashboard/naklady` už do Dokončených nic neprojektuje.** Popisek stránky lhal — fixní i jednorázové náklady dávno chodí přímo do cash flow ve Financích (`generateRecurringCostTransactionsInternal`, `source_cost_id`), ne do kalkulačky v Dokončených. Text opraven, `costs` se na `/dashboard/dokoncene` už netahají.
>
> **Nová metrika „odhad vs. realita" potřebovala novou databázovou kolonku.** `time_invested` byl vždy jen skutečný čas — nic v `projects` ani `completed_projects` nenosilo odhad z doby zadání. Migrace 057 přidává `completed_projects.estimated_hours` (volitelný, nullable). Vyplňuje se buď v okně „Dokončit zakázku" (`MarkCompletedButton`) vedle skutečného času, nebo ručně v tabulce Dokončených (`CompletedProjectsTable`, nový sloupec „Odhad"). Historická data ho nemají — komponenta to ukazuje jako prázdný stav s vysvětlením, ne jako nulu.
>
> **Náročnost vs. skutečný čas** je bucket součet (nízká/střední/vysoká náročnost → průměr hodin) plus řádkový bar chart per projekt, ne korelační koeficient — s reálně 3 klientskými zakázkami by statistika nic neřekla, vizuální porovnání ano.
>
> **Vývoj v čase** je vlastní inline SVG polyline (žádná chart knihovna v `package.json`), hodinová sazba klientských zakázek chronologicky podle `completed_at`, plus „posledních N v průměru vs. dřív". Potřebuje aspoň 2 zakázky s vyplněnou částkou i časem — s méně to řekne, že na trend zatím nemá dost dat, místo aby kreslilo přímku ze dvou bodů jako závěr.
>
> **Spokojenost klientů čte `project_surveys`, ale nekopíruje `HodnoceniDashboard`.** Karta ukazuje jen souhrn (celkový průměr, N z M ohodnoceno, průměr po kategoriích) s odkazem „Zobrazit všechna hodnocení →" na `/dashboard/hodnoceni`, kde žije celý detail (reference, kopírování, mazání). Duplikovat tam celou stránku by bylo přesně to číslo-na-dvou-místech riziko, co má Fáze 8 odstranit, ne přidat.
>
> **Ověřeno proti produkční DB:** 3 klientské zakázky (6 000/10 h, 10 000/20 h, 15 000/25 h, náročnost 6/6/7), všechny 3 ohodnocené 5/5 ve všech kategoriích → hodinová sazba 564 Kč/h, průměrná náročnost 6,3/10, spokojenost 5,0/5 (3 z 3). Nová kolonka `estimated_hours` ověřena zápisem/čtením/smazáním testovacího řádku přímo přes SQL (insert → update → typ `numeric` čte se jako string, stejně jako `amount`/`time_invested` → cleanup) — v produkčních datech testovací řádek nezůstal. `npx tsc --noEmit`, `npx eslint` a `npm run build` čisté, 100/100 testů prochází.

---

## Diagnostika stávajícího stavu

Zjištěno dotazem do produkční databáze 2026-09-11.

### Bug „3 zakázky, počítá 5" — opraveno ve Fázi 0

`completed_projects` obsahuje 5 řádků, ale jen 3 jsou klientské zakázky:

| Zakázka | Částka | Typ |
|---------|--------|-----|
| Vytvořit vícestránkový web | 15 000 Kč | client |
| Vytvořit profesionální landing | 10 000 Kč | client |
| U Cerhů | 6 000 Kč | client |
| ZakazIQ | 0 Kč | **personal** |
| VZEON | 0 Kč | **personal** |

`EarningsCalculator.tsx:87` psal `Celkem {projects.length} zakázek` — počítal i osobní projekty s nulovou částkou, přestože všechny ostatní metriky v komponentě `client` a `personal` rozlišovaly. Oprava byla ve Fázi 0; komponenta sama byla ve Fázi 8 nahrazena `PerformanceOverview.tsx` (viz tam), řádkování už neplatí.

### Rozdíl 31 000 vs 48 700 Kč — není chyba

Dokončené sčítají 31 000 Kč (hotové zakázky), `finance_transactions` hlásí 48 700 Kč. Rozdíl jsou **zálohy z rozpracovaných zakázek**. Obě čísla jsou správná, jen měří jinou věc — a potvrzují hotovostní princip: záloha je příjem, jakmile dorazí. **Historii nečistit.**

### Past č. 1 — nejednoznačná sémantika zálohy — vyřešeno ve Fázi 0

`EarningsCalculator.tsx:50` počítá `amount + deposit_amount`, ale řádek 115 počítá `doplatek = amount − deposit`. Buď `amount` zahrnuje zálohu, nebo ne — obojí zároveň nejde. Sjednotit ve Fázi 0.

### Past č. 2 — hrozí dvojí započtení příjmu

Dnes vedou do ledgeru tři cesty a jen část z nich hlídá duplicitu:

- `createProject` / `updateProject` se zaplacenou zakázkou → příjmová transakce
- `createCompletedProject` (ruční přidání v Dokončených) → **také** příjmová transakce, bez jakékoli kontroly duplicity
- `addToCompleted` (`app/actions.ts:427`) → transakci nevytváří a duplicitu hlídá přes `source_project_id`

Zatím to nevybouchlo, protože všech 5 řádků bylo zadáno ručně a zaplacenou zakázkou neprošla ani jedna. Jakmile se začnou používat obě cesty, příjem se započte dvakrát.

**Pravidlo pro všechny nové kódy:** *Příjem vstupuje do ledgeru právě jednou, ve chvíli přijetí platby.* Dokončení zakázky ani založení faktury samo o sobě příjem nevytváří.

---

## Mimo rozsah

- DPH — přiznání, kontrolní hlášení, sazby na výstupu
- n8n workflow (jen se připraví endpoint)
- Fakturace v sekci ALTENO
- Generování faktur systémem (teď se pouze nahrávají hotová PDF)
- Skutečné výdaje místo paušálu
- AI chat asistent nad financemi — možné rozšíření po Fázi 5
- Přepis PDF, které už u faktury visí uložené (tlačítko se nabízí jen k čerstvě vybranému souboru)

---

## Changelog

| Datum | Fáze | Co vzniklo |
|-------|------|-----------|
| 2026-09-11 | 8 | `components/EarningsCalculator.tsx` smazán, nahrazen `components/PerformanceOverview.tsx` — místo peněz (příjmy/náklady/čistý výdělek, teď plně ve Financích) počítá jen výkonnost: hodinová sazba, náročnost vs. skutečný čas (bucket průměry + bar chart), odhad vs. realita, vývoj hodinové sazby v čase (vlastní SVG polyline), spokojenost klientů z `project_surveys` (souhrn + odkaz do Hodnocení). Migrace 057 (`completed_projects.estimated_hours`, nullable) — nová kolonka pro odhad z doby zadání, vyplnitelná v `MarkCompletedButton` i `CompletedProjectsTable`. `app/dashboard/naklady` už netvrdí, že se promítá do Dokončených — teď správně popisuje cash flow ve Financích. |
| 2026-09-11 | 6 | `lib/tax-news.ts` — vlastní RSS 2.0 parser (CDATA, HTML, entity), filtr klíčových slov bez diakritiky, `syncTaxNews` přes `Promise.allSettled` s dedup uvnitř běhu. `lib/tax-deadlines.ts` — termíny dopočítané ze zákonných lhůt, české svátky včetně Velikonoc, posun na pracovní den. Cron `/api/cron/tax-news` (pondělí 5:00 UTC, zaregistrovaný ve `vercel.json`), `app/hub/finance/tax-news-actions.ts` (čtení, označení přečtené, ruční načtení). Komponenty `TaxNewsBlock` a `TaxDeadlines` zapojené pod kalkulačkou v záložce Podnikání. Testy: `lib/__tests__/tax-news.test.ts` a `lib/__tests__/tax-deadlines.test.ts` (38 testů, bez sítě). |
| 2026-09-11 | 7 | Kalendářní dotaz na leady tahá i kontaktní údaje; `RawLead` a `UnifiedEvent.meta.lead` je nesou do `SmartCalendar`. Modal hovoru ukazuje firmu, status, odhad hodnoty, telefon, e-mail a poznámky s akcemi volat / napsat / WhatsApp, „Otevřít hovory" míří na `/dashboard/calls?lead=ID`. `LeadsTable` dostal rozbalovací detail řádku (poznámky + kontaktní akce), kotvu `id="lead-<uuid>"` a příchod z kalendáře, který kontakt rozbalí, odscrolluje a na 4 s zvýrazní — i v tabulce Čekání. Sdílený `whatsappHref` v `lib/utils.ts`. |
| 2026-09-11 | 5 | `lib/invoice-ai.ts` — přepis PDF přes `claude-opus-5` + structured outputs, nikdy nevyhazuje. Chráněná route `/api/invoices/parse`, tlačítko „Načíst z PDF" v `InvoiceFields` (a tím i v modalu Financí i v nové zakázce), `applyInvoiceExtract` s pravidlem „doplň, nepřepisuj ruční vstup". `ai_extracted` se ukládá k faktuře. Veřejný `/api/public/invoices` (`INVOICES_API_KEY`, bearer, rate limit) přijímá hotová pole i samotné PDF, chybějící povinná pole hlásí 422. Notifikace `invoice_received`. Testy: `lib/__tests__/invoice-ai.test.ts` (chování bez klíče) a `components/__tests__/invoice-extract.test.ts` (slučování do formuláře); `vitest.config.ts` umí JSX. |
| 2026-09-11 | 4 | Migrace 056 (`finance_transactions.source_invoice_id`). `lib/invoices.ts` (parsování, validace PDF přes magic bytes, `syncInvoiceTransaction` s převzetím existujícího příjmu), `lib/invoice-constants.ts`, `app/hub/finance/invoice-actions.ts`, chráněná route `/api/invoices/[id]/pdf`. Komponenty `InvoiceFields`, `InvoiceUploadModal`, `InvoiceArchive`. Napojeno na Finance (pod přiznanou linií), detail zakázky a novou zakázku. `createProject` přijímá volitelnou fakturu a vrací `{ error }`. |
| 2026-09-11 | — | Analýza kódu a dat, návrh plánu, ověření sazeb 2026 |
| 2026-09-11 | 3 | Záložky `Osobní` / `Podnikání` v URL, `BusinessSection` se dvěma liniemi a přepínačem roku, `getBusinessIncome(year)`, přepínač přiznané/nepřiznané ve formuláři transakce i u existujících příjmů, checkbox „fakturováno na IČO" na zakázce s děděním do transakcí, kalkulačka zapojená na přiznanou linii. |
| 2026-09-11 | 0 | `EarningsCalculator`: počet zakázek jen klientské (3, ne 5), `amount` přestalo dvojitě sčítat zálohu. Sjednocená sémantika zapsaná v komentáři u výpočtu. |
| 2026-09-11 | 2 | `lib/tax.ts` (`calculateTax`, `remainingToThreshold`) + 22 testů na hraniční hodnoty. `components/TaxCalculator.tsx` a `components/TaxLimitWatch.tsx` — zatím nezapojené, čekají na Fázi 3. |
| 2026-09-11 | 1 | Migrace 053 (`invoices`), 054 (`projects.invoiced_on_ico` + `finance_transactions.declared`), 055 (`tax_news`) — aplikované na Neon, idempotence ověřena druhým během. `lib/tax-constants.ts` se sazbami 2026 a dopočítanými hranicemi. Typy `Invoice`, `InvoiceAiExtract`, `TaxNews` + `Project.invoiced_on_ico`. Obecný běhoun migrací `scripts/apply-migration.js`. Build i testy (33) prochází. |
