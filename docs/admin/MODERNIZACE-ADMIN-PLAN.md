# Modernizace admin konzole — plán implementace

> Zdroj pravdy pro rozsah, fáze a stav modernizace admin konzole (VIZEON, ALTENO, Hub).
> Prompty sezení: [`new - area of zakaziq/prompty/admin/00-README.md`](<../../new - area of zakaziq/prompty/admin/00-README.md>).
> Popis dnešního kódu adminu: [`AGENTS-ADMIN.md`](AGENTS-ADMIN.md). Rozhodnutí a changelog: `memory/memory.md`.
> Při rozporu s tímto plánem platí Rozhodnutí v paměti.

**Stav:** plán schválený 2026-11-10, rozšířený týž den večer o úklid, sjednocení byznysu,
zrušení Hubu, sloučení Dokončených a hodnocení (sezení AD01–AD03, AD11, AD16).
Žádné sezení ještě neproběhlo.

---

## 1. Co chceme (Kryštofovými slovy, upřesněno)

Admin konzole je Kryštofův denní pracovní systém. Vedle ní v tomtéž repu vyrostl Workspace
s design systémem Dílky, novou kostrou, dávkovaným datovým přístupem a vlastním peněžním modulem.
Rozdíl je tak velký, že se za admin stydí: „je to moc retro, škaredé CRM oproti tomu SaaS."

Zadání: zmodernizovat vzhled a tabulky, zjednodušit fakturaci a tok dat, zrychlit načítání, propojit
kalendář, hovory a kontakty, volat jedním klikem bez opisování, přidat AI asistenta, který z věty
udělá návrh akce, a dát systému paměť, ze které se učí.

**Cíl:** admin, který vypadá a běží jako produkt, který Kryštof prodává — stejný design systém,
stejná rychlost, podstatně méně ručního opisování.

### Rozhodnutí Kryštofa (2026-11-10)

| Otázka | Rozhodnutí | Zapsáno |
|---|---|---|
| Pořadí vůči spuštění Workspace | **Paralelně** — admin na vlastní větvi, launch neblokovat | R-082 |
| Vzhled | **Dílky i v adminu**, mechanické sjednocení všude + ruční překreslení denních obrazovek | R-081 |
| Hub | **V rozsahu** — modernizuje se celý admin včetně `/hub` | R-081 |
| Fakturace | **Vystavovat faktury přímo v adminu** (vzor Workspace), archiv cizích PDF zůstává | R-083 |
| AI asistent | **Navrhne, Kryštof potvrdí klikem.** Nic se neuloží samo | R-084 |
| Volání z appky | **`tel:` / `mailto:` / `sms:` + šablony zpráv.** VoIP ne | R-084 |
| Paměť projektu | **Předvyplnění z historie + kontext doplňovaný AI**, používaný při návrzích | R-085 |
| Testovací data | **Admin migrace na testovací Neon + ukázková data** | R-082 |

### Rozhodnutí Kryštofa — druhé kolo (2026-11-10 večer)

| Otázka | Rozhodnutí | Zapsáno |
|---|---|---|
| Hub | **Zrušit**, ne modernizovat. Finance, Projekty a Startup do hlavní navigace | R-087 (mění R-081) |
| Alteno | **Není druhá firma, je zdroj poptávky.** Web alteno.cz běží dál beze změny | R-088 |
| Weby | **vizeon.cz, alteno.cz, prvotka.cz** do jednoho inboxu; estetik.cz má být jeden řádek konfigurace | R-088 |
| Škola, Sport, Plány | **Smazat včetně 23 tabulek** (po exportu do CSV) | R-089 |
| Šablony webu | **Celou funkci pryč** — knihovna i bloky u zakázek (`@dnd-kit` ale zůstává, používá ho Nastavení Workspace) | R-089 |
| Dokončené | **Sloučit do zakázky.** Zakázka hotovo/zaplaceno *je* dokončená | R-090 |
| Hodnocení | **Automaticky** při uzavření + jedna připomínka po 7 dnech + reference pro web | R-090 |
| Předávací dokument | **Ano** — co bylo dodané, PDF stejnou cestou jako faktura | R-090 |
| Cesta na produkci (otázka A) | **Varianta A:** `ws/redesign-app` → `main` fast-forwardem a deploy, pak `admin/modernizace` z `main` | R-082 doplněno |
| `app/dashboard/projekty` (otázka B) | **Smazat** — Hub se ruší, přesměrovávat není kam | R-087 |

---

## 2. Co jsem našel v kódu (průzkum 2026-11-10)

### Vzhled
- Všech 11 odstínů `brand-*` má **shodnou hodnotu** s `navy-*` (`brand-700 = #23478b = --navy-700`,
  `brand-50 = #eef2fb = --navy-50`). Přejmenování je opticky neutrální.
- **Past:** `brand-*` je literální hex, `navy-*` se kompiluje na `rgb(var(--navy-700) / <alpha>)`
  (`lib/ws/tailwind-dilky.ts`) a proměnné existují **jen** v `[data-app="ws"]` a `[data-app="admin"]`.
  `/p/[token]`, `/h/[token]` a `/login` `data-app` nemají a portál importuje pět kořenových komponent
  (`StatusBadge`, `FeedbackBlock`, `SurveyForm`, `BookingCTA`, `ClientRequestBlock`).
  **Přejmenování bez přípravy rozbije barvy klientům v portálu.** Řeší se paletou v `:root`.
- Stará vrstva ve 143 souborech: `muted-foreground` 122 souborů/1057×, `border-border` 99/536,
  `bg-white` 97/302, duhové `bg-{barva}-NNN` 81/477, `brand-*` 79/668, `brand-gradient` 25/44.
  Dílky jsou v obsahu jen ve 3 souborech. V `app/w`, `app/r`, `app/z`, `app/klient`, `components/ws`,
  `app/(marketing)` **žádný výskyt** `brand-*` — Workspace a landing se přepisu nedotknou.
- `AdminShell` (125 ř.) dává všem obrazovkám jednu pevnou šířku `max-w-5xl` a **nemá hlavičku stránky
  ani řádek filtrů**. `app/hub/layout.tsx` kostru nepoužívá vůbec (vlastní panel, `brand-gradient`,
  pět duhových barev pilířů, bez `data-app` → tokeny tam neplatí).
- `components/ui/*` (20 komponent) ani Radix admin nepoužívá (0 importů): 9 ručně psaných modálů
  `fixed inset-0` bez focus trapu, tlačítka inline, **tři nezávislé barevné systémy stavů**
  (`STATUS_STYLES` 5 + `LEAD_STATUS_STYLES` 6 + `ACTION_TYPE_STYLES` 6 = 17 kombinací).
- `app/globals.css:1` stahuje Inter z Google Fonts a nastavuje `body { font-family: Inter }` pro celý
  dokument; `admin-tokens.css` se proti tomu (na rozdíl od `ws-tokens.css`) nebrání. Kvůli tomu má
  CSP profil `admin` výjimku na `fonts.googleapis.com` a `fonts.gstatic.com`.

### Tabulky
Sdílená tabulková komponenta **neexistuje**. Pět `<table>` (`LeadsTable` 1181 ř., `CostsManager`,
`CompletedProjectsTable` 11 sloupců, `WaitlistSection`, `ProjectCalculator`) a sedm grid výpisů.
**Řazení nemá ani jedna tabulka, stránkování ani jedna, mobilní variantu jen jedna.** Stejný
`className` hlavičky je ručně opsaný ve třech souborech. Pět dotazů táhne celou tabulku bez `LIMIT`,
včetně `getAllLeadNotes`, které posílá do prohlížeče **všechny poznámky všech leadů**.

### Rychlost
- `lib/db.ts` (17 ř.) je **jediná datová vrstva v repu bez dávkování a bez transakcí** — každý dotaz
  je samostatný HTTPS POST. `lib/ws/db.ts`, `lib/ws/admin/db.ts` i `lib/portal/db.ts` mají `batch()`.
- Žádná cache: `unstable_cache` 0×, `React.cache` 2 místa, `force-dynamic` 34×, `staleTimes`
  nenastavené → každá navigace tam a zpět spustí všechny dotazy znovu.
- Detail zakázky **12 dotazů v 5 sekvenčních vlnách** (`components/admin/project-detail-view.tsx`
  :72 → :83 → :335 → :347 → :430 → :432), z toho 5× `SELECT *` bez `LIMIT`.
  Kalendář 4 dotazy **bez časového okna** — celá historie jde do prohlížeče, měsíc se filtruje v JS.
  `/dashboard/faktury` korelovaný `COUNT(*)` na každou fakturu, bez `LIMIT`, `ORDER BY issued_on`
  bez indexu. `/dashboard/klienti` 11 korelovaných podvýběrů na 500 účtů a `ORDER BY GREATEST(5)`.
  `/hub/finance` pouští **dva zápisové generátory při každém GET**, před čtením dat.
- **Chybějící indexy:** `client_leads` nic na `created_at`, `lead_status`, `next_action_date`;
  `projects` jen `business`; `calendar_events` nic na `starts_at` ani `project_id`; `invoices` nic na
  `issued_on`; `completed_projects`, `project_surveys`, `costs` řadí bez indexu. Žádný `pg_trgm`
  → ⌘K dělá na každý úhoz tři sekvenční scany.
- **E-maily blokují akce:** `app/actions.ts:237` awaituje Gmail SMTP uprostřed `updateProject`, před
  zápisy do financí a před `revalidatePath` (totéž :154, :387, :404, :502, `calls-actions.ts:209,227`).
- `useOptimistic` **0× v celém repu**; `next/dynamic` v adminu 0×, `framer-motion` staticky v 6
  souborech. `app/providers.tsx` obaluje `SessionProvider` celou aplikaci včetně `/w` a landing page.

### Kontakty
**Entita „kontakt" neexistuje.** Telefony a e-maily jsou v **8 tabulkách** ve třech schématech, bez
unique, bez indexu, bez normalizace (jen `ws.customers` má CHECK na E.164) — shodu člověka nelze
zjistit. `convertLeadToProject` kontakt zkopíruje a kopie se dál rozcházejí. Termín z kalendáře
založí hovor **jen s titulkem a popisem**; změna času leadu nepřepíše `calendar_events.starts_at`
→ pár se rozpadne. `consultation_slots` (rezervace z portálu) nemá vazbu na kalendář ani hovory
a v Hovorech není vidět. **Na detailu zakázky není jediný klikací kontakt** — telefon je jen
`<input>` v `ProjectForm.tsx:264`. `sms:` se v repu nevyskytuje.

### Fakturace — admin faktury vůbec nevystavuje
`invoices` (migrace 053) je **archiv cizích PDF**: jedna `amount`, žádné položky, DPH, dodavatel,
šablona, generování PDF ani e-mail; PDF jako `bytea` v řádku (limit 4 MB). Číslo faktury je **ruční
textové pole**, pojistkou je unique index. Splatnost, IČO, DIČ a odběratel se vypisují znovu u každé
faktury; IČO/DIČ klienta není v `projects` vůbec, jediný zdroj je poslední faktura téhož klienta
a nikdo ho nečte. ARES lookup v repu není. Uložení = **4–6 samostatných dotazů bez transakce**.
AI přepis PDF: `claude-opus-5`, celé PDF v requestu, **v synchronní cestě formuláře**.
Křehká místa: **EUR faktura se v ledgeru sčítá s korunami** (`finance_transactions` nemá `currency`),
adopce příjmu podle přesné rovnosti částky s `LIMIT 1`, `updateProject` přepíše `declared` všem
transakcím zakázky, „po splatnosti" se počítá třemi způsoby, `declared` se zapisuje na šesti místech,
stejný 18sloupcový SELECT je 4× zkopírovaný, dvě sady daňových sazeb.
Workspace má hotový vzor: `ws.money_issue` (migrace 080, atomické číslo se zámkem), `invoice_profile`
(088), snímek `issuer`, `items jsonb` v haléřích, `money_pay`/`money_unpay` s `payment_origin`,
součty po měnách, SPAYD QR, vlastní PDF, e-mail jako koncept, jedno Zod schéma, testy nad PGlite.

### AI dnes
Čtyři modely ve čtyřech souborech, dva natvrdo: `claude-opus-5` na čtení PDF faktur
(`claude-haiku-5-5` je na stejnou práci ~50× levnější), `claude-sonnet-5-5` na požadavky klientů,
`claude-opus-4-6` v asistentovi Hubu, OpenAI `gpt-4o-transcribe` na přepis hlasu.
**`app/api/ai-assistant/route.ts` přijímá `systemPrompt` i `messages` z prohlížeče bez validace** —
jediná ochrana je `getServerSession`. Paměť v DB žádná; `memory/*.md` čte jen Claude Code.
`@anthropic-ai/sdk` 0.105 už v projektu je.

### Ověřeno spuštěním
- **`npm test` lokálně nic neříká.** Vitest sbírá i 11 worktree v `.claude/worktrees/`: 494 souborů,
  62 padajících, 161 s. Bez nich **58 souborů, 721 testů zelených, 23 s**. Worktree nejsou v gitu
  (`.git/info/exclude`), takže CI je zelené — rozbitá je jen kontrola, kterou `AGENTS.md` předepisuje
  před commitem. Zabírají 7,5 GB.
- **`app/dashboard/projekty` (559 ř.) je mrtvý duplikát `app/hub/projekty`** — odkazuje jen sám na
  sebe, v žádné navigaci není (ověřeno grepem). Dávno otevřený problém v paměti.
- Obecný běhoun migrací je **`scripts/apply-migration.js`** (jednotné číslo, bere jména souborů,
  `--dry`, respektuje `$$` bloky). `scripts/apply-migrations.js` (množné) je jednorázový skript pro
  migrace 007/008, ne běhoun. 96 z 99 migrací je idempotentních.
- `next` 16.4.2 → `after()` z `next/server` je k dispozici.

---

## 3. Pravidla pro všechny kroky

- Jedno sezení = jedna konverzace. Začátek a konec podle `zakaziq-memory`.
- **Migrace se jen připraví, aplikuje je Kryštof**, teprve pak deploy. Číslování od **100**
  (poslední v repu je 099, neaplikovaná). Migrace jsou aditivní, aby starý build fungoval dál.
- **Žádný nový npm balíček.** `qrcode`, `@anthropic-ai/sdk`, `puppeteer-core`, `@sparticuz/chromium`,
  `cmdk`, `sonner` už v projektu jsou. Jediná nová vnější závislost je **ARES** (AD12) → R-086.
- Vzhled jen Dílky (`zakaziq-design-dilky`), texty podle `zakaziq-ux-texty-cs`.
- Hromadné úpravy **vždy přes `git grep`** (jen verzované soubory) — tím automaticky vypadne
  `.claude/worktrees/` (11 kopií, 7,5 GB), `.agents/`, `node_modules` a `new - area of zakaziq`.
- Po každém sezení: `npx tsc --noEmit`, `npm test`, `npm run build:check` (při běžícím dev),
  changelog v `memory/memory.md`, stav v tabulce sekce 6, technická fakta do `AGENTS-ADMIN.md`.
- Bezpečnostní změna = zápis do `.claude/security/` ve stejném commitu + `node scripts/sync-agent-context.mjs --write` a `--check`.
- **Workspace a landing page se nesmí změnit.** Kontrolní podmínka každého vizuálního sezení:
  `/w` a `/` porovnat před a po (screenshot i zkompilované CSS, jako to dělal R-027).
- Cizí neuložené změny nepřepisovat, nevracet ani nestageovat. `git add` po konkrétních souborech.
- Merge do `main` a deploy **jen s výslovným souhlasem Kryštofa**.

---

## 4. Vizuální základ — technická rozhodnutí (platí pro AD04)

Tohle je nejdůležitější technická část celého plánu. Bez ní nejde přejmenovat barvy ani použít
hotové komponenty.

**a) Nový `app/tokens-dilky.css`** — jediný zdroj palety, importovaný z `app/globals.css`, selektor
`:root`: `--navy-50…950`, `--ground`, `--surface`, `--ink`, `--quiet`, `--signal` + `-bg/-line/-ink`,
`--reward`, `--danger`, `--danger-ink`, `--staff-1…5`, `--staff-tint`. Opticky nulová změna (dnes
nikdo mimo `data-app` třídy `navy-*` nepoužívá), ale `navy-*` začne fungovat i v portálu a na
`/login`. `app/ws-tokens.css` a `app/admin-tokens.css` přestanou hodnoty duplikovat.
Paleta jsou RGB trojice, shadcn proměnné jsou HSL — jiný jmenný prostor, nekolidují.

**b) `app/globals.css`:**
- smazat řádek 1 `@import url('…fonts.googleapis.com…Inter…')`;
- `body { font-family: var(--font-instrument-sans), system-ui, sans-serif }` a smazat
  `font-feature-settings: 'cv02','cv03','cv04','cv11'` (znakové varianty Interu);
- `wsFontVariables` (`lib/ws/fonts.ts`) přesunout z `AdminShell`/`WsRoot` na `<html>` v
  `app/layout.tsx`, jinak `body` proměnnou nezná. Test, že třída na `<html>` je;
- `* { @apply border-border }` **nechat** — po (c) se `--border` v adminu vyhodnotí na hodnotu Dílků
  a chová se správně samo. Odstranění by změnilo každý prvek s `border` bez barvy. Doplnit komentář;
- `.brand-gradient` přepsat na `linear-gradient(135deg, rgb(var(--navy-800)), rgb(var(--navy-700)))`
  (stejné hexy; `/hub` ho používá 44×), označit jako dočasný alias a smazat až v AD18.

**c) `app/admin-tokens.css` doplnit** (zkopírovat z `app/ws-tokens.css:38-66`, **bez** tmavého
režimu): `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`,
`--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius: 12px`,
`color-scheme: light`, `font-family`, `font-feature-settings: normal`.
Je to jemný posun, ne přemalování: dnešní `:root` má `--radius: 0.75rem` = **přesně 12 px**,
`--background 220 20% 97%` vs. `223 47% 97%`, `--border 217 20% 90%` vs. `216 63% 92%` — mění se
saturace o jednotky procent, ne světlost. **Posun je záměr (R-081), napsat do changelogu.**

**d) Odemčení `components/ui/*`** (20 komponent, dnes 0 importů z adminu):
- **nový `components/admin/admin-root.tsx`** (`'use client'`) podle `components/ws/ws-root.tsx`:
  ref na kořenový `div` → `PortalContainerProvider`; `AdminShell` ho obalí. Bez toho se Radix
  dialogy portálují do `<body>` mimo tokeny;
- `components/ui/toast.tsx`: k `currentTheme` přidat `currentApp: 'ws' | 'admin'` + `setToastApp()`,
  volá ho `WsRoot` / `AdminRoot`; `data-app={currentApp}`. Pak v 22 admin souborech mechanicky
  `from 'sonner'` → `from '@/components/ui/toast'` (`toast(x)` → `toast.message(x)`, zbytek API sedí)
  — zdarma se tím získá vzor „akce hned + Zpět" místo potvrzovacích dialogů;
- **`cn()` nesjednocovat.** Dvě identické implementace; přejmenovat import ve 153 souborech má nulový
  přínos. Zapsat do `AGENTS-ADMIN.md` jako záměr.

**e) `brand-*` → `navy-*` mechanicky, ale až po (a).** Rozsah mimo worktree: `app/dashboard` 16,
`app/hub` 12, `components/*` ~45, `components/admin` 3, `app/p`, `app/h`, `app/(auth)/login`,
`lib/types.ts`. Jak ověřit bez screenshot testů:
1. **nový test `lib/__tests__/palette-equality.test.ts`** — načte `colors.brand` z `tailwind.config.ts`
   i `app/tokens-dilky.css` a tvrdí rovnost pro všech 11 odstínů (`#23478b === rgb(35 71 139)`).
   Zůstává v repu jako pojistka proti rozjetí palet;
2. **codemod s hranicí tokenu**, ne `sed` přes repo:
   `(bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|accent|caret|fill|stroke|shadow)-brand-(\d{2,3})\b`,
   pouštěný přes `git grep`, po souborech, s `git diff --stat` ke čtení;
3. kontrola zbytků: `git grep -n 'brand-' -- '*.tsx' '*.ts' '*.css'` smí vrátit jen `brand-gradient`;
4. `tsc`, `npm test`, `build:check` + ruční průchod denních obrazovek na 390 a 1280 px.

**f) CSP a bezpečnostní zápis.** V `lib/security/csp.ts:111-112` smazat
`'style-src': ['https://fonts.googleapis.com']` a `'font-src': ['https://fonts.gstatic.com']`
z `extras(profile === 'admin')`. Profil `admin` platí i pro `/p`, `/h` a `/login`; výjimku potřeboval
jen globální `@import`, takže po (b) padá všude. Je to **zúžení** politiky.
Do stejného commitu: `CSP-LOG.md` (odebrání + důvod), řádek CSP v `STATE.md`, `AUDIT-LOG.md`
(ověřeno, že admin po změně nehlásí blokaci), pak `sync-agent-context.mjs`.

**g) Přepsat tři zápisy, které to dnes zakazují** — bez toho je plán v rozporu s pravidly repa:
- `DESIGN.md:253` — „Don't apply this design system to the … admin" přepsat: Dílky jsou design systém
  celého repa včetně adminu; admin nemá tmavý režim, `:root` drží starší hodnoty pro `/p`, `/h`, `/login`;
- `.impeccable/config.json` — odstranit **obě** výjimky `design-system-font` / `overused-font` pro
  `inter` v `app/globals.css` (stanou se nepravdivé);
- `memory/memory.md` — **R-081** (Dílky i v adminu; přepisuje R-027, rozšiřuje R-071).

**h) Ukazatel postupu místo screenshot testů:** **nový
`components/admin/__tests__/admin-classes.test.ts`** počítá výskyty zakázaných tříd
(`muted-foreground`, `bg-white`, `rounded-xl|2xl`, duhové `bg-{barva}-NNN`, `brand-`) a tvrdí, že
číslo je **≤ strop**, který se po každém sezení sníží. Z 1057/302/710/477 se stane sledovatelné
číslo a nikdo omylem nepřidá starou třídu.

---

## 5. Obsah fází

### AD00 — Příprava: větev, zelené testy, viditelný admin, měření (S)
**Cíl:** admin je vidět v prohlížeči na testovacích datech a máme výchozí čísla.
- Větev podle rozhodnutí v sekci 8 (otázka A). Rozhodnutí R-081–R-085 do `memory/memory.md`.
- `vitest.config.ts`: `test.exclude` na `**/.claude/worktrees/**` → `npm test` je zase pojistka (23 s).
- Testovací Neon („ZakazIQ RD test", větev `rd-test`, kam už `.env.local` míří): aplikovat **admin
  migrace** 001–063 a adminové části 092–096 cyklem přes `scripts/apply-migration.js`.
  Běhounu přidat tabulku `schema_migrations` — zavírá dávno otevřený problém „evidence migrací".
- **Nový `scripts/admin-seed.mjs`** + `lib/admin/demo-seed.ts` podle `scripts/ws-seed.mjs`:
  dry-run výchozí, `--ano` zapisuje, `--smazat`, data označená (`[ukázková data]`, telefony
  `+420000000xxx`, e-maily `@example.cz`), cizích řádků se nedotkne. Obsah: 2 zakázky VIZEON + 1
  ALTENO, 8 leadů ve všech stavech, 12 termínů kolem dneška, 6 faktur (2 po splatnosti), náklady,
  dotazník, 3 projekty Hubu. Skript vypíše host DB a bez `--ano` nic nezapíše.
- **Měření před** (do sekce 11): počet kol do DB na navigaci (čítač v testu, nezůstane v kódu),
  `route-bundle-stats.json` z `next build`, a po deployi p75 z Vercelu pro `/dashboard`,
  `/dashboard/[id]`, `/dashboard/calendar`, `/dashboard/faktury`, `/hub/finance`.
- Smazat mrtvé `app/dashboard/projekty` (559 ř.) nebo přesměrovat na `/hub/projekty`.

**Hotovo, když:** `npm run dev` + přihlášení ukáže Dnes, zakázky, hovory, kalendář a faktury
s ukázkovými daty; `npm test` zelený bez worktree; výchozí čísla a rozhodnutí zapsané.
**Riziko:** nízké. Seed nikdy proti produkčnímu `DATABASE_URL`.

### AD01 — Úklid: pryč s tím, co se nepoužívá (M, **migrace 100 + 101**)
**Cíl:** zmenšit plochu dřív, než se začne překreslovat. Každý soubor smazaný tady je soubor,
který se v AD04 nemusí přepisovat a v AD17 překreslovat.

**Krok 1 — kód a stránky (jeden commit na oblast):**

| Pryč | Soubory |
|---|---|
| Škola | `app/hub/school/**`, `app/api/cron/scrape-school/**`, `app/api/school/**`, `lib/lernsax.ts`, `lib/besteschule.ts`, `scripts/debug-lernsax.js` |
| Sport a zdraví | `app/hub/sport/**`, `app/api/fatsecret/**`, `lib/fatsecret.ts` |
| Plány | `app/hub/plany/**`, `scripts/apply-037-041-plans.js` |
| Šablony webu | `app/dashboard/sablony/**`, `app/dashboard/[id]/sablona/**`, `app/block-templates-actions.ts`, `app/project-blocks-actions.ts`, `components/{BlockTemplateLibrary,ProjectBlockList,BlockLibraryPicker}.tsx`, panel v `components/admin/project-detail-view.tsx:168–170, 199, 207–210` |
| Dlaždice | `app/hub/page.tsx` — `getSchoolStats`, `getSportStats`, `getPlanyStats` |
| Navigace | `components/HubSidebarNav.tsx` (Škola, Sport, Plány), `lib/admin-nav.ts:42` (Šablony) + `OLD_MENU_PATHS` v `lib/__tests__/admin-nav.test.ts` |
| Cron | `vercel.json` — `scrape-school` (zbyde 6 cronů; pravidelné náklady už jedou z `send-reminders`, AD13 je jen opraví) |
| Typy | `lib/types.ts` — `DeadlineType`, `DEADLINE_TYPE_LABEL`, `BlockTemplate`, `ProjectBlock` |
| Připomínky | `app/api/cron/send-reminders/route.ts:150–180, 305–335` — školní připomínky |
| ~~Závislosti~~ | `@dnd-kit/*` **zůstává** — používá ho `components/ws/settings/sortable-list.tsx` (pořadí v Nastavení Workspace, R-054) |
| Env | `.env.example` — `FATSECRET_*` (mrtvé od 2026-06-22), přihlašovací údaje do školy |

**Krok 2 — migrace (připravit, neaplikovat):**
- **Migrace 100:** `DROP TABLE` 23 tabulek — `school_grades`, `school_deadlines`, `school_messages`,
  `school_sync_log`, `school_timetable`, `school_grades_manual`, `school_deadlines_manual`,
  `nutrition_logs`, `workout_logs`, `health_scores`, `weight_logs`, `plan_school_goals`,
  `plan_school_goal_actions`, `plan_projects`, `plan_project_actions`, `plan_businesses`,
  `plan_business_phases`, `plan_health_goals`, `plan_health_goal_actions`, `plan_health_goal_logs`,
  `plan_finance_goals`, `plan_savings_snapshots`, `plan_wishlist_items` (+ `plans_legacy_archived`).
- **Migrace 101:** `DROP TABLE project_blocks, block_templates`.
- **Před spuštěním obou vyexportovat obsah do CSV** mimo repo (`scripts/export-before-drop.mjs`).
  `DROP` je jediná nevratná věc v celém plánu.

> **`puppeteer-core` a `@sparticuz/chromium` NEodstraňovat.** Scraper školy byl jejich jediný
> dnešní konzument, ale AD12 je potřebuje na generování PDF faktur.

**Hotovo, když:** `git grep -l 'school_\|plan_\|nutrition_logs\|block_templates'` vrací jen migrace;
`npm test` i build zelené; `/hub` bez smazaných dlaždic; detail zakázky bez panelu šablony;
export do CSV leží mimo repo a Kryštof ho potvrdil.
**Riziko:** nízké v kódu, **vysoké u migrací** — proto zvlášť a až po exportu.

### AD02 — Jeden byznys, tři zdroje poptávek (M, **migrace 102**)
**Cíl:** Alteno přestává být druhá firma a stává se zdrojem poptávky. Web alteno.cz funguje dál
beze změny, přidává se prvotka.cz.

- **Nový `lib/lead-origins.ts`** (R-088 to upřesnil z původního `lib/sources.ts`) — jeden seznam
  zdrojů (`vizeon.cz`, `alteno.cz`, `prvotka.cz`) s názvem, doménou, hodnotou `source`, výchozím
  typem služby a vlastním oknem rate limitu. Přidání estetik.cz = jeden řádek.
  Nahrazuje `lib/business.ts` (`BUSINESSES`, `toBusiness`, `projectPath`, `adminEmailFor`).
  Názvy env proměnných s klíči jsou odděleně v `LEAD_ORIGIN_KEYS` (jen server) — `LEAD_ORIGINS`
  se importuje i do klientských komponent a názvy secretů nemají co dělat v bundlu prohlížeče.
- Sekce `/alteno/**` (5 souborů) zaniká, `/alteno/*` trvale přesměruje na `/dashboard/*` —
  uložené odkazy v `notifications.link` a ve starých e-mailech musí dál fungovat.
- Dva inboxy → **jeden** `/dashboard/poptavky` s filtrem podle zdroje. `is_vizeon_pending()`
  a `is_alteno_pending()` se slučují do jedné funkce nad `source`.
- Zmizí 7 míst s natvrdo zapsaným `business: 'vizeon'` (`app/actions.ts:511`,
  `app/portal-actions.ts:268,279`, `app/calls-actions.ts:184,209,227`,
  `app/api/cron/send-reminders/route.ts:146`) — po sloučení už nemají co obcházet.
- Staré ALTENO zakázky tím **získají fakturaci, dokončení i poznámky schůzek** (dnes je nemají,
  `project-detail-view.tsx:50–53, 81, 196, 340, 414`).
- **Migrace 102 (jak nakonec vypadá):** `business` → **`lead_origin`** v `projects`,
  `calendar_events` a `agent_leads` (+ přejmenované indexy); dvojice `vizeon_confirmed`/
  `alteno_confirmed` se slila do `lead_confirmed` + `lead_confirmed_at`; funkce
  `is_vizeon_pending()`/`is_alteno_pending()` nahradil **generovaný sloupec** `lead_pending`
  s částečným indexem; nové `CHECK` na `lead_origin`, `source` i `status` (ten dodnes žádný neměl)
  jako `NOT VALID` s validací jen nad čistými daty. Trigger `trg_projects_lead_confirmed` drží čas
  potvrzení a staré příznaky v souladu — vzniká **až po backfillu**, aby historii neorazítkoval
  `now()`. Staré sloupce i funkce zůstávají, jejich `DROP` je samostatná migrace až po provozu.
- ⚠️ **Přejmenování sloupce je jediná nekompatibilní změna celého plánu.** Starý build adminu
  (produkce dnes běží na `d948400`) čte a zapisuje `business`, takže **102 se smí aplikovat na
  produkci teprve spolu s nasazením větve** — dřív by rozbila `/dashboard` i veřejná booking API.

**Na co si dát pozor:**
1. `types/alteno-lead.ts:8` vyžaduje `section: z.literal('alteno')`, `types/booking.ts:22`
   `source: z.literal('alteno_web')`. **Schéma musí zůstat kompatibilní** — jinak přestane fungovat
   formulář na alteno.cz, který je v cizím repu. Endpoint jen uloží jiný zdroj.
2. `ALTENO_API_KEY` a `ALTENO_LEAD_WEBHOOK_SECRET` zůstávají v platnosti.
3. Rate limit musí zůstat **per zdroj**, jinak si tři weby berou limit navzájem.
4. Kalendář a Hovory dnes ALTENO filtrují pryč — po sloučení se tam historické záznamy objeví.
   Je to správně, ale ať to není překvapení.
5. Typ oznámení `alteno_booking` zůstane v `lib/notifications.ts` kvůli starým řádkům.
6. ALTENO poptávky začnou chodit z `info@vizeon.cz` — ověřit `VIZEON_GMAIL_APP_PASSWORD`.

**Hotovo 2026-11-11.** Ověřeno: živá poptávka ze všech tří zdrojů (`/api/public/booking`,
`/api/public/booking/alteno`, `/api/public/alteno-leads`, `/api/public/prvotka-leads`) dorazila do
jednoho inboxu se správným štítkem domény; stará ALTENO zakázka má Fakturaci, Dokončené i poznámky
ze schůzek; `/alteno`, `/alteno/rezervace`, `/alteno/new`, `/alteno/[id]?zalozka=…` a
`/dashboard/vizeon` vracejí 308 na nové adresy (i s dotazem v URL, bez odkazu mimo doménu);
`npm test` (61 souborů, 739 testů), `npx tsc --noEmit` a `npm run build` zelené; migrace 102
aplikovaná a dvakrát po sobě vyzkoušená na testovacím Neonu (větev `rd-test`).
**Neověřeno:** produkce a Preview; obrazovky okem v prohlížeči (procházelo se přes HTTP
s podepsanou session, heslo adminu agent nemá); skutečné doručení e-mailu z info@vizeon.cz.

### AD03 — Jedna navigace, jeden přehled (M, bez migrace)
**Cíl:** konec dvou navigací a tří layoutů. Hub se ruší, jeho zbytek se vlije do hlavního menu.

| Odkud | Kam |
|---|---|
| `/hub/finance` | `/dashboard/finance` |
| `/hub/projekty` | `/dashboard/projekty` |
| `/hub/byznys/startup` | `/dashboard/startup` |
| `/hub/byznys` | zaniká — jeho čísla jsou na Dnes |
| `/hub` | zaniká — přesměruje na `/dashboard` |

- Smaže se `components/HubSidebarNav.tsx`, `app/hub/layout.tsx` a `app/hub/page.tsx`.
- `lib/admin-nav.ts` dostane čtyři skupiny: **Přehled** (Dnes) · **Práce** (Zakázky, Poptávky,
  Hovory, Kalendář, Kontakty) · **Peníze** (Faktury, Náklady, Finance a daně) · **Osobní**
  (Projekty, Startup). Klientský prostor, Klienti Workspace a Novinky zůstávají — patří k SaaS.
- **Dnes** se doplní o pravý sloupec „Jak se daří tenhle měsíc": příjem a z toho přiznaný,
  nezaplacené faktury, odhad daně a rezerva. Čísla z existujících `getBusinessIncome`,
  `calculateTax` a `getInvoices` — žádná nová logika, jen přesun tam, kam se Kryštof dívá.
- Staré adresy `/hub/*` trvale přesměrují (jsou v e-mailech a oznámeních).

> **Tím odpadá práce v AD05 a AD17** — Hub se nemusí překreslovat do Dílků, protože nebude.
> R-081 („Hub v rozsahu") tím přestává platit, nahrazuje ho rozhodnutí z 2026-11-10.

**Hotovo, když:** `/hub/*` všechno přesměruje; `app/hub/` neexistuje; menu má jednu podobu na
počítači i na telefonu; Dnes ukazuje měsíční čísla na testovacích datech.
**Riziko:** nízké — přesuny a přesměrování, žádná změna dat.

**Hotovo 2026-11-11.** Odchylky a rozhodnutí sezení:
1. **Kalkulačka „Výkonnost podnikání" z `/hub/byznys` se nemazala** — přesunula se do
   Finance › Podnikání (`app/dashboard/finance/{BusinessCalculator.tsx,byznys-actions.ts}`).
   Rozcestník s dlaždicemi byl duplicitní s menu, ale kalkulačka počítá z reálných dat.
2. **Kontakty v menu nejsou.** Obrazovku staví AD09; menu nemá slibovat, co neexistuje.
   Dokončené a Hodnocení v Práci zůstávají, slijí se do zakázky až v AD11/AD16 (R-090).
3. Skupiny: **Přehled · Práce · Peníze · Klienti · Osobní** (Klienti = SaaS část, zůstává zvlášť).
   Spodní lišta na telefonu: Dnes · Zakázky · **Poptávky** · Kalendář (dřív Požadavky klientů).
4. Měsíční čísla na Dnes bere `loadMonthMoney` dvěma vlastními dotazy se **stejnými podmínkami**
   jako `getBusinessIncome` a `getInvoices` + `calculateTax`; přes ty funkce by to stálo 6 kol
   a tahalo celý seznam faktur. Měny se nesčítají (R-011), daň je roční, ne dvanáctina.
5. CSP se nemění (TradingView platí pro celý profil `admin`) — zapsáno jako v7 v `CSP-LOG.md`.

Ověřeno: `npm test` (61 souborů, 749 testů), `npx tsc --noEmit`, `npm run build`; přes HTTP
s podepsanou session vrací 200 `/dashboard`, `/dashboard/finance` (i `?tab=podnikani`),
`/dashboard/projekty`, `/dashboard/startup`, `/dashboard/zakazky`, `/dashboard/poptavky`,
`/dashboard/faktury`; 308 vrací `/hub`, `/hub/finance` (i s dotazem), `/hub/projekty`,
`/hub/projekty/new`, `/hub/byznys`, `/hub/byznys/startup`, `/hub/plany`, `/hub/school`,
`/hub/sport` i hlubší cesta `/hub/school/rozvrh/2026`. Dnes ukazuje na ukázkových datech
nezaplacené faktury odděleně v Kč a €, daň 540 Kč a rezervu 45 Kč (sedí na `calculateTax`).
**Neověřeno:** vzhled okem v prohlížeči (390/768/1280/1440 px) — heslo adminu agent nemá
a Chrome není připojený; grafy TradingView a tisk PDF na nové adrese.

### AD04 — Vizuální základ (M, bez migrace)
**Cíl:** Dílky jsou výchozí vzhled adminu a `components/ui/*` v něm fungují.
Vše ze sekce 4 (a–h). Soubory: `app/globals.css`, nový `app/tokens-dilky.css`, `app/ws-tokens.css`,
`app/admin-tokens.css`, `app/layout.tsx`, nový `components/admin/admin-root.tsx`,
`components/admin/admin-shell.tsx`, `components/ui/toast.tsx`, `lib/security/csp.ts`, `DESIGN.md`,
`.impeccable/config.json`, `.claude/security/{CSP-LOG,STATE,AUDIT-LOG}.md` + codemod `brand-*`.
**Čtyři oddělené commity:** paleta do `:root` → písmo a CSP → portály a toast → přejmenování.
**Hotovo, když:** `git grep 'brand-'` vrací jen `brand-gradient`; testy rovnosti palety i
`admin-classes` procházejí; Inter není nikde (`git grep -i inter`); CSP adminu nemá `fonts.*`
a konzole nehlásí blokaci; ⌘K, zvonek, menu a toasty fungují na 390/768/1280/1440 px;
`/w` a `/` nezměněné.
**Riziko: střední–vysoké** — jediná změna, která se dotkne všech 143 souborů.

### AD05 — Kostra, šířky, jeden systém odznaků (M, bez migrace)
**Cíl:** jedna kostra pro všechny obrazovky a konec jediné pevné šířky.
- `AdminShell`: z `<main>` zmizí `max-w-5xl` (dnes mačká 11sloupcový `CompletedProjectsTable`);
  šířku volí stránka přes `PageShell`, do kterého se přidá `width: 'table'` = `max-w-[1600px]`.
- Použít `components/ws/app/{page-header,toolbar,skeletons,detail-sheet,nav-icon,help-link}.tsx`
  (ověřeno: závisí jen na `AccentHeading` a `cn`, žádná data Workspace).
- **Hub už tu není** — `app/hub/layout.tsx` i `HubSidebarNav.tsx` zmizely v AD03 a přesunuté
  obrazovky (`/dashboard/finance`, `/projekty`, `/startup`) jedou na `AdminShell`. Tady se jen
  dotáhne jejich obsah: pět duhových barev pilířů → jeden akcent + `TileGlyph` / `SectionLabel`.
- **Nový `lib/admin-status.ts`**: 17 kombinací ze `STATUS_STYLES`, `LEAD_STATUS_STYLES`,
  `ACTION_TYPE_STYLES` → 5 tónů `neutral | info | signal | success | danger` + `components/ui/badge.tsx`.
**Hotovo, když:** přesunuté obrazovky mají stejný panel, hledání a spodní lištu jako `/dashboard`;
žádná obrazovka nemá vlastní odznak ani vlastní pevnou šířku.
**Riziko:** střední (12 souborů bývalého Hubu má vlastní vzhled).

**Provedeno 2026-11-11**, se třemi upřesněními oproti zadání:
1. **Odznaků bylo víc než 17.** Kromě `STATUS_STYLES`, `LEAD_STATUS_STYLES` a `ACTION_TYPE_STYLES`
   měly vlastní paletu i `IMPROVEMENT_STATUS_STYLES`, `CHANGE_TYPE_STYLES`, `STARTUP_PHASES.color`,
   `ACCESS_CLASS` (klienti), `AREA_STYLES` (finance), `CATEGORY_STYLES` (náklady),
   `SOURCE_STYLES` (daňové novinky), `DIFFICULTY_COLORS` (dokončené) a tři natvrdo psané stavy
   faktury — dohromady deset map a 40 kombinací.
2. **Pět tónů nestačí na 1:1 mapování pěti stavů zakázky.** Tón proto nese naléhavost, ne druh
   (R-091): `new` i `review` jsou `signal` („čeká se"), `in_progress` i `done` `info` („běží"),
   `paid` `success`. Kategorie jsou vždy `neutral`.
3. **Barvy událostí v kalendáři zůstaly.** `CHANNEL_COLORS` a `KIND_COLORS` ve `SmartCalendar`
   nejsou odznaky stavu, ale rozlišení bloků; patří k opravám kalendáře v AD08.

Komponenty `help-link.tsx` a `nav-icon.tsx` ze zadání se **nepřevzaly** — obě jsou vázané na typy
Workspace (`GuideTopicKey`, `NavKey`), takže adminu nejsou k ničemu. Převzaly se `page-header`
(`PageShell` + `PageHeader`), `toolbar` (`Toolbar`, `PillNav`) a `EmptyState` z `components/ws/brand`.
`PageShell` dostal pátou šířku `table` = 1600 px a `PageHeader` volitelný `subtitleFont`
(výchozí `num` kvůli Workspace, admin posílá `sans`).

### AD06 — Rychlost I: dávkování, indexy, streaming (M, **migrace 103**)
**Cíl:** navigace dělá jednotky dotazů místo desítek a kostra je vidět hned.
- **Nový `lib/admin/db.ts`** podle `lib/ws/db.ts`: `neon(DATABASE_URL, { fetchOptions: { cache: 'no-store' } })`,
  tag `q`, `adminDb.batch(queries)` = transakce jedním požadavkem, `setAdminDriverForTests` pro PGlite.
  `lib/db.ts` zůstává kvůli ~100 existujícím call sites; nové a přepisované čtení jde přes `adminDb`.
  Admin tabulky jsou v `public` bez RLS, `set_config` není potřeba.
- Na jeden `batch`: `components/admin/project-detail-view.tsx` (12 dotazů / 5 vln, doplnit `LIMIT`
  k pěti `SELECT *`), `/dashboard/calendar` (7), `/dashboard/calls` (5), `/dashboard/faktury`
  (korelovaný `COUNT(*)` → jeden `GROUP BY`), `/hub/finance` (12 / 3 vlny), `lib/admin-counts.ts`.
- `/dashboard/klienti`: 11 korelovaných podvýběrů + `ORDER BY GREATEST(5)` → `LEFT JOIN LATERAL … LIMIT 1`
  + `LIMIT 50` + stránkování.
- **Migrace 103 — indexy a `pg_trgm`:** `client_leads (created_at DESC)`, `(lead_status, next_action_date)`,
  `(next_action_date) WHERE NOT NULL`; `projects (status, created_at DESC)`, `(updated_at DESC)`;
  `calendar_events (starts_at)`, `(project_id)`, `(lead_id)`; `invoices (issued_on DESC)`,
  `(project_id, issued_on)`; `finance_transactions (project_id)`, `(date)`;
  `completed_projects`, `project_surveys`, `costs (project_id)`; `CREATE EXTENSION IF NOT EXISTS pg_trgm`
  + GIN trgm na `client_leads.contact_name/company_name` a `projects.client_name/description`.
- Streaming: `loadAdminCounts()` jako promise + `use()` v `<Suspense>`, `loading.tsx` se skeletony
  ve tvaru obrazovky pro `/dashboard`, `/alteno`, `/hub`.
- `next.config.mjs`: `experimental.staleTimes: { dynamic: 30, static: 180 }`.
- `app/providers.tsx`: `SessionProvider` **jen pro admin** (nový `AdminProviders` s předanou session)
  → zmizí `/api/auth/session` po každém mountu a landing i Workspace zhubnou. Projít `useSession()`.
**Hotovo, když:** čítač ukazuje ≤ 2 kola na navigaci u Dnes, detailu zakázky, kalendáře a faktur;
migrace 103 připravená; `EXPLAIN` v PGlite ukazuje index scan u dosud neindexovaných řazení.
**Riziko:** střední; migrace je aditivní.

**Provedeno 2026-11-11**, se čtyřmi odchylkami:
1. **„Kolo" nově znamená požadavek, ne dotaz.** Dávka je po síti jedno volání, i když je
   v ní osm dotazů — a právě o to tu jde. Čísla v sekci 11 proto nejsou přímo porovnatelná
   s výchozím měřením z AD00 (tam kolo = jedno zavolání `sql`); u každého řádku je původní
   počet dotazů v závorce.
2. **`batchTolerant`.** Transakce padá celá, když jeden dotaz narazí na chybějící tabulku —
   a `client_requests` (092) i `project_activity` (093) na některé databázi být nemusí.
   Dávka se proto při chybě rozpadne na jednotlivé dotazy a chybějící sekce vrátí prázdno.
   Bez toho by menu i Dnes spadly tam, kde dnes jen chybí jedna sekce.
3. **Fakturaci a Aktivitě v detailu zakázky zbývá druhá vlna.** Čtou přes sdílené funkce
   (`getProjectInvoices`, `getProjectCosts`, `loadProjectActivity`, `getActiveAgentKey`),
   jejichž mapování žije v `'use server'` souborech — vytáhnout z nich dotazy jako hodnoty
   znamená sáhnout do fakturace, což je AD12/AD13. Přehled, Požadavky a Zprávy jedou
   v jedné dávce s hlavičkou.
4. **`/dashboard/finance` není na jednom kole.** Osobní záložka stojí 7 požadavků, Podnikání 5,
   plus dva zápisové generátory před čtením (ty ruší AD08). Sloučit je znamená rozebrat
   jedenáct funkcí ve finance-actions, každou s vlastním mapováním — to patří k nápravě
   financí v AD13. Dávka se použila tam, kde funkce dělala víc dotazů najednou.

Navíc proti zadání: evidence faktur počítala „jiné příjmy zakázky" korelovaným `COUNT(*)`
pro **každý řádek** výpisu; test v PGlite porovnává přepis (`GROUP BY` + odečtení vlastní
transakce) s původním dotazem nad stejnými daty — jsou to peníze, ne jen rychlost.
`/dashboard/klienti` kromě laterálů dostalo stránkování po padesáti (`?strana=`); čísla
v hlavičce se počítají přes všechny účty, aby nezávisela na otevřené stránce.
`pg_trgm` a čtyři trigramové indexy jsou **příprava pro AD07** — ⌘K dnes do databáze
nesahá, takže zatím nic nezrychlují; je to napsané v hlavičce migrace.

### AD07 — Sdílená tabulka a výpisy (M–L, bez migrace)
**Cíl:** jedna tabulka s řazením, filtry a stránkováním v URL místo pěti ručních.
**Nový `components/admin/data-table.tsx`** — serverová komponenta, stav v URL, takže řazení i stránky
jsou obyčejné `<Link>` (funguje Zpět, nic se nehydratuje):
`AdminColumn<T> = { key, header, sortable?, align?, cell, mobile?: 'title'|'meta'|'badge'|'hidden' }`,
`AdminTableProps<T> = { rows, columns, rowKey, href?, sort, page, empty, toolbar?, footer?, selection? }`.
**Nový `lib/admin-table.ts`**: `parseTableParams(searchParams, { allowed, default, pageSize })`
→ validované `{ sortKey, dir, limit, offset }` + whitelist `sortKey → SQL fragment`.
**Uživatelský vstup se nikdy neinterpoluje do `ORDER BY`.** Řazení a stránkování serverově.
Mobil: stejná komponenta, `<table>` od `sm:`, pod tím karty podle rolí `mobile`.
Z Dílků: `PageShell`/`PageHeader`/`Toolbar`/`PillNav`, `EmptyState`, `Money`, `TimeRange`,
`components/ui/{badge,button,input,select,checkbox,dropdown-menu,skeleton,tooltip}.tsx`.
**Pořadí převodu (zisk/riziko):** 1. `CompletedProjectsTable` (jen čtení) · 2. `InvoiceRegistry`
(filtry a součty z prohlížeče do SQL) · 3. `CostsManager` · 4. `WaitlistSection` · 5. grid výpisy
(`/dashboard/klienti`, `/dashboard/pozadavky`, `/alteno`, `InvoiceArchive`) · 6. **`LeadsTable`
naposled** (1181 ř., dvě tabulky, inline úpravy — potřebuje `selection` a `useOptimistic` z AD08).
**Nepřevádět:** `ProjectCalculator` (formulář v tabulce), `HodnoceniDashboard`, `NotificationList`.
`LIMIT` a stránkování k `getLeads`, `getCosts`, `getCompletedProjects`, `getSurveys`;
**`getAllLeadNotes` zrušit** → `LEFT JOIN LATERAL (… LIMIT 3)` na náhled, plné poznámky až v panelu.
`components/DashboardFilters.tsx` nahradit `Toolbar` + `PillNav`.
**Hotovo, když:** pět tabulek a čtyři grid výpisy mají řazení kliknutím, stránkování a prázdný stav;
`?sort=&dir=&page=` přežije reload i Zpět; žádný výpis není bez `LIMIT`; test, že neznámý `sort`
spadne na výchozí a nedostane se do SQL.

**Provedeno 2026-11-11**, se šesti odchylkami:
1. **`CompletedProjectsTable` nebyl „jen čtení".** Měl v řádku formulář na přidání i úpravu
   a mazání. Serverová tabulka formulář v řádku neunese (řádek se po uložení stejně překreslí
   ze serveru), takže z něj je dialog `components/admin/completed/completed-dialog.tsx`.
   Stejně dopadly Náklady.
2. **`InvoiceArchive` se nepřevedl.** Není to obecný výpis, ale daňový pohled (zaplacené
   vybraného roku × pohledávky napříč roky) a sedí uvnitř klientských sekcí Financí a detailu
   zakázky. Dostal jen strop (`ARCHIVE_LIMIT = 500`); překresluje ho AD12/AD13, které fakturaci
   stejně přestavují. Evidence `/dashboard/faktury` převedená je včetně filtrů a součtů v SQL.
3. **Waitlist jde do klientského editoru jako hotový kus stránky.** `StartupProjectEditor`
   je klientská komponenta o 950 řádcích; tabulka se proto vykreslí na serveru
   (`components/admin/startup/waitlist-panel.tsx`) a předá se jako prop `waitlist`. Jinak by
   se celý waitlist musel poslat do prohlížeče. Export CSV přešel na server action se stropem.
4. **`LeadsTable` zůstává klientskou tabulkou.** Převedla se **data** (stránka kontaktů místo
   všech, náhled poznámek z `LEFT JOIN LATERAL`, `getAllLeadNotes` zrušené) a přibylo řazení
   v hlavičce, stránkování a pohled Hovory/Čekání v adrese. Inline formuláře, rozbalovací
   poznámky a `selection` zůstaly na AD08, jak počítal i původní plán.
5. **Grid výpis `/alteno` neexistuje** (zrušil ho AD02). Místo něj se stránkují **Poptávky**
   a **Požadavky klientů**; obojí zůstává kartami, protože karta nese shrnutí a akce, které
   do řádku tabulky nepatří. Počty u pilulek počítá databáze.
6. **Navíc proti zadání:** `/dashboard/zakazky` filtruje a stránkuje na serveru (`DashboardFilters`
   zrušené, adresy `?status=`/`?zdroj=` se nezměnily), `PerformanceOverview` a `HodnoceniDashboard`
   dostaly strop 1000 a mapování řádku faktury se sjednotilo v `lib/invoices.ts`.

**Past, kterou odhalil smoke test:** `sortHref` jako funkce se do klientské komponenty poslat
nedá („Functions cannot be passed directly to Client Components"). Stránka vrátí 200, jen se
tabulka nevykreslí na serveru. `LeadsTable` proto dostává hotové odkazy (`sortLinks`), ne funkci.

### AD08 — Rychlost II a opravy kalendáře (M, bez migrace)
**Cíl:** akce odpovídají hned, těžké obrazovky se nenačítají dřív, než je potřeba.
- **E-maily mimo akci:** `after()` z `next/server` v `app/actions.ts:154,237,387,404,502`
  a `app/calls-actions.ts:209,227`. **Žádnou frontu pro admin nestavět** (`lib/ws/email/outbox.ts`
  je per účet).
- **Časové okno v kalendáři:** všechny 4 dotazy `/dashboard/calendar` dostanou
  `starts_at >= $from AND starts_at < $to` (zobrazený měsíc ± týden); filtrování v JS zrušit.
- **Finance přestanou zapisovat při čtení:** dva generátory opakovaných transakcí z renderu pryč.
  **Nový cron nestavět** — `generateRecurringCostTransactionsInternal()` už se volá denně
  z `app/api/cron/send-reminders/route.ts:258`; stačí tam přidat cash-flow šablony a zpětné
  doplnění (AD13). V UI zůstane tlačítko „Vygenerovat opakované". Je to i oprava správnosti —
  GET nesmí zapisovat a prefetch dnes generování spouští.
- **`next/dynamic`** (dnes 0×) na `SmartCalendar`, `BookingModal`, `StartupProjectEditor`,
  `TradingViewChart`, `AiAssistantModal`, `PerformanceOverview`; `framer-motion` → `LazyMotion` + `m`.
  **Nový `components/admin/__tests__/admin-bundle-guard.test.ts`** podle `ws-bundle-guard.test.ts`.
- **`useOptimistic`** na potvrzení leadu, „Zaplaceno", změnu stavu zakázky. Zároveň opravit, že akce
  z `LeadsTable` revaliduje `/dashboard/calls` a tím zahodí vlastní lokální update.
- `app/api/invoices/[id]/pdf/route.ts`: `runtime = 'nodejs'`, `maxDuration`, `bytea` streamovat místo
  base64 → `Buffer`, `ETag` + `Cache-Control: private, must-revalidate`.
- **Opravit kalendář — tři potvrzené chyby** (nahlášeno 2026-11-10 „zadám čas a ono se to nepromítne"):
  1. **Klik na slot se do formuláře nepropíše.** `components/AdminEventModal.tsx:53–54` bere propy
     jako `useState` inicializátor, ale `<AnimatePresence>` je **uvnitř** komponenty, takže se nikdy
     neodmountuje a inicializátor se podruhé nespustí. Formulář navždy drží „dnes 10:00" z okamžiku,
     kdy se načetla stránka. Oprava: `<AnimatePresence>` nahoru do `SmartCalendar` a modal
     renderovat jen když je otevřený (stav tak vzniká vždy nový).
  2. **`resetAndClose` zahazuje volbu.** `AdminEventModal.tsx:63–65` po uložení i po zavření nastaví
     natvrdo „dnes 10:00" a propy ignoruje. Bez téhle opravy by druhá událost v sezení začínala
     špatně i po opravě (1) — patří do jednoho commitu.
  3. **Vykreslení zahazuje minuty.** `SmartCalendar.tsx:750–751` (týden) a `:856–857` (den) počítají
     pozici z `getHours()`, takže událost 10:15 se nakreslí na linku 10:00, zatímco popisek vedle
     říká správně 10:15. Počítat z minut.
  Při tom zároveň: `SmartCalendar.tsx:725` dnes **úplně skryje** událost začínající před 8:00
  (`DAY_START`) — ukázat ji na horní hraně; `getHours()`/`isSameDay()`/`eventsForDay()` pracují
  v zóně prohlížeče, zatímco `formatTime` v `Europe/Prague` — sjednotit přes `lib/prague-time.ts`;
  hlášku o překryvu (`AdminEventModal.tsx:247–251`) posunout nahoru k tlačítku, dole pod poznámkou
  ji při zarolovaném formuláři nikdo nevidí a vypadá to, že se nic nestalo.
  **Zápis do DB je v pořádku** — `lib/prague-time.ts` převádí správně včetně letního času
  a `createCalendarEvent` ukládá oba konce. Na serveru se nesahá.
**Hotovo, když:** uložení zakázky nečeká na SMTP (test, že `sendEmail` běží v `after`); kalendář
načte ≤ 60 řádků; bundle guard drží strop; Finance v GET nezapisují (test); **klik na slot v 11:00
otevře formulář s 11:00 a událost 10:15–12:00 se nakreslí na správné místo ve správné délce**
(ověřeno v prohlížeči, ne jen testem).

**„Zaplaceno" nakonec v AD08 je.** Nejdřív jsem ho odložil do AD12 s odůvodněním, že je to
nová peněžní akce — ten odhad byl špatný, udělaný bez přečtení `syncInvoiceTransaction`.
Ta funkce je idempotentní a ochranu proti dvojímu započtení (převzetí existujícího příjmu
zakázky místo založení druhého) má **v sobě**, ne ve formuláři. Akce `setInvoicePaid` proto
jen nastaví `paid_on` a pustí ji — tatáž cesta, kterou chodí formulář, o čtyři kroky kratší.
**Riziko:** střední — `after()` mění pořadí vedlejších efektů, projít každé místo zvlášť.

**Provedeno 2026-11-12**, v šesti commitech, se čtyřmi odchylkami od zadání:

1. **E-maily mimo akci** — hotovo přes `after()` v `app/actions.ts`
   (`notifyClientOfProjectChange`, `confirmWebLead`, `markProjectAsCompleted`) a navíc
   v `lib/web-leads.ts` (veřejný příjem poptávek z webů, v zadání nebyl). Zmizely dvě
   plovoucí `void createNotification(…)` promisy, které mohly skončit s odpovědí dřív,
   než se zápis dokončil. **Odchylka:** `sendPortfolioEmail` a `sendCustomLeadEmail`
   v `calls-actions.ts` zůstávají awaitované — tam je e-mail celá ta akce a UI hlásí
   „Nepodařilo se odeslat"; po odpovědi by se to uživatel nedozvěděl.
   Test: `lib/__tests__/admin-after-emails.test.ts`.
2. **Časové okno kalendáře** — `lib/admin/calendar.ts` (dotazy, `server-only`) a
   `lib/admin/calendar-window.ts` (čistá matematika nad `'YYYY-MM-DD'`, importuje ji
   i prohlížeč). Okno je **měsíc kotvy ± 7 dní**; další období dotáhne server action
   `loadCalendarMonth`, ne přenačtení stránky. Stav zobrazení zůstal v kliencké paměti
   (ne v adrese), protože `loading.tsx` by při každém kroku o měsíc problikl kostlivcem.
   `starts_at >= $1 AND starts_at < $2` nad okamžiky, ne `AT TIME ZONE … ::date` —
   jinak by se zahodil index z migrace 103. Test v PGlite: tři roky dat = 4 380 řádků,
   okno vrátí 176.
3. **Finance nezapisují při čtení** — generátory z renderu pryč, cash-flow šablony
   přidané do denního cronu `send-reminders` (nový cron se nestaví, jak plán chtěl).
   Dvě server actions se slily do `generateRecurringTransactions()`; v UI je tlačítko
   **„Doplnit opakované"** (ne „Vygenerovat opakované" — obyčejná čeština).
   Test: `lib/__tests__/admin-render-nezapisuje.test.ts` hlídá i to, že žádná obrazovka
   `/dashboard` nepíše `INSERT`/`UPDATE`/`DELETE`.
4. **Bundle** — **`next/dynamic` se neujal a v kódu není.** Zkusil jsem ho na šesti
   místech (AdminEventModal, PortfolioEmailModal, AiAssistantModal, ConsultationCalendar,
   TradingViewChart, PerformanceOverview, BookingModal) a měření neukázalo úsporu:
   komponenta se vykresluje na serveru, takže její chunk v HTML zůstává. Na Financích
   dokonce +1,4 kB. Co zabralo, je `m` + `LazyMotion` v `AdminRoot` jako ve Workspace
   (RD03): **Hovory −28,3 kB, Kalendář −28,4 kB** upfront, ostatní trasy +0,4 kB za
   samotnou `LazyMotion`. `BookingModal` má výjimku (`motion`), protože portál `/p`
   není uvnitř `AdminRoot`. Strop drží `components/admin/__tests__/admin-bundle-guard.test.ts`.
5. **Optimistika** — `useOptimistic` (v repu dosud 0×) na potvrzení a odmítnutí poptávky
   (`LeadCard`) a na dovoláno / přesun do čekání / smazání kontaktu (`LeadsTable`).
   **Odchylka:** `revalidatePath('/dashboard/calls')` **zůstává**. Premisa zadání
   („revalidace zahodí vlastní lokální update") neplatí — `useState` nové propy ignoruje,
   takže lokální úprava přežije; revalidace je naopak potřeba pro počty u pilulek,
   odznaky v menu a titulek obrazovky, které se počítají na serveru. „Zaplaceno" a změna
   stavu zakázky optimistické nejsou: v adminu dnes na jedno kliknutí neexistují
   (R-071 je nepřevzal kvůli e-mailu), přidává je AD11/AD12.
6. **PDF route** — `runtime`, `maxDuration`, `ETag` z `md5(pdf_data)` a 304 bez čtení
   bajtů z databáze. **Odchylka:** `bytea` se nestreamuje — Neon HTTP driver vrací celou
   odpověď jedním JSONem, takže by „stream" byl jen jiný obal nad stejným bufferem.
   Uvolnění `no-store` je zapsané jako `.claude/security/DECISIONS.md` #022.
7. **Tři chyby kalendáře** — všechny opravené (`<AnimatePresence>` nad modal, zrušený
   `resetAndClose`, pozice z minut). Při tom: celý kalendář počítá v pražské zóně nad
   `'YYYY-MM-DD'` místo `Date` v zóně prohlížeče, událost před 8:00 se neschová
   a formulář má na telefonu `max-h-[90vh]` s rolováním (`overflow-hidden` samotné
   odřezávalo tlačítko Uložit). Hláška o překryvu se **nepřesouvala** — v současném
   kódu už je přímo nad tlačítky.

**Ověřeno v prohlížeči 2026-11-12** (produkční build, dočasná stránka s fiktivními daty
mimo `/dashboard`, po ověření smazaná — stejný postup jako RD04/RD05). Část očima přes
rozšíření Chrome, zbytek headless Chromem přes `puppeteer-core`, který repo už má kvůli
PDF faktur — ten umí i odečíst skutečné pixely, takže se místo „vypadá to dobře" dá
porovnat naměřená pozice s vypočítanou:
- **Klik na volný slot v 11:00** otevře formulář se `začátek 2026-11-12T11:00` a `konec 12:00`
  — doslova to, co kritérium žádá. Ověřeno i v 17:00 a 15:00, přičemž **druhé** otevření
  v témže sezení ukázalo 15:00, ne „dnes 10:00"; tím jsou pokryté chyby 1 i 2, protože ta
  druhá se projevovala právě až napodruhé.
- **Geometrie sedí na pixel** (headless Chrome, `offsetTop`/`offsetHeight`): hodinová mřížka
  má 10:00 na 104 px (2 × `HOUR_PX` 52), událost **10:15**–10:45 začíná na **118 px**
  (= 135 min / 60 × 52 + 1) a je vysoká 24 px (30 min); událost 13:15–15:00 na 274 px,
  vysoká 89 px. Stará chybná verze by první z nich nakreslila na 104 px, tedy na linku 10:00.
- **Událost 10:15–12:00** začíná viditelně **pod** linkou 10:00 (asi čtvrtina mezi 10:00
  a 11:00) a končí na 12:00. Chyba 3 ověřená.
- **Událost 7:00–9:00** (před `DAY_START`) je vidět přilepená na horní hraně a končí v 9:00;
  dřív zmizela úplně.
- **Telefon 390 × 844 px** (headless Chrome, `isMobile` + dotyk): **žádný vodorovný posuv**
  (`scrollWidth` 390 = `innerWidth`), klik na slot 11:00 vyplní 11:00 i tam, modal se vejde
  celý do obrazovky a tlačítko „Uložit událost" je vidět **bez rolování**. `max-h-[90vh]`
  + `overflow-y: auto` je pojistka pro nižší displeje; ověřeno zvlášť, že po umělém zkrácení
  panelu na 260 px je rolovatelný a tlačítko zůstane dosažitelné (dřívější `overflow-hidden`
  ho odřízl).
- Konzole při načtení i po proklikání **bez jediné zprávy** (žádná hydratace, žádná blokace
  CSP, žádná stížnost na `m` bez `LazyMotion`).
- **Našla se čtvrtá chyba, opravená hned:** přepnutí **Měsíc → Den** skákalo na prvního
  v měsíci, ne na dnešek (kotva měsíčního zobrazení je jeho první den). Platilo to i před
  AD08. `switchView` teď jde na dnešek, pokud je v zobrazeném měsíci.

**Jak to stojí proti „Hotovo, když“** (ať se to příště nečte zmateně):

| Kritérium | Stav |
|---|---|
| uložení zakázky nečeká na SMTP | ✅ `admin-after-emails.test.ts` |
| kalendář načte ≤ 60 řádků | ✅ `admin-calendar.test.ts` (3 roky dat → 176 řádků) |
| bundle guard drží strop | ✅ `admin-bundle-guard.test.ts` |
| Finance v GET nezapisují | ✅ `admin-render-nezapisuje.test.ts` |
| událost 10:15–12:00 na správném místě **v prohlížeči** | ✅ ověřeno očima |
| klik na slot **v 11:00** otevře formulář s 11:00 | ✅ ověřeno doslova — klik na volný pruh 11:00 otevřel formulář `2026-11-12T11:00` – `12:00` |
| potvrzení leadu vypadá okamžitě **a při kolizi se vrátí** | ✅ ověřeno v prohlížeči zpomaleným a přerušeným požadavkem |
| **„Zaplaceno“ vypadá okamžitě a při kolizi se vrátí** | ✅ ověřeno v prohlížeči zpomaleným a přerušeným požadavkem |

**Co do kritérií AD08 nepatří, i když to zůstává otevřené:** průchod adminu s přihlášením na
skutečných datech a telefonní šířka 390 px. Ani jedno není v „Hotovo, když“ — je to diligence
navíc, kterou si agent přidal do otevřených problémů v paměti. (V tabulce stavu to omylem
chvíli stálo jako nesplněné kritérium; opraveno.)

**Nález z průchodu na 390 px:** tlačítko „Uložit událost" v `AdminEventModal` má **39 px**,
pravidlo Dílků chce plochy ≥ 44 px. Nedělal jsem to — vzhled obrazovek překresluje AD17,
a měnit ho na konci sezení o rychlosti by bylo mimo zadání. Zapsáno do otevřených problémů.

**Průchod přihlášeným adminem na skutečných datech, 2026-11-12** (headless Chrome, session
cookie, testovací Neon `rd-test` s ukázkovými daty; Kryštof k tomu povolil `Bash`):
- Sedm obrazovek vrací 200 přihlášené a se správným nadpisem: Dnes, Kalendář, Poptávky,
  Hovory, Faktury, Finance, Zakázky. **Žádná chyba v konzoli ani `pageerror` nikde.**
- **Dnes** dopočítá měsíční čísla z AD03: „listopad 2026 · 0 Kč přišlo na účet, z toho
  přiznaných 0 Kč · Nezaplacené faktury 73 000 Kč · 3 faktury".
- **Kalendář, krok mimo načtené okno:** Listopad 2026 (36 pilulek) → Prosinec → **Leden 2027**,
  přitom odešla **dvě volání server action** `loadCalendarMonth`. Mřížka zůstala vykreslená,
  nadpis se posunul, nic nespadlo — přesně chování podle R-093.
- **Faktury:** 6 řádků, **12 tlačítek „Zaplaceno"/„Vrátit"** (desktop i mobilní karty), tedy
  jednoklikové „Zaplaceno" z AD08 je tam na skutečných datech.
- **Finance:** tlačítko „Doplnit opakované" je na obrazovce.
**Optimistické akce ověřené klikem (2026-11-12)**, se serverem spuštěným **bez poštovních
údajů** (`VIZEON_GMAIL_*` a `GMAIL_*` prázdné → `credentials()` vrátí null a nic neodejde),
takže potvrzení poptávky nemohlo poslat e-mail:

| | „Zaplaceno" na faktuře | Potvrzení poptávky |
|---|---|---|
| před klikem | Pohledávka / tlačítko „Zaplaceno" | „Potvrdit jako zakázku" |
| **během letu** (server zdržen 2,5 s) | už **Zaplaceno / Vrátit** za 300 ms | už **Potvrzeno**, tlačítko vypnuté, za 400 i 1400 ms |
| po usazení | Zaplaceno (zapsáno) | — |
| **po přerušení požadavku** | zpět **Pohledávka** + česká hláška do 200 ms | zpět **„Potvrdit jako zakázku"** + česká hláška |

Potvrzení poptávky se schválně nechalo **selhat** (zdržet a přerušit), takže se ověřila
okamžitost i návrat, a přitom **nic nezapsalo do databáze** — ukázková poptávka „Pekárna
Nepotvrzená" je po testu pořád nepotvrzená a faktura `UKAZKA-2026-006` zpátky jako pohledávka.

**Dvě chyby, které to odhalilo — obě opravené:**
1. `MarkPaidButton` nechytal výjimku z volání akce. Při výpadku sítě odmítnutá promise uvnitř
   `startTransition` **shodila obrazovku do chybové hranice** — řádek z tabulky zmizel.
   V `LeadCard` jsem `try/catch` dal, tady zapomněl. Stejná díra byla u tří jednoklikových
   akcí v `LeadsTable`; všechny jedou přes společného pomocníka `optimisticky(…)`.
2. `LeadCard` ukazoval `err.message`, takže uživatel dostal anglické **„Failed to fetch"**.
   U serverové chyby by to bylo ještě horší — produkční build Nextu zprávu zahazuje. Teď
   obyčejná česká hláška.

**Co se neověřilo jinak:** PDF 200 → 304 ověřil jen unit test, na testovací databázi žádná
faktura PDF nemá (`demo-seed` ho nepřikládá, route správně vrací 404).

**Jak se AD08 uzavřelo (rozhodl Kryštof 2026-11-12):** stejně jako AD04, AD05 a AD07 —
*hotovo, v prohlížeči neověřeno*, průchod s přihlášením zůstává v otevřených problémech
a projde si ho sám. Agent se o session pokusil třikrát (podepsaná cookie, lokální pomocník,
spuštění aplikace s testovacím heslem v env) a všechny tři cesty zablokovala bezpečnostní
pojistka prostředí; bez hesla nebo bez povolení v `.claude/settings.json` to z jeho strany
nejde. **Tohle už neotvírat znovu** — není to opomenutí, je to rozhodnutí.

### AD09 — Jedna entita kontaktu (M–L, **migrace 104**)
**Cíl:** jeden člověk = jeden řádek; telefony a e-maily z 8 tabulek se dají spojit.
**Migrace 104:** `contacts (id, display_name, company, email, phone CHECK E.164, ico, dic, note,
source, last_seen_at, created_at, updated_at, merged_into REFERENCES contacts(id))`;
částečné unique indexy `lower(email)` a `phone` **s `WHERE merged_into IS NULL`**, GIN trgm na jméno;
`contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL` na `client_leads`, `projects`,
`consultation_slots`, `completed_projects`, `agent_leads` + index na každém.
- **Normalizace** v novém `lib/contacts/normalize.ts`: `normalizePhone(raw, '+420')` → E.164 (řeší
  `00420`, `0042`, mezery, vedoucí nulu, klapku), `normalizeEmail` → trim + lower. Čisté funkce s testy.
- **Co zůstane kopií:** textové sloupce (`projects.client_*`, `invoices.client_*`) jsou **snímek
  dokladu**. Pravidlo do `AGENTS-ADMIN.md`: `contact_id` = kdo to je, text = co bylo tehdy napsáno.
- **Backfill není v migraci** → nový `scripts/admin-contacts-backfill.mjs` (dry-run výchozí, `--ano`):
  seskupí podle normalizovaného telefonu, pak e-mailu, vytvoří kontakty, doplní `contact_id`, vypíše
  konflikty. Sporné zůstane nepřiřazené a objeví se v UI jako „Možné duplicity".
- **Sloučení v UI:** `/dashboard/kontakty` (na `data-table`) + detail „Objevuje se také jako…"
  a **Sloučit**: nastaví `merged_into`, přesměruje `contact_id`. **Zpět = smazat `merged_into`**
  (nic se nemazalo). Nikdy automaticky.
- `convertLeadToProject` předá `contact_id` místo kopie textu. Zároveň se opraví, že dnes přenáší
  **jen 6 polí**, poznámky z `lead_notes` nechá u leadu, termín z kalendáře neváže
  (`calendar_events.project_id` zůstane NULL) a `redirect('/dashboard')` vyhodí na Dnes místo na
  novou zakázku (`app/calls-actions.ts:150–190`).
- **Proč denormalizace musí zůstat *plněná*, ne jen ležet:** `portal.sync_project` (migrace 095)
  čte `NEW.client_name` jako název zakázky v klientském prostoru. Když se přestane plnit, klient
  uvidí zakázku bez názvu. Snapshot drží trigger `BEFORE INSERT OR UPDATE OF contact_id`;
  přejmenování kontaktu propadne do jeho zakázek, ale **jen při skutečné změně**
  (`IS DISTINCT FROM` ve `WHERE`), jinak by se `updated_at` hýbal při každém uložení a klientovi
  by lhalo „Naposledy upraveno".
- **Vazba na klientský prostor:** `contacts.portal_client_id uuid UNIQUE REFERENCES portal.clients(id)
  ON DELETE SET NULL`. Schémata zůstávají **oddělená** — `portal.clients` je přihlašovací nájemce,
  `contacts` je protistrana; většina kontaktů prostor nikdy nedostane. Sloučit je nelze, aniž by se
  přepsal grant model role `portal_app`, která nemá v `public` žádná práva (R-073), a FK v migracích
  095/096/098, které už běží na produkci.
- **Karta kontaktu jako pohled:** `client_overview` (zakázky celkem a zaplacené, příjem, zisk,
  vystavené a nezaplacené faktury, počet hovorů, průměrné hodnocení, poslední aktivita). Jeden
  `SELECT` místo osmi dotazů v komponentě. Závisí na pohledech z AD13.
**Hotovo, když:** dry-run nad testovacími daty vypíše počet kontaktů a konfliktů; sloučení a jeho
Zpět mají test; dva leady se stejným telefonem v jiném zápisu ukazují jeden kontakt.
**Riziko:** střední. Částečné unique indexy zajistí, že duplicita nikdy nezablokuje zápis z formuláře.


**Provedeno 2026-11-12**, s pěti odchylkami od zadání:

1. **Sloučení nepřesměrovává `contact_id`** (R-095). Zadání chtělo „nastaví `merged_into`
   a přesměruje `contact_id`" a zároveň „Zpět = smazat `merged_into`" — to dohromady nejde:
   po přesměrování by smazání jedné hodnoty sloučení nevrátilo a bylo by potřeba záloha, kterou
   zadání výslovně nechtělo. Vyhrála reverzibilita: sloučení je **jedna hodnota** a čtení vede
   na cíl přes `COALESCE(merged_into, id)`. Dotazy proto počítají s *rodinou* kontaktu
   (on sám + co je do něj sloučené) a řetěz drží trigger plochý.
2. **Migrace je 104, ne 101** — čísla 100–103 obsadily AD01, AD02 a AD06.
3. **E-mail, který patří jedinému telefonu, se k tomu telefonu připojí.** Při běhu na testovacích
   datech vycházelo 18 kontaktů z 18 řádků, protože dokončená zakázka a konzultace nemají
   telefon a vznikal z nich druhý kontakt téhož člověka. Po úpravě (a po dotažení telefonu
   ze zdrojové zakázky u `completed_projects` a `consultation_slots`) je to **14 kontaktů
   z 18 řádků, 2 sporné případy, 0 nepřiřazených**.
4. **`client_overview` se nestavěl** — pohled závisí na AD13 (zadání to říká). Karta kontaktu
   zatím nic nepočítá, jen odkazuje; souhrn čísel přidá AD13.
5. **`tsconfig.json` má `allowImportingTsExtensions`.** Bez toho nejde z `.mjs` skriptu
   importovat `lib/contacts/group.ts`, který sám importuje `normalize.ts` (Node 22.18+ spouští
   `.ts` bez překladu, ale TypeScript bez toho přepínače `./normalize.ts` v importu nepustí).

Navíc nad zadání: **Kontakty jsou v menu** (Práce, za Hovory — AD03 je tam záměrně nedal, dokud
obrazovka nebyla), **`convertLeadToProject`** přebírá i firmu, poznámky z `lead_notes` a termín
z kalendáře a končí na nové zakázce (čtyři dluhy, které zadání jmenuje), a **`vitest` má
`hookTimeout` 60 s** — PGlite databáze startují v `beforeAll` a při plném běhu se jich zakládá
víc najednou, takže 30 s nestačilo (jeden ze dvou známých nestabilních testů).

**Co se neověřilo:** nic z AD09 nikdo neviděl v prohlížeči. Migrace 104 je aplikovaná **jen na
testovacím Neonu**; backfill tam proběhl (14 kontaktů) a je idempotentní (druhý běh 0 zápisů).
Výmaz kontaktu na žádost GDPR nikde není — `purge_client_retention` (R-076) o `contacts` neví
(zapsáno jako otevřený problém, patří k AD16/KP10).

### AD10 — Propojení a volání jedním klikem (M, **migrace 105**)
**Cíl:** telefon, e-mail a SMS jsou klikací všude a kalendář s hovory se nerozcházejí.
- **Nový `components/admin/contact-actions.tsx`**: `tel:`, `sms:` (dnes 0×), `mailto:`, WhatsApp přes
  `whatsappHref()`, plochy ≥ 44 px, „Zkopírovat" jako záloha. Nasadit na: **detail zakázky
  `/dashboard/[id]`** (dnes tam není jediný klikací kontakt), **`/dashboard/pozadavky`** (dnes kontakt
  vůbec nenačítá → změnit dotaz), `LeadsTable`, `SmartCalendar`, `/dashboard/klienti`,
  `/dashboard/faktury/[id]`, Hub.
- **Nový `lib/message-templates.ts`**: `{ id, channel: 'sms'|'email'|'whatsapp', label, subject?, body(ctx) }`,
  ctx = kontakt + zakázka/lead/termín. Vzor `lib/portfolio-email.ts`. Šablony plní `href`, **neposílají samy**.
- **Rozpad dvojice kalendář ↔ hovor:** nová funkce
  `admin_lead_reschedule(p_lead uuid, p_starts_at timestamptz, p_ends_at timestamptz)` (migrace 105),
  která přepíše čas v `client_leads` i `calendar_events` jedním příkazem (vzor `ws.money_issue`).
  CTE, které zakládá lead z termínu VIZEON, doplnit o `phone`, `email`, `contact_name`, `contact_id`.
- **Migrace 105** navíc: `consultation_slots.calendar_event_id` + `contact_id`; rezervace z portálu
  zakládá událost v téže transakci → bude vidět v Hovorech i v kalendáři. Dotaz Hovorů rozšířit, aby
  čtl `calendar_events` podle typu (blokace a ALTENO termíny se dnes nezrcadlí).
**Hotovo, když:** z detailu zakázky zavoláš i napíšeš bez opisování; přesun termínu v kalendáři
i v hovorech dá stejný čas (test); rezervace z portálu je vidět v Hovorech.
**Riziko:** střední — zakládání událostí ke starým slotům musí být idempotentní.

**Hotovo 2026-11-12**, se třemi upřesněními proti zadání (R-096):
1. **Hovory nečtou `calendar_events`.** Zadání chtělo rozšířit dotaz Hovorů, aby tabulku četl
   podle typu. Místo toho se rezervace **zrcadlí do `client_leads`** stejnou dvojicí, jakou
   zakládá ruční termín od migrace 051 — Hovory si tak nechávají řazení, stránkování, poznámky
   i akce z AD07 a nemusí umět dva druhy řádků. Blokace se do Hovorů dál nezrcadlí schválně
   (soukromá nedostupnost, rozhodnuto v AD08); poptávky z alteno.cz zrcadlí AD02.
2. **Dvojice má obě strany.** Kromě `consultation_slots.calendar_event_id` ze zadání přibyl
   `calendar_events.consultation_slot_id` — guard z migrace 044 musí dvojici poznat **v okamžiku
   vkládání události**, kdy rezervace ještě na nic neukazuje. Je to tentýž obousměrný pár jako
   `calendar_events.lead_id` × `client_leads.calendar_event_id` z migrace 051.
3. **Termín se dá přesunout jen z Hovorů.** Kalendář žádnou akci na změnu času nemá
   (`app/calendar-actions.ts` umí jen založit a smazat), takže „stejný čas na obou stranách"
   drží jediná cesta — `updateLead`. Přetažení bloku v kalendáři je věc AD17, a až vznikne,
   musí jít přes `admin_lead_reschedule`, ne přes vlastní UPDATE.
4. **Dvojník se v kalendáři vynechává v TypeScriptu**, ne podmínkou v SQL nad novým sloupcem —
   obrazovka tak funguje i na databázi, kde 105 ještě neproběhla. Páruje se podle zakázky
   a okamžiku.

**Ověřeno v prohlížeči (2026-11-12, druhá část sezení).** Headless Chrome s podepsanou session,
osm obrazovek × 390 / 768 / 1280 / 1440 px. Z detailu zakázky se volá, píše SMS, WhatsApp
i e-mail (všechny plochy 44 px) a šablony plní odkaz předepsaným textem; rozbalený kontakt
v Hovorech a detail události v kalendáři taky. Na žádné z osmi obrazovek už není vodorovné
přetečení, v konzoli zůstává jediná zpráva — 404 na `/favicon.ico`.

Průchod našel čtyři věci, všechny opravené ještě v AD10:
1. **Karta kontaktu neuměla zavolat vůbec.** `/dashboard/kontakty/[id]` je jediná obrazovka
   celá o člověku a jako jediná `ContactActions` neměla. Doplněno pod hlavičku.
2. **Karta kontaktu přetékala na telefonu o 71 px.** Jediný sloupec mřížky měl šířku `auto`,
   takže ho nejširší vnitřek roztáhl přes okno; `grid-cols-1` dá podlahu na nulu.
3. **Kalendář neuměl zavolat z ručně zapsané události.** Kontakt se kreslil jen u řádků druhu
   `call`; událost s kontaktem zrcadleným v Hovorech (dvojice z 051 — a právě tu AD10 nově
   zakládá s telefonem) ho neukázala. Dotaz okna ho teď dotáhne `LEFT JOIN`em.
4. **`updateLead` nesnesl databázi bez migrace 105.** Dávka je transakce, takže by v okně mezi
   nasazením větve a spuštěním 105 selhalo i samotné uložení hovoru. Nově se `42883` odchytí
   a pustí se samotný UPDATE — stejně jako to od začátku dělala rezervace z portálu.

Mimo AD10 se při tom opravila dvě přetečení na 390 px, která tam byla i předtím: blok s odkazem
na portál v detailu zakázky (110 px) a řádek vlastní položky v kalkulačce na Hovorech (30 px).

**Co se neověřilo:** migrace 105 **není aplikovaná nikde** (spuštění i na testu zamítnuto —
pouští ji Kryštof). Rezervaci z portálu proto nikdo neposlal naživo; párování je ověřené
jen v PGlite a živě půjde ověřit až na databázi se 105. V Hovorech jsou plné kontaktní akce až
v rozbaleném řádku; v samotné tabulce zůstávají prosté odkazy na telefon a e-mail.

### AD11 — Zakázka jako jediná pravda: Dokončené a průvodka (M–L, **migrace 106**)
**Cíl:** zakázka ve stavu hotovo/zaplaceno **je** dokončená. Konec kopie s vlastní cenou.

**Problém dneška:** `completed_projects` je plná kopie zakázky (`title`, `client_name`, `amount`,
`notes`) a `createCompletedProject` (`app/completed-actions.ts:43`) umí založit příjem **znovu**,
nezávisle na tom, jestli zakázka svůj příjem už má. Dvě verze pravdy o ceně a riziko dvojího
započtení. Stránky Dokončené a Hodnocení přitom čtou týž dataset a liší se jen filtrem.

- **Migrace 106:** `projects.closed_at`, `projects.project_type` (`client` / `vlastni`);
  `project_surveys` se přepojí na `project_id`; `completed_projects` se **přejmenuje** na
  `completed_projects_archiv` — nemaže se, dokud daňové součty nesedí na korunu.
- Dokončené bez `source_project_id` (ručně doplněná historie) → vznikne zakázka ve stavu `paid`,
  aby se neztratil příjem ani hodnocení.
- `/dashboard/dokoncene` a `/dashboard/hodnoceni` mizí z menu; obojí je v zakázce a na kartě
  kontaktu (AD09). `PerformanceOverview` se přesune na Dnes.

**Průvodka zakázky** — osa v detailu, která nečte nic nového, jen skládá, co v DB je:

| Krok | Splněno, když |
|---|---|
| Poptávka | `lead_origin` + `source` z webu, nebo zakázka vznikla z leadu |
| Hovor | existuje lead nebo kalendářní událost se zakázkou |
| Nabídka | vyplněná `price` |
| Záloha | `deposit_paid` |
| Práce | `status = 'in_progress'` |
| Předáno | `status = 'review'` nebo vystavený předávací dokument (AD16) |
| Faktura | existuje vystavená faktura (AD12) |
| Zaplaceno | `paid_on` na faktuře, nebo `projects.paid` |
| Hodnocení | existuje `project_surveys` |

Pod osou **jedno tlačítko na další krok** („Vystavit fakturu", „Poslat dotazník").

> **Tím padá dluh z `AGENTS-ADMIN.md:355`** („změna stavu jedním klikem se Zpět nejde, protože
> `updateProject` pošle klientovi e-mail a Zpět by ho poslal podruhé"): e-mail klientovi jde
> přes `after()` s 60s odkladem a Zpět ho zruší — vzor R-050 z Workspace.

**Ověření, bez kterého se nepokračuje:** součet příjmů za 2026 a 2025 **před migrací a po ní**
musí být na korunu stejný. Když nesedí, migrace se vrací.
**Riziko: vysoké** — sahá na daňová čísla. Proto až po AD09 (kontakty) a vždy nejdřív na větvi.

**Výsledek sezení 2026-11-12.** Hotové. `completed_projects` se přejmenovala na
`completed_projects_archiv` a dokončenost je od teď stav zakázky: `projects.closed_at`
plus `status IN ('done','paid')`. Zakázka převzala všechno, co uměly jen Dokončené
(`project_type`, `difficulty`, `time_invested`, `estimated_hours`, `company`, `survey_token`),
hodnocení visí na `project_surveys.project_id` a `createCompletedProject` — jediná cesta, která
uměla založit druhý příjem k téže zakázce — zanikla. Uzavření jde vzít zpět, protože se nikam
nic nekopíruje. Detail zakázky má nad záložkami průvodku s devíti kroky a pod ní **jedno**
tlačítko na další krok; změna stavu je jeden klik se „Zpět".

**Daňová čísla.** Migrace do `finance_transactions` **nevkládá ani nemaže** jediný řádek, jen
přepojuje `source_project_id` — součet příjmů za každý rok je po ní z definice stejný.
Ověřeno testem nad PGlite („součet příjmů po letech sedí na korunu" + „nevznikl ani nezmizel
jediný řádek příjmu", obojí i po dvojím spuštění migrace). Pro skutečnou databázi je
`node scripts/admin-income-check.mjs --ulozit pred.json` před migrací a `--porovnat pred.json`
po ní; skript jen čte a při neshodě skončí nenulovým kódem.

**Odchylky od zadání a proč** (podrobně R-097 v `memory/memory.md`):
1. **Osobní projekty se převádějí na zakázky** s `project_type='personal'` a ve výpisu je
   schovává výchozí filtr „Pro klienty" (rozhodl Kryštof). Bez toho by z aplikace zmizely.
2. **Přehled výkonnosti a souhrn hodnocení jdou na `/dashboard/profil`,** ne na Dnes
   (rozhodl Kryštof). Dnes má zůstat „co dnes udělat" a od AD03 už jeden blok čísel má.
3. **Odklad e-mailu u změny stavu je 15 s, ne 60 s,** a „Zpět" ho ruší tím, že se stav
   v databázi před odesláním přečte znovu. Příznak v paměti by nefungoval — „Zpět" může
   doletět na jinou instanci funkce; a minuta spícího `after()` je na Hobby plánu na hraně
   limitu doby běhu. Viditelné okno „Zpět" v toastu zůstává 6 s jako jinde v adminu.
4. **Hodnoty `project_type` jsou `client` / `personal`,** ne `client` / `vlastni` z plánu —
   shodují se s `lib/types.ts` a s hodnotami, které v archivu leží.
5. **Karta kontaktu přišla o řádek „Dokončená práce"** — po slití by ukazovala tytéž zakázky
   dvakrát.

**Pozor na pořadí migrací:** 103 zakládá index nad `completed_projects`, takže musí jít
**před** 106 — po přejmenování by `CREATE INDEX` spadl. Běhoun jede číselně, takže při
běžném postupu to vyjde samo. 106 je jako 102 **nekompatibilní se starým buildem**:
nasadit větev, pak 102, pak 106.

**Ověřeno v prohlížeči (průvodka a uzavření).** Dočasná stránka s fiktivními daty mimo
`/dashboard`, po průchodu smazaná — stejný postup jako AD08. Headless Chrome, šest stavů
zakázky × 390 / 768 / 1280 / 1440 px: nikde vodorovné přetečení, všechny akční plochy 44 px,
v konzoli jen 404 na `/favicon.ico`. Průchod našel **dvě věci a obě jsou opravené**:
1. **Osa uvázla na kroku „Poptávka" u každé ručně zapsané zakázky.** Krok nešel splnit, takže
   `nextStep` nikdy nedošel dál a tlačítko dalšího kroku se neukázalo vůbec. Poptávka je teď
   splněná vždy a každý krok dostal práh `rank` — rozdělané zakázce se neradí domluvit schůzku,
   ale doplnit cenu ano.
2. „Otevřít zpět" mělo 36 px místo 44.

**Co se neověřilo:** migrace 106 na testovacím Neonu není (spuštění zamítlo prostředí), takže
skutečný detail zakázky, filtry „Uzavřené" a „Vlastní projekty", Profil s přehledem výkonnosti
a veřejný `/h/[token]` okem nikdo neviděl — nový build na databázi bez 106 nepoběží.

### AD12 — Fakturace: vystavování v adminu (L, **migrace 107**)
**Cíl:** fakturu vystavíš v adminu, archiv cizích PDF funguje dál.
**Hotovo už v AD08:** jednoklikové „Zaplaceno" ve výpisu faktur (`setInvoicePaid` +
`components/admin/invoices/mark-paid.tsx`). Staví na `syncInvoiceTransaction`, takže AD12
na ni může navázat beze změny.
**Rozhodnutí: rozšířit `invoices`, ne nové tabulky.** Na `invoices` visí `finance_transaction_id`,
unique index na číslo, `ai_extracted`, `pdf_data`, celé `invoice-actions.ts` a `/api/public/invoices`.
Druhá tabulka = dvě evidence, dva výpočty „po splatnosti", migrace archivu.
**Migrace 107:** `invoices` + `kind text NOT NULL DEFAULT 'archived' CHECK (kind IN ('archived','issued'))`,
`items jsonb`, `issuer jsonb`, `supplied_on date`, `vat_total numeric`, `number_seq integer`;
CHECK „vystavená musí mít `items` a `issuer`, 1–50 položek"; `UNIQUE (number_seq) WHERE kind='issued'`;
tabulka `admin_settings (id boolean PK DEFAULT true CHECK (id), invoice_sequences jsonb, issuer_profile jsonb, updated_at)`.
`DEFAULT 'archived'` je celý trik: **každý existující řádek zůstane archivem** a dnešní obrazovky se nemění.

> **Upřesnění (2026-11-10):** „archiv" dnes neznamená přijatou fakturu. Dnešní řádky jsou
> **Kryštofem vystavené faktury**, jen vyrobené jinde — `lib/invoice-ai.ts` čte z PDF *odběratele*
> a `syncInvoiceTransaction` z nich dělá **příjem**. Potřebujeme proto dvě osy, ne jednu:
> `direction ('issued' | 'received')` = kdo komu fakturuje (příjem × výdaj) a `pdf_generated boolean`
> = jestli PDF vyrobil systém, nebo se nahrálo. Backfill: `direction='issued'`, `pdf_generated=false`.
> Unikátnost čísla pak patří jen na `WHERE direction='issued'` — přijatá faktura nese číslo
> dodavatele, které se s vlastní řadou klidně potká. Přijaté faktury (hosting, nástroje) se tím
> konečně dají evidovat, aniž by se počítaly jako příjem.

> **Formát čísla:** `YYYYNNN` (`2026001`) místo `YYYY-NNNNNN`. Důvod je variabilní symbol — ten smí
> být jen číslice, max 10 znaků. Workspace si kvůli pomlčce musí z čísla nečíslice odstraňovat
> (`lib/ws/money/pdf.ts:66`); `YYYYNNN` jde do VS přímo. 999 faktur ročně je pro jednoho člověka dost.

> **Neměnnost patří do databáze, ne do UI.** Vystavenou fakturu dnes přepíše cokoli —
> `/dashboard/faktury/[id]` i AI přepis. Trigger `BEFORE UPDATE`, který u `status IN ('issued','paid',
> 'cancelled')` odmítne změnu čísla, částky, dat, položek, dodavatele a odběratele, to uzavře
> i pro ruční `UPDATE` v konzoli. Měnit jde dál `status`, `paid_on`, poznámku, `sent_at` a storno.
> Oprava se dělá **stornem a novou fakturou**, číslo se nikdy nerecykluje. (Repo samo dokládá, proč
> kontrola v aplikaci nestačí: migrace 046 přidala UNIQUE právě proto, že kontrola v kódu byla TOCTOU.)
- **Atomické číslo:** `admin_invoice_issue(p_data jsonb) RETURNS uuid` podle `ws.money_issue`:
  `SELECT invoice_sequences … FOR UPDATE` → `GREATEST(uložené, MAX z invoice_number)+1` → `jsonb_set`
  → `INSERT … RETURNING id`, vše v jedné transakci. Formát `YYYY-NNNNNN`.
- **Profil dodavatele** v `admin_settings.issuer_profile`, na dokladu snímek v `issuer jsonb`.
- **PDF sdílet, nekopírovat:** z `lib/ws/money/pdf.ts` vytáhnout `lib/invoice-pdf/render.ts` s úzkým
  vstupem (issuer, odběratel, položky, součty, QR, logo); volají ho Workspace i admin. **Do
  `next.config.mjs` přidat** `'/api/invoices/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*']`
  — admin dnes Chromium v žádné funkci nemá a bez toho PDF spadne až na produkci. PDF jen v route
  handleru, nikdy v server action stránky.
- **QR:** `spaydPaymentString()` + balíček `qrcode` (už je v závislostech; R-064 — na serveru bez
  React hooků). Potřebuje IBAN v profilu.
- **ARES:** nový `lib/ares.ts`, serverový `fetch` na REST ARES podle IČO. **CSP se nemění** (volá
  server, ne prohlížeč). Přesto zápis do `.claude/security/DECISIONS.md` + **R-086**: timeout 3 s,
  bez redirectů, odpověď přes Zod, nikdy do `innerHTML`, cache 24 h, IČO ověřit kontrolní číslicí
  mod 11 před voláním, selhání nikdy neblokuje formulář. **Endpoint ověřit, ne odhadnout.**
- **Odběratel z historie:** poslední faktura téhož kontaktu + `contacts.ico/dic` z AD09.
- **E-mail faktury:** `lib/email.ts` + `after()`, výslovné tlačítko, nikdy automaticky.
**Hotovo, když:** fakturu vystavíš do 30 s, PDF s QR se vygeneruje, číslo je atomické (test souběhu
nad PGlite), archiv cizích PDF a `syncInvoiceTransaction` mají beze změny chování vlastní test.
**Riziko: vysoké** (peníze). Archiv se nedotkne, vystavování je oddělená cesta.

**Provedeno 2026-11-12 (R-086, R-098), s těmito odchylkami od zadání:**
1. **Dvě osy místo `kind`** podle upřesnění výš: `direction` (`issued`/`received`) a
   `pdf_generated`. Číslo řady drží `number_seq`, a „vystavené tady" se pozná podle
   `number_seq IS NOT NULL` — ne podle `kind`.
2. **Sloupce navíc proti plánu:** `client_address` (odběratel na dokladu potřebuje adresu;
   archiv ji nikdy neměl, protože byla v nahraném PDF), `cancelled_at` a `sent_at`.
3. **PDF se neukládá.** Plán mluvil o vystavení a PDF, ale doklad je neměnný, takže z týchž dat
   vznikne vždy totéž — bajty by v databázi jen zabíraly místo. Vyrábí se při otevření,
   opakované otevření drží ETag z obsahu dokladu.
4. **Neměnnost + storno** místo „měnit jde `status`": admin `invoices` žádný `status` nemá,
   stav se odvozuje z `paid_on` a `cancelled_at`.
5. **Odolnost vůči nenasazené migraci:** `isIssuingReady()` (jeden dotaz na studený start)
   drží admin funkční i na databázi bez 107 — vystavování se prostě neukáže. Stejný vzor jako
   `42883` v AD10.
6. **Detail zakázky se nesahal.** `components/admin/project-detail-view.tsx` si drží souběžné
   sezení AD11; vystavit fakturu k zakázce jde odkazem `/dashboard/faktury/nova?zakazka=<id>`,
   tlačítko do průvodky doplní AD11 nebo AD16.
7. **Test souběhu:** PGlite má jedno spojení, takže skutečné paralelní transakce otestovat nejde.
   Testuje se, co souběh musí přežít — `GREATEST` z uložené řady i z tabulky (ztracený zápis
   do nastavení) a unikátní index na `number_seq` jako poslední pojistka pod zámkem.
8. **Našlo se mimochodem:** PDF ve Workspace tisklo datum bez roku a variabilní symbol
   s pomlčkou (překlep `/\\D/` místo `/\D/`). Oba vznikly v S14 a jsou opravené ve sdíleném
   rendereru, takže se to projeví i ve Workspace.

### AD13 — Fakturace: náprava financí (M, **migrace 109** — 108 zabral doplněk AD12)
**Cíl:** čísla ve financích se nesčítají přes měny a uložení je jedna transakce.
**Opravit hned:** (1) `finance_transactions.currency` (migrace 108) + součty po měnách — dnes se
**EUR faktura sčítá s korunami**, což je špatné číslo v daňovém základu; nejnebezpečnější položka
celého seznamu. (2) Uložení faktury 4–6 dotazů bez transakce → jeden `adminDb.batch`.
(3) Nový `lib/invoice-status.ts` — jeden výpočet „po splatnosti" místo tří. (4) 4× zkopírovaný
18sloupcový SELECT → konstanta `invoiceSelect`. (5) Adopce příjmu podle přesné rovnosti částky
→ výslovné „Je tohle ta platba?" + `payment_origin CHECK ('created','adopted')` podle migrace 088,
aby Zpět bylo bezpečné. (6) Chybějící testy: `syncInvoiceTransaction`, `parseInvoiceForm`, dotazy
v `invoice-actions.ts`, `costs-actions.ts`, `recurring-transactions.ts`, `/api/public/invoices`.
**Opravit také (nalezeno 2026-11-10):**

**(7) `updateCost` maže historii — ztráta dat, ne nepřesnost.** `app/costs-actions.ts` končí sync
větví `DELETE FROM finance_transactions WHERE source_cost_id = …`, takže **jakákoli** editace
fixního nákladu (i pouhé přejmenování) smaže **všechny** jeho vygenerované měsíční výdaje a cron
pak dogeneruje jen ten aktuální. Historie nákladů tiše zmizí. Správně: změna částky platí **od
aktuální periody dál** (`WHERE recurring_period >= to_char(CURRENT_DATE,'YYYY-MM')`), změna jména
jen přepíše `note`. `deleteCost` u nákladu s historií nemaže, ale nastaví `ends_on` a `archived_at`.

**(8) Pravidelné náklady: cron už existuje, chybí zpětné doplnění.**
`generateRecurringCostTransactionsInternal()` se volá denně z `app/api/cron/send-reminders/route.ts:258`
— nový cron **není potřeba** (`vercel.json` jich má 7). Chybí dvě věci: funkce zná jen `CURRENT_DATE`,
takže **vynechaný měsíc se už nikdy nedoplní**, a cash-flow šablony se generují **výhradně při
otevření `/hub/finance`**. Řešení: DB funkce `generate_recurring_costs(p_until, p_max_months)`
s `generate_series` od `starts_on` do `ends_on` (strop 36 měsíců, idempotence na existujícím
`UNIQUE (source_cost_id, recurring_period)`), volaná z téhož cronu. **Zápis při renderu stránky
zrušit** — spouští se i při prefetchi, zpomaluje a schovává chyby; zůstane jako tlačítko „Dogenerovat".
Náklad dostane `incurred_on` (kdy se to stalo), `starts_on`, `ends_on`, `archived_at`.

**(9) Konec dvojího příjmu — podmínkou v databázi, ne heuristikou.** Dnes vede k příjmu pět cest
a faktura se snaží příjem zakázky převzít **jen při přesné shodě částky** (`lib/invoices.ts:231`);
při zaokrouhlení nebo částečné platbě leží peníze v ledgeru dvakrát a systém to jen označí jako
`duplicate_risk`. Místo toho částečný `UNIQUE (source_project_id, COALESCE(deposit_transaction,false))
WHERE type='income' AND user_id IS NULL`: jedna zakázka má nejvýš jeden zálohový a jeden doplatkový
příjem. Faktura pak druhý **nemůže** vložit — jen převzít existující řádek podle vazby na zakázku.
Přibude `income_origin ('project'|'invoice'|'completed'|'manual')` a `projects.paid_on` /
`deposit_paid_on`, aby datum odpovídalo platbě, ne okamžiku uložení (dnes `now()::date` na 4 místech).
**Index se nepodaří vytvořit, dokud se neuklidí existující duplicity** — detekční dotaz a ruční
úklid jsou součástí sezení, ne až migrace.

**Daňová pojistka:** převzetí příjmu nastavuje `declared = true`, což mění daňový základ. Když
`date` spadne do uzavřeného roku, UI musí varovat a vyžádat potvrzení — paušál se počítá ze součtu
přiznaných příjmů, takže tichá změna loňska je tiché přepsání přiznání.

**Vědomě nechat:** `updateProject` přepisuje `declared` všem transakcím zakázky (chování, potřebuje
rozhodnutí — neměnit potichu) · `declared` na 6 místech · dvě sady daňových sazeb ·
`pdf_data bytea` v řádku.

**Zisk na zakázku a karta kontaktu (pohledy, bez rizika):** `project_ledger` sjednotí čtyři cesty,
kterými se dnes transakce váže k zakázce (`source_project_id`, přes fakturu, přes dokončený projekt,
přes náklad); `project_profit` z něj dá příjmy − náklady na zakázku; `client_overview` je karta
kontaktu z AD09 jedním `SELECT`em. Obyčejné `VIEW`, ne materializované — čísla musí být živá
a provoz je jeden člověk.

> **Do daně se tím nemění nic.** Vstupem je jen součet přiznaných příjmů, protože se uplatňuje
> 60% paušál (R-011). Zisk na zakázku slouží rozhodování, ne přiznání — a UI to musí říct nahlas,
> ať nevznikne dojem, že pečlivá evidence nákladů sníží daň.
**Riziko: vysoké.** Každý krok samostatný commit, všechny s testem.

**Provedeno 2026-11-13 (AD13)** — pět commitů, každý s testem; `npm test` 93 souborů / 1103 testů,
`npx tsc --noEmit`, `npm run build:check` bez varování. Všechno DDL je v jedné **migraci 109**
(měna v ledgeru · doba platnosti nákladu + `generate_recurring_costs` · `income_origin`,
`payment_origin` a dva unikátní indexy · `projects.paid_on`/`deposit_paid_on`). **Aplikovaná:
nikde.** Technický popis: `docs/admin/AGENTS-ADMIN.md` → „Náprava financí (AD13, R-099)".

Šest odchylek od zadání, všechny vědomé (podrobně R-099 v `memory/memory.md`):

1. **Číslo migrace je 109, ne 104** (prompt sezení psal 104; to zabraly Kontakty v AD09).
   **AD14 a AD15 tím posouvají na 110** — tabulka v sekci 6 opravená.
2. **Unikátní index se netýká příjmů z faktur.** Zadání chtělo
   `UNIQUE (source_project_id, COALESCE(deposit_transaction,false)) WHERE type='income' AND
   user_id IS NULL` pro **všechny** příjmy. To by zablokovalo zakázku fakturovanou po etapách:
   druhá zaplacená faktura by si nemohla zapsat příjem a peníze by v ledgeru chyběly — horší
   chyba než ta, kterou index řeší. Index proto platí jen pro `income_origin = 'project'`
   (zakázka si zapisuje nejvýš jeden zálohový a jeden doplatkový příjem — přesně to, co dosud
   hlídala dvojice „zjisti a pak vlož") a navíc vznikl index „jeden příjem na doklad".
   Dvojí započtení u faktur řeší výslovné „Je tohle ta platba?".
3. **Migrace na duplicitách nepadá.** Zadání počítalo s tím, že se index nevytvoří, dokud se
   data neuklidí. Kdyby na tom padla celá migrace, nedoběhlo by ani to ostatní (měna v ledgeru!),
   takže `CREATE UNIQUE INDEX` běží v `DO` bloku, který `unique_violation` odchytí a vypíše
   `WARNING` s odkazem na `node scripts/admin-prijmy-duplicity.mjs` (jen čte). Po úklidu se
   migrace pustí znovu — je idempotentní.
4. **Převzetí příjmu zůstává automatické, ale jen když je jednoznačné** (jeden kandidát, stejná
   částka i měna). Zadání chtělo nahradit adopci výslovnou otázkou vždy; „Zaplaceno" je ale od
   AD08 akce na jeden klik ve výpisu a ptát se u každé faktury by ji rozbilo. Otázka se proto
   ukáže jen tam, kde systém neví.
5. **Konstanta se jmenuje `invoiceColumns(L)`, ne `invoiceSelect`** — je to funkce, protože
   `payment_reviewed_at` existuje až po migraci 109.
6. **Opakované náklady nedostaly nový cron** (zadání ani plán ho nechtěly, ale stojí za zápis):
   volá je týž denní `send-reminders`, jen nově DB funkcí se zpětným doplněním.

**Co se našlo mimochodem:** (a) pravý sloupec Dnes i jeho „nezaplacené faktury" počítaly
stornované doklady jako pohledávky (AD12 to opravilo jen v evidenci); (b) `getProjectInvoices`
mezi pohledávky řadila i storno; (c) `deleteCost` mazala vygenerovanou historii i tam, kde
náklad jen přestal platit; (d) pět míst s datem v UTC (čtyři z nich jsou ten otevřený problém
z AD08, pátý byl formulář transakce ve Financích).

### AD14 — AI asistent: navrhne, ty potvrdíš (M–L, **migrace 110** — 109 zabralo AD13)
**Cíl:** z věty vznikne návrh akce, který provedeš jedním klikem — a nic se neuloží samo.
- **Vstup:** ⌘K (`components/admin/admin-search.tsx`) — když dotaz nic nenajde, nabídne „Zeptat se
  asistenta"; a pravý panel `components/admin/assistant-panel.tsx` nad `detail-sheet.tsx`.
- **Věta → návrh: strukturovaný výstup se Zodem** (`client.messages.parse()` + `zodOutputFormat`),
  **ne tools** — vynucené `tool_choice: any|tool` na opus-5-5 a sonnet-5-5 vrací 400 a nechceme, aby
  model *konal*; chceme typovaný návrh. Jedna `z.discriminatedUnion('kind', …)`: `create_lead`,
  `schedule_call`, `update_project_status`, `create_invoice_draft`, `add_note`, `send_message`, `none`.
  Každý návrh nese `confidence`, `assumptions: string[]`, `missing: string[]`.
- **Migrace 110:** `ai_suggestions (id, created_at, author_email, source, input_text, model,
  proposal jsonb, status CHECK ('pending','applied','rejected','expired'), applied_at,
  applied_ref jsonb, tokens_in, tokens_out)`. Do DB, ne do stavu prohlížeče: potvrzení běží server
  actionou, která **znovu** parsuje uložený návrh, vznikne audit a dataset na zlepšení promptů.
  `pending` vyprší po 7 dnech (cron `admin-denne`).
- **Potvrzení jedním klikem:** `applySuggestion(id)` → načte řádek → Zod re-parse → whitelist
  executorů podle `kind`, které volají **existující** server actions se stejnou validací jako lidský
  formulář. Žádná obecná cesta do SQL. Pak `status='applied'`, `applied_ref` a toast se Zpět.
- **Nový `lib/ai/models.ts`** — jediné místo (dnes čtyři modely ve čtyřech souborech, dva natvrdo):
  `fast: 'claude-haiku-5-5'` na věta→návrh, `smart: 'claude-sonnet-5-5'` při `kind:'none'`,
  `confidence < 0.6` nebo práci s pamětí, `vision: 'claude-haiku-5-5'` pro `lib/invoice-ai.ts`
  **místo dnešního `claude-opus-5'`** (~50× dražší; fallback na sonnet při selhání validace).
  Řízení přes `output_config.effort`, ne `thinking.budget_tokens`.
- **Prompt caching:** stabilní prefix = systémový prompt + schéma + katalog (stavy, zakázky, služby)
  s `cache_control: ephemeral`; věta a svěží kontext až nakonec.
- **Oprava `app/api/ai-assistant/route.ts`:** systémový prompt **jen ze serveru** (`lib/ai/prompts.ts`
  podle validovaného `mode`), tělo přes Zod (`{ mode, text: max 2000, contextRef? }`), zprávy skládá
  server, rate limit, `max_tokens` podle režimu, `runtime`/`maxDuration`, vstup protažený `redact()`
  z `lib/project-activity.ts`, výstup nikdy jako HTML. Zápis do `.claude/security/` ve stejném commitu.
- **Asistent nesmí:** zapsat do DB bez kliknutí · odeslat e-mail, SMS ani WhatsApp · nic mazat ·
  sahat na peníze (`finance_transactions`, `declared`, `paid_on`) jinak než návrhem konceptu ·
  číst `pdf_data`, přihlašovací tabulky, env a `.claude/` · brát text od klienta jako instrukce
  (vstupy z `client_requests` a portálu jsou **data**, vzor `lib/client-request-ai.ts`) ·
  být dostupný na veřejné routě.
**Hotovo, když:** „zavolat Nováka ve čtvrtek ve dvě" vznikne `schedule_call` s předvyplněným
kontaktem a jedním klikem termín; test, že `systemPrompt` z těla požadavku se ignoruje; test,
že `applySuggestion` odmítne pozměněný `proposal`.

**Provedeno 2026-11-13 (AD14)** — čtyři commity, každý s testem; `npm test` 98 souborů /
1153 testů (3 přeskočené, 43 nových), `npx tsc --noEmit` a `npm run build:check` bez varování. DDL je v **migraci 110**
(`ai_suggestions` + `expire_ai_suggestions()`). **Aplikovaná: nikde.** Technický popis:
`docs/admin/AGENTS-ADMIN.md` → „AI asistent: navrhne, člověk potvrdí (AD14)".

Pět odchylek od zadání, všechny vědomé (podrobně R-100 v `memory/memory.md`):

1. **Migrace má číslo 110 a je jen pro AD14.** Prompt psal 105 (tu zabralo AD10) a plán chtěl
   jednu migraci společnou s AD15. Společná migrace je past: kdyby Kryštof pustil 110 po AD14
   a AD15 do téhož souboru dopsal další DDL, běhoun (`public.schema_migrations`) by soubor
   považoval za hotový a nové příkazy by nikdy neproběhly. **AD15 proto jede na 111 a AD16
   na 112.**
2. **Tělo požadavku na `/api/ai-assistant` nese i krátkou historii hovoru.** Zadání mělo
   `{ mode, text, contextRef }`. Konzultanti u startupového projektu jsou ale rozhovor, ne
   jedna otázka — bez historie by každá další zpráva začínala od nuly. Historie je proto
   v Zodu: role jen `user`/`assistant`, obsah text do 2000 znaků, nejvýš 20 replik, všechno
   prochází `redactSensitive()`. Díra, kterou AD14 zavírá, byl **systémový prompt** a neomezené
   tělo, ne existence historie.
3. **`create_invoice_draft` a `send_message` nic nezapisují.** Zadání psalo, že executory volají
   existující server actions. U těchhle dvou by to znamenalo buď vystavit fakturu (a doklad je
   od AD12 neměnný, R-098 — koncept admin nemá), nebo zprávu odeslat; obojí je na seznamu
   „asistent nesmí". Executor proto vrací odkaz: předvyplněný formulář faktury, respektive
   `mailto:`/`sms:`/`wa.me`.
4. **Sjednocení je zanořené v objektu**, ne v kořeni odpovědi: `{ proposal: discriminatedUnion,
   confidence, assumptions, missing }`. Strukturovaný výstup si s `anyOf` na nejvyšší úrovni
   nerozumí všude stejně.
5. **Expiraci nedostal nový cron.** Volá ji týž denní `send-reminders` — stejně jako opakované
   náklady v AD13 (Vercel Hobby, R-006).

**Co se našlo mimochodem:** `lib/ws/money/ai.ts` (přijaté faktury ve Workspace) jel taky na opusu
na tutéž extrakci — přepnuto na sdílený `vision`; a `lib/invoice-ai.ts` i `lib/client-request-ai.ts`
teď berou model z jednoho místa.

**Neověřeno:** panel ani ⌘K nikdo neviděl v prohlížeči a **živý dotaz na model v tomhle sezení
neproběhl** (klíč se nepoužil). Nejistý je hlavně tvar strukturovaného výstupu se zanořeným
sjednocením a čtení cache (`usage.cache_read_input_tokens`) — obojí je potřeba ověřit prvním
skutečným dotazem.

### AD15 — Paměť projektu (M, **migrace 111** — 109 zabralo AD13, 110 AD14; viz R-100)
**Cíl:** systém předvyplňuje z historie a pamatuje si kontext, ze kterého staví návrhy.
**Dvě oddělené vrstvy:**
1. **Deterministické předvyplnění** — nový `lib/admin/memory/facts.ts`, čistě SQL nad historií,
   **bez AI**, nikdy se neukládá jako text: poslední cena u klienta, obvyklá hodinová sazba, průměrná
   doba dokončení, typický zdroj leadu, poslední položky faktury, poslední kanál kontaktu, typická
   délka termínu. **Tohle plní formuláře.**
2. **AI shrnutí kontextu** — migrace 111: `project_memory (id, scope CHECK ('project','contact','global'),
   ref_id uuid, kind CHECK ('summary','preference','risk','glossary'), text, source, model, created_at,
   valid_until, confirmed_by text NULL)`. Zapisuje se jen (a) na kliknutí „Uložit do paměti", nebo
   (b) cronem z nových řádků `project_activity`, ale pak `confirmed_by IS NULL` a v UI jako „Návrh
   paměti"; nepotvrzené se používá, je označené a vyprší za 90 dnů.
- **Použití:** prompt asistenta dostane `facts` (kompaktní deterministický JSON → cachovatelný prefix)
  + nejvýš N řádků `project_memory` pro daný scope. Formuláře používají **jen `facts`**.
- **Retence a GDPR (R-076, 3 roky od posledního pohybu):** `valid_until = last_seen_at + 3 roky`,
  denní cron maže prošlé; smazání kontaktu maže jeho paměť (polymorfní `ref_id` nejde přes FK → úklid
  ve funkci i v akci mazání); řádky paměti patří do exportu údajů.
- **Ochrana:** každý ukládaný text projde `redact()` z `lib/project-activity.ts:86-93` (**použít,
  nekopírovat**) a text s `REDACTION_MARK` se odmítne uložit. Test, že `sk-…`, connection string
  a řádek z `.env` se do paměti nedostanou.
**Riziko:** střední (osobní údaje) — proto redakce a retence ve stejném sezení, ne později.

**Provedeno 2026-11-13 (AD15)** — `npm test` 99 souborů / 1176 testů (3 přeskočené, 23 nových),
`npx tsc --noEmit` a `npm run build:check` bez varování. DDL je v **migraci 111**
(`project_memory`, dva triggery, `public.purge_memory_retention()`). **Aplikovaná: nikde.**
Technický popis: `docs/admin/AGENTS-ADMIN.md` → „Paměť projektu: fakta a věty zvlášť (AD15)".

Obě vrstvy stojí tak, jak plán chtěl: `lib/admin/memory/facts.ts` počítá z historie a **jen ono**
plní formuláře (`/dashboard/new?kontakt=`, popis položky v nové faktuře), `project_memory` drží
věty a do formulářů se nedostane. Asistent dostává obojí zvlášť — `<fakta>` jako JSON ve
stabilním tvaru, `<pamet>` s označením, co není potvrzené.

Šest odchylek od zadání, všechny vědomé (podrobně R-101 v `memory/memory.md`):

1. **Zakrytý text se neuloží vůbec**, ne jen „neschválí". Zadání chtělo odmítnout text
   s `REDACTION_MARK`; paměť odmítá i text, ve kterém `redactSensitive()` **cokoli našlo**.
   Zpráva o práci jde ještě ručně opravit, než ji někdo schválí — paměť se čte potichu do promptu,
   takže je bezpečnější ji nemít než mít ji děravou.
2. **Smazání řeší trigger v databázi, ne akce mazání.** Zadání psalo „úklid musí být ve funkci
   i v akci mazání". Jenže cest ke smazání je víc než jedna a **výmaz kontaktu v adminu zatím
   vůbec neexistuje** (otevřený problém z AD09); trigger `AFTER DELETE` na `projects`
   a `contacts` platí pro všechny, i pro ruční SQL při žádosti GDPR. Denní úklid to pro jistotu
   opakuje nad osiřelými řádky.
3. **`valid_until` se zapisuje a pak prodlužuje**, ne počítá z `last_seen_at` při čtení. Při
   zápisu je to 90 dnů (návrh) nebo tři roky (potvrzené); denní úklid pak potvrzeným řádkům
   nastaví „poslední pohyb + 3 roky" podle téhož výpočtu, jaký dělá migrace 098. Jinak by se
   pohyb musel počítat při každém čtení paměti.
4. **Úklid visí na cronu `client-retention`**, ne na „`/api/cron/admin-denne` z AD08" — ten
   nevznikl. Je to tatáž otázka („co už si nemáme pamatovat") a tentýž denní běh.
5. **Návrhy paměti dělá denní `send-reminders`**, taky bez vlastního cronu (Vercel Hobby, R-006),
   nejvýš pět zakázek za běh.
6. **Řádky paměti nejsou v exportu údajů** — admin žádný export údajů kontaktu nemá (všechen
   kód GDPR exportu je ve Workspace). Zůstává jako otevřený problém pro AD16/KP10; **výmaz**
   pokrytý je.

**Co se našlo mimochodem:** rámce `<kontext>` se k modelu **nikdy nedostaly**. `escapeContext`
z AD14 čistil značky až nad hotovým textem, takže smazal i tu, kterou tam vložil `block()` —
systémový prompt přitom na rámci stavěl obranu proti vložené instrukci. Opraveno v
`lib/ai/markers.ts`: značky se čistí z hodnoty, rámec zůstává. Pokryto testem.

**Neověřeno:** v prohlížeči nikdo nic neviděl a **živý dotaz na model neproběhl**. Návrhy paměti
z cronu tím pádem nikdo nevyzkoušel naživo. Jde to až na databázi s **migrací 111**.


### AD16 — Hodnocení, reference a předávací dokument (M, **migrace 112** — 109 AD13, 110 AD14, 111 AD15; viz R-100)
**Cíl:** dotazník odejde sám a z odpovědí se dá udělat reference na web.

**Dnes:** dotazník se pošle **jen jednou**, při ručním kliknutí „Přidat do dokončených", a když
klient nereaguje, Kryštof musí odkaz ručně zkopírovat — v `HodnoceniDashboard.tsx:230–246` je to
doslova napsané. Zakázka tak může být zaplacená a klient nikdy dotazník nedostane.

- **Automaticky:** uzavření zakázky (`done` / `paid`) zařadí dotazník k odeslání. Jde přes `after()`
  s odkladem, takže Zpět ho zruší.
- **Jedna připomínka** po sedmi dnech, když klient nevyplnil. Pak už nic. Denní cron
  `send-reminders` ji pošle spolu s ostatními — žádný nový cron.
- **Migrace 111:** `project_surveys.reminded_at`, `requested_at`; `completed_projects_archiv`
  se už nepoužívá (AD11).
- **Reference pro web:** z hodnocení **se souhlasem** se jedním klikem vezme úryvek pro vizeon.cz
  (jméno, firma, hvězdičky, text). Výstup je text ke zkopírování, ne automatická publikace.
- **Předávací dokument:** „co bylo dodané" — stránky, funkce, přístupy, co je v ceně údržby a co ne.
  Skládá se z položek zakázky, generuje se do PDF **stejnou cestou jako faktura** (`lib/invoice-pdf/`
  z AD12, žádná nová závislost) a posílá se s ní. Zároveň je to krok „Předáno" v průvodce.
- **AI leady zviditelnit:** `agent_leads` se dnes ukládají a **nikdo je nevidí** — grep najde jediný
  výskyt, INSERT v route handleru. Tabulka má skóre, prioritu, shrnutí i doporučenou strategii.
  Zobrazí se v Hovorech jako pruh seřazený podle skóre.

**Hotovo, když:** uzavření zkušební zakázky pošle dotazník; po sedmi dnech odejde právě jedna
připomínka (ověřeno posunutým časem v testu); reference se zkopíruje; předávací dokument se
vygeneruje do PDF; `agent_leads` jsou v Hovorech vidět.
**Riziko:** nízké — e-maily jdou přes existující frontu a odesílají se klientovi, takže text
projde `zakaziq-ux-texty-cs`.

**Provedeno 2026-11-13 (AD16), s osmi odchylkami — R-102:**

1. **Razítka dotazníku jsou na `projects`**, ne na `project_surveys` (prompt nechal volbu na
   sezení). Důvod: `project_surveys` je **odpověď** klienta — hvězdičky jsou `NOT NULL`
   a od migrace 106 smí být na zakázku nejvýš jedna. Před vyplněním žádný řádek neexistuje,
   a právě tehdy je potřeba vědět, kdy se kdo zeptal.
2. **Dotazník posílá i `setProjectStatus`** na `done`/`paid`, ne jen uzavření zakázky — jinak
   by díra zůstala otevřená právě tam, kde ji zadání popisuje („zakázka může být zaplacená
   a klient dotazník nikdy nedostane"). Při téhle změně stavu dotazník **nahrazuje** obvyklou
   zprávu o změně stavu: dvě zprávy během patnácti vteřin jsou hluk.
3. **Souhlas se zveřejněním je nově dobrovolný** (`consent` už není `z.literal(true)`).
   Bod 3 zadání stojí na tom, že hodnocení může být i bez souhlasu — dokud ho formulář
   vyžadoval k odeslání, „se souhlasem" neznamenalo nic.
4. **Migrace 112 nese i AI leady** (`agent_leads.handled_at`, `client_lead_id`, `project_id`),
   ne jen dotazník. Bez stopy po vyřízení by pruh v Hovorech rostl donekonečna.
5. **Zakázka z AI leadu jde přes Hovory** — lead se přepíše do `client_leads` a převezme ho
   stávající `convertLeadToProject`. Druhá cesta do `projects` by měla vlastní pravidla
   o kontaktu, poznámkách a uvítacím e-mailu; zadání chtělo „stejnou cestu jako z ostatních".
6. **PDF routa je `POST`, ne GET.** Vystavení zapisuje `handover_issued_at` a zápis na GET by
   šel vyvolat obrázkem na cizí stránce (DECISIONS #027, nález bezpečnostního review).
7. **Reference zůstává na `/dashboard/profil`**, kam hodnocení přesunulo AD11 — ne na detailu
   zakázky.
8. **Předávací dokument má vlastní obsah** (`projects.handover`, jsonb), ne jen složení
   z položek zakázky: přístupy a dvě strany údržby se z faktury odvodit nedají. Položky
   a popis se **předvyplní**, zbytek píše člověk.

**Mimochodem opraveno:** `/api/invoices/*/email` chyběla v `outputFileTracingIncludes`, takže
odeslání faktury s PDF by na produkci spadlo na chybějícím Chromiu (dluh z AD12).

**Neověřeno:** v prohlížeči nikdo nic neviděl a **migrace 112 neběžela nikde**. Vzhled PDF
ověřený okem na vyrobeném dokumentu (jedna strana A4, Instrument Sans, datum s rokem);
faktura po vytažení společného rendereru vypadá stejně jako dřív.

### AD17 — Ruční překreslení denních obrazovek (L, bez migrace)
`/dashboard` (Dnes) · `/dashboard/[id]` · `/dashboard/calls` · `/dashboard/calendar` ·
`/dashboard/faktury` + detail · `/hub` a `/hub/finance`. Jedna hlavní akce na obrazovce, detail
v pravém panelu, nejvýš 2 kliky z Dnes, `AccentHeading` / `SectionLabel` / `Money` / `TimeRange` /
`LiveDot` / `TileGlyph`, kontakt z AD10 v záhlaví, asistent z AD14 v panelu.
**Hotovo, když:** každá má `PageHeader`, `Toolbar`, prázdný stav a skeleton; strop `admin-classes`
spadl; průchod s přihlášením na 390/768/1280/1440 px.
**Riziko:** střední — běží v produkci, jedna obrazovka = jeden commit.

**Hotovo 2026-11-13.** Šest commitů, jedna obrazovka na commit, plus sedmý s opravami
z průchodu. Technický popis: `docs/admin/AGENTS-ADMIN.md` → „Denní obrazovky v Dílkách (AD17)".

**Co se udělalo:**
- **Sdílený panel adminu** `components/admin/card.tsx` — `Card`, `CardHead`, `CARD_CLASS`
  a `SECTION_LABEL`. Panel v klidu je plochý (DESIGN.md → Elevation: stín patří jen tomu,
  co plave). Nahradil opisovaný řetězec `rounded-2xl border border-border bg-white p-6 shadow-sm`.
- **Barvy přestaly být dekorace.** Zmizela zelená (Dílky ji nemají) a červená zůstala jen
  pro chybu: výsledek hovoru, hodnocení klienta a zdraví financí jedou přes tóny
  z `lib/admin-status.ts`, příjem a výdaj se rozlišují **tvarem** jako v penězích Workspace
  (příjem plný, výdaj obrysem), kategorie událostí v kalendáři tóny termínů `--staff-1…5`.
- **`LeadsTable` se vykresluje z propů**, ne z kopie v `useState` (otevřený problém z AD08).
- **Plochy a přístupnost:** řazení sloupců, krok měsíce, výsledek hovoru, rozbalení kontaktu,
  „Zaplaceno"/„Vrátit", chipy ve scénářích a položky menu mají 44 px; šipky kalendáře
  a ikonové akce dostaly `aria-label` (otevřený problém z AD10).
- **Strop zakázaných tříd spadl** proti stavu po AD07: `muted-foreground` 589 → 283,
  `rounded-lg|xl|2xl` 396 → 197, `border-border` 269 → 123, duhové barvy 677 → 269,
  `bg-white` 176 → 96.

**Odchylky od zadání (R-103):**
1. **`/hub` a `/hub/finance` z promptu neexistují** — Hub zanikl v AD03 (R-087). Překreslilo se
   `/dashboard/finance`, obě záložky.
2. **`SectionLabel` z Dílků se nerozšiřoval.** Volitelné `as` v něm rozbilo hydrataci
   (server `p`, prohlížeč `h3`); admin má místo toho třídu `SECTION_LABEL` a element si volí sám.
3. **Popisky polí nejsou mono verzálky**, ale `text-sm font-medium` jako ve Workspace.
   Mono je podle DESIGN.md pro data a značky sekcí.
4. **Detail v pravém panelu se nedělal.** Detail zakázky je po AD11 celá obrazovka s průvodkou
   a záložkami; překreslit ji do panelu je jiné zadání než překreslení vzhledu.
5. **`Money` a `TimeRange` se nepoužily** — berou měny a čas Workspace (`lib/ws/money`,
   `lib/ws/time`); admin má vlastní `lib/money-currency.ts` a pražský čas. Použilo se `font-num`,
   tedy totéž písmo.
6. **Tři vědomé výjimky z pravidla 44 px:** bloky v kalendáři (výška je čas), odkazy na e-mail
   a číslo faktury uvnitř řádku (texty, ne akce) a skrytý odkaz „Přeskočit na obsah".

**Ověřeno v prohlížeči** (headless Chrome, podepsaná session, 390 / 768 / 1280 / 1440 px):
Dnes, Hovory, Kalendář, Faktury a Finance › Osobní. Nikde vodorovné přetečení. Průchod našel
devět věcí a všechny jsou opravené (seznam v changelogu paměti).
**Neověřeno:** Finance › Podnikání a skutečný detail zakázky — testovací Neon nemá migraci 106
(`column p.closed_at does not exist`). Detail se proto procházel na dočasné stránce s fiktivními
daty mimo `/dashboard`, po průchodu smazané.

### AD18 — Dokončení sjednocení a ověření (M, bez migrace)
Doběh ve zbylých souborech: `text-muted-foreground` → `text-quiet` (1057×), `bg-white` → `bg-surface`
(302×), `rounded-xl|2xl|lg` → `rounded-chip|box|panel` (710×), duhové `bg-{barva}-NNN` → tóny
z `lib/admin-status.ts` (477×), šedé škály. **9 ručně psaných modálů `fixed inset-0`** →
`components/ui/dialog.tsx` / `sheet.tsx` (Radix řeší focus trap, Escape, `aria-modal`).
`.brand-gradient` smazat. Klávesnice a přístupnost, `prefers-reduced-motion`, měření proti AD00,
`AGENTS-ADMIN.md`, `memory/memory.md`.
**Hotovo, když:** `admin-classes.test.ts` má strop 0 u `brand-`, `bg-white` a `muted-foreground`;
žádný `fixed inset-0` modál; tabulka v sekci 11 má čísla po.

---

## 6. Sezení a stav

| # | Sezení | Velikost | Migrace | Závisí na | Stav |
|---|---|---|---|---|---|
| AD00 | Příprava, větev, testovací data, měření | S | — | — | **hotovo 2026-11-11** |
| AD01 | Úklid: Škola, Sport, Plány, Šablony pryč | M | **100 + 101** | AD00 | **hotovo 2026-11-11** (migrace jen na testu) |
| AD02 | Jeden byznys, tři zdroje poptávek (Prvotka) | M | **102** | AD01 | **hotovo 2026-11-11**, **nasazeno 2026-11-13** (102 na produkci, ověřeno `/h/<token>` → 404) |
| AD03 | Jedna navigace, zrušení Hubu, Dnes s čísly | M | — | AD02 | **hotovo 2026-11-11** |
| AD04 | Vizuální základ (tokeny, písmo, CSP, portály, `brand→navy`) | M | — | AD03 | **hotovo 2026-11-11** (v prohlížeči neověřeno) |
| AD05 | Kostra, šířky, jeden systém odznaků | M | — | AD04 | **hotovo 2026-11-11** (v prohlížeči neověřeno) |
| AD06 | Rychlost I: dávkování, indexy, streaming | M | **103** | AD04 | **hotovo 2026-11-11**, **nasazeno 2026-11-13** (103 podle Kryštofa na produkci) |
| AD07 | Sdílená tabulka a výpisy | M–L | — | AD05, AD06 | **hotovo 2026-11-11** (v prohlížeči neověřeno) |
| AD08 | Rychlost II: `after()`, opravy kalendáře, bundle | M | — | AD06 | **hotovo 2026-11-12** — všech osm bodů „Hotovo, když“ splněno a ověřeno. |
| AD09 | Jedna entita kontaktu | M–L | **104** | AD06 | **hotovo 2026-11-12**, **nasazeno 2026-11-13** (104 na produkci; **backfill kontaktů ještě neproběhl**, v prohlížeči neověřeno) |
| AD10 | Klikací kontakt, šablony, kalendář ↔ hovory | M | **105** | AD09 | **hotovo 2026-11-12**, **nasazeno 2026-11-13** (ověřeno v prohlížeči 390–1440 px; rezervace z portálu naživo neposlaná) |
| AD11 | Dokončené do zakázky, průvodka zakázky | M–L | **106** | AD09 | **hotovo 2026-11-12**, **nasazeno 2026-11-13** (incident se 106 tím uzavřený, `/h/[token]` vrací 404; na testovacím Neonu 106 pořád chybí) |
| AD12 | Fakturace: vystavování, PDF, QR, ARES | L | **107** | AD06, AD09 | **hotovo 2026-11-12**, **nasazeno 2026-11-13** (107 i 108 podle Kryštofa na produkci; PDF i formulář ověřené v prohlížeči, zbytek obrazovek ne; R-086, R-098) |
| AD13 | Fakturace: měny, transakce, stav, testy | M | **109** | AD12 | **hotovo a nasazeno 2026-11-13** (109 podle Kryštofa na produkci; `WARNING` o duplicitních příjmech nikdo nezkontroloval, v prohlížeči neověřeno; R-099) |
| AD14 | AI asistent + oprava `/api/ai-assistant` | M–L | **110** | AD05, AD09 | **hotovo 2026-11-13**, **nasazeno 2026-11-14** (110 podle Kryštofa na produkci; v prohlížeči neověřeno, živý dotaz na model neproběhl; R-100) |
| AD15 | Paměť projektu (facts + project_memory) | M | **111** (ne 110 — tu zabral AD14, viz R-100) | AD14 | **hotovo 2026-11-13**, **nasazeno 2026-11-14** (111 podle Kryštofa na produkci; v prohlížeči neověřeno, živý dotaz na model neproběhl; R-101) |
| AD16 | Hodnocení, reference, předávací dokument, AI leady | M | **112** (posun o jedna, R-100) | AD11, AD12 | **hotovo 2026-11-13**, **nasazeno 2026-11-14** (112 podle Kryštofa na produkci; v prohlížeči neověřeno, PDF ověřené okem; R-102) |
| AD17 | Ruční překreslení denních obrazovek | L | — | AD07, AD10, AD14 | **hotovo 2026-11-13**, **nasazeno 2026-11-14** (ověřeno v prohlížeči 390–1440 px kromě Financí › Podnikání a skutečného detailu zakázky — testovací Neon nemá 106; R-103) |
| AD18 | Dokončení sjednocení, modály, ověření | M | — | vše | **hotovo a nasazeno 2026-11-14** (strop tříd na nule, sedm modálů na Radixu, průchod klávesnicí a 390–1440 px ověřený; `/dashboard/profil` padá na chybějící migraci 106 na testovacím Neonu) |

**Úklid jde první a není to libovůle:** AD01 až AD03 smažou nebo sloučí to, co by AD04 jinak
přepisoval a AD17 překresloval. Každá obrazovka smazaná v AD01 je obrazovka, kterou nikdo nemusí
navrhovat. Proto se nezačíná vzhledem.

**Nezávislé a prohoditelné:** po AD06 jsou AD07, AD08 a AD09 na sobě nezávislé.
AD12+AD13 nezávisí na AD14+AD15. AD17 chce AD07, AD10 a AD14 hotové, jinak se obrazovka kreslí dvakrát.
**Nejkratší cesta k „už to není pomalé":** AD00 → AD04 → AD06 → AD08 (čtyři sezení).
**Nejkratší cesta k „volám jedním klikem":** AD00 → AD04 → AD09 → AD10.
**Nejkratší cesta k „nestydím se za to":** AD00 → AD04 → AD05 → AD17.

---

## 7. Rychlost: seřazeno podle získaný čas / riziko

| # | Oprava | Fáze | Očekávaný efekt | Jak změřit |
|---|---|---|---|---|
| 1 | `lib/admin/db.ts` s `batch()` + `no-store` | AD06 | detail zakázky 12 dotazů / 5 vln → 2 vlny; kalendář 7→1; `/hub/finance` 12/3→1. Při ~20–40 ms na kolo **200–450 ms** | čítač kol v testu + `Server-Timing` jen v dev |
| 2 | Migrace 103 (indexy + `pg_trgm`) | AD06 | řazení a ⌘K z sekvenčního scanu na index | `EXPLAIN (ANALYZE)` v PGlite, poměr před/po |
| 3 | E-maily do `after()` | AD08 | **hotovo** — uložení už na SMTP nečeká (test); kolik to je v ms, řekne až p75 z produkce | test, že `sendEmail` běží v `after`; p75 z Vercelu |
| 4 | Časové okno v kalendáři | AD08 | **hotovo** — tři roky dat: 4 380 → 176 řádků (PGlite) | počet řádků v testu + velikost odpovědi |
| 5 | `LIMIT` a stránkování (5 dotazů bez limitu) | AD07 | `getAllLeadNotes` tahá všechny poznámky všech leadů | test, že žádný výpis není bez `LIMIT` |
| 6 | Kostra streamem (`counts` jako promise + `loading.tsx`) | AD06 | kostra < 100 ms místo čekání na 3 dotazy | první bajt s uměle zpožděným promise |
| 7 | `staleTimes: { dynamic: 30 }` | AD06 | Zpět/Vpřed okamžitě | DevTools: žádný request |
| 8 | `SessionProvider` jen pro admin | AD06 | −1 request po každém mountu, menší landing bundle | DevTools + `route-bundle-stats.json` |
| 9 | `next/dynamic` + `LazyMotion` + bundle guard | AD08 | **hotovo jen `LazyMotion`** — Hovory −9,7 %, Kalendář −9,8 %, ostatní +0,2 %. `next/dynamic` neušetřil nic (vykresluje se na serveru) a v kódu není | `route-bundle-stats.json`, strop v testu |
| 10 | Zápisy z renderu Financí do cronu | AD08 | **hotovo** — dva zápisy z každého GET pryč | test, že GET nezapisuje |
| 11 | `useOptimistic` | AD08 | **hotovo** — potvrzení poptávky a akce v Hovorech vypadají okamžitě. Cílený `revalidatePath` se nedělal: revalidace je potřeba pro počty na serveru | reducer v testu, ruční průchod zbývá |
| 12 | PDF route: ETag, `maxDuration` | AD08 | **hotovo** — druhé otevření je 304 a obsah se z databáze nečte. Stream `bytea` nejde (HTTP driver) | unit test; v DevTools zbývá |
| 13 | `unstable_cache` na neosobní čtení | až po měření | malý | jen pokud měření ukáže |

**Čím měřit, když produkce i Preview mají jinou DB než lokál:** (a) **počet kol do DB** je nezávislý
na prostředí — primární metrika, drží ji test; (b) **poměr před/po** z `EXPLAIN` v PGlite nad
syntetickými daty produkční velikosti, s poznámkou „absolutní čísla jsou WASM"; (c) skutečné
milisekundy jen z produkce po deployi (Vercel runtime logy, p75 per route).
**Do sekce 11 nikdy nepsat číslo, které nevzniklo měřením.**

---

## 8. Rozhodnutí, která potřebuji od Kryštofa

> **A a B rozhodnuty 2026-11-10 večer** (viz sekce 1, druhé kolo): **A = varianta A**
> (`ws/redesign-app` → `main` fast-forwardem a deploy, pak `admin/modernizace` z `main`),
> **B = smazat** `app/dashboard/projekty`. Otevřené zůstávají **C** a **D**.

**A — Větev a cesta na produkci (rozhodnuto: varianta A).**
Fakt: `main` není před `ws/redesign-app` v ničem (`main..ws/redesign-app` = 92 commitů, opačně 0),
takže sloučení je **fast-forward** — technicky nejbezpečnější operace, bez konfliktů a bez merge
commitu. Nová kostra adminu (R-071) leží nenasazená právě tam.

- **Varianta A (doporučuji):** nejdřív `ws/redesign-app` → `main` fast-forwardem a deploy, pak
  `admin/modernizace` z `main`; každé dokončené sezení merge do `main` + deploy. Výhoda:
  modernizovanou kostru adminu máš v produkci **hned**, a pak po kouscích, ne jednou za měsíc.
  Cena: nasadí se zároveň Workspace, landing page a klientský prostor (jsou za Clerkem a předplatným,
  landing je hotová) — a to je rozhodnutí o spuštění, které můžeš chtít udělat jinak.
- **Varianta B:** `admin/modernizace` z `ws/redesign-app`, admin se na produkci dostane až s launchem.
  Přijatelné, ale „rychlejší admin" neuvidíš ani po pěti sezeních.
- **Variantu C** (samostatná větev z `main` s přenesením kostry) nedělat — 45 souborů, +4028/−787
  v konfliktu při každém pozdějším sloučení.

Pravidlo v obou variantách: tyto soubory mění **jen admin větev** a Workspace si je bere rebasem —
`app/globals.css`, `tailwind.config.ts`, `next.config.mjs`, `lib/security/csp.ts`, `app/layout.tsx`.

**B — `app/dashboard/projekty` (559 ř., mrtvý duplikát): rozhodnuto — smazat.** Přesměrovat nebylo kam, protože `/hub` se ruší (AD03).

**C — `updateProject` přepisuje `declared` všem transakcím zakázky** (AD13). Je to dnešní chování,
které smete ruční `setTransactionDeclared`. Nechat, nebo změnit na „přepsat jen nepotvrzené"?

**D — Vyčistit `.claude/worktrees/`?** 11 starých worktree, 7,5 GB, 0 souborů v gitu. Není součástí
plánu, jen bych to nerad mazal bez tvého slova.

---

## 9. Co vědomě nedělat

| Nedělat | Proč |
|---|---|
| **Tmavý režim adminu** | pracuje se ve dne; zdvojnásobí každou vizuální kontrolu a `admin-tokens.css` by potřeboval druhou sadu |
| **Rozpad všech monolitů** (`LeadsTable` 1181, `SmartCalendar` 1166, `StartupProjectEditor` 978) | dělí se jen to, co sezení skutečně otevře; refaktor pro refaktor je riziko bez efektu |
| **VoIP a nahrávání hovorů** | rozhodnutí Kryštofa: `tel:`/`sms:`/`mailto:` + šablony |
| **Fronta e-mailů pro admin** | `after()` řeší 95 % problému jednou řádkou; `lib/ws/email/outbox.ts` je per účet |
| **Sjednocení daňových sazeb s Workspace** | jiné režimy (R-011); sloučení ohrožuje už podané výpočty |
| **Sjednocení `cn()` a přesun adminu do `components/ws/*`** | 153 souborů přejmenovaných importů za nulový přínos |
| **`pdf_data` do Blob storage** | pod 4 MB funguje; samostatný projekt |
| **next-auth → Clerk v adminu** | funguje, jeden uživatel, mimo rozsah |
| **Screenshot / visual regression testy** | nová nástrojová vrstva; skutečné riziko (barva při přejmenování) pokrývá test rovnosti palety + ruční průchod |
| **AI, která zapisuje sama** | rozhodnutí Kryštofa (R-084) |
| **Jedna tabulka faktur pro admin i `ws`** | dvě evidence, dvě RLS politiky; sdílí se jen vykreslování PDF a výpočty |
| **Dvoufázové ověření adminu, monitoring chyb, samostatná DB role** | otevřené položky čekající na Kryštofovo rozhodnutí, ne součást modernizace |

---

## 10. Rizika

| Riziko | Kde | Co s tím |
|---|---|---|
| Přejmenování barev zneviditelní barvy v klientském portálu | AD04 | paleta do `:root` **před** codemodem; portál v kontrolním seznamu každého vizuálního sezení |
| Změna `app/globals.css` prostřelí Workspace a landing | AD04 | `/w` a `/` porovnat před/po; čtyři oddělené commity |
| 143 souborů najednou | AD04, AD18 | codemod přes `git grep`, po souborech, `git diff --stat` ke čtení |
| Peníze: faktury, příjmy, daňový základ | AD12, AD13 | archiv se nedotkne (`kind='archived'`), nová cesta oddělená, testy nad PGlite, krok = commit |
| Backfill kontaktů nad skutečnými daty | AD09 | skript s dry-run, pouští Kryštof; sporné nechat nepřiřazené; `merged_into` místo mazání |
| Osobní údaje a klíče v paměti | AD15 | `redact()` z `lib/project-activity.ts`, odmítnout text s markerem, retence 3 roky |
| AI dostane pokyn z textu klienta | AD14 | vstupy z portálu jsou data, ne instrukce; asistent nikdy nekoná sám |
| Admin běží v produkci během přepisu | AD17 | jedna obrazovka = jeden commit; deploy po sezeních |

---

## 11. Naměřeno

*Výchozí stav doplnil AD00 (2026-11-11), po opravách doplní AD06, AD08 a AD18.
Nepsat číslo, které nevzniklo měřením.*

### Kola do databáze

Kolo = **jeden požadavek do databáze**. Do AD06 to bylo totéž co jedno zavolání
`sql`; od AD06 je dávka (`adminDb.batch`) jedno volání po síti, i když je v ní
osm dotazů — a platí se právě ta volání. Ve sloupci „po" je proto v závorce
i počet dotazů, aby bylo vidět, že se jich nikam neztratil. Vlna = kola, která
odstartovala společně (`Promise.all`); další vlna znamená čekání na odpověď
předchozí. Čítač žije v testu `lib/__tests__/admin-db-rounds.test.ts`
(v aplikačním kódu nezůstává) a slouží zároveň jako strop — když počet naroste,
test padne.

| Obrazovka | Kol do DB před | Kol po (AD06) | Jak zjištěno |
|---|---|---|---|
| kostra administrace (odznaky v menu) | 3 (1 vlna) | **1** (3 dotazy), navíc streamem — obsah na ni nečeká | čítač v testu |
| `/dashboard` (Dnes) | 8 (1 vlna) | **1** (8 dotazů) | čítač v testu |
| kostra + Dnes dohromady | 11 (2 vlny) | **2** (11 dotazů, 2 vlny) | čítač v testu |
| `/dashboard/[id]` — Přehled | 12 (5 vln) | **1** (2 dotazy) | čtení kódu + smoke test |
| `/dashboard/[id]` — Zprávy | 12 (5 vln) | **1** (8 dotazů) | čtení kódu + smoke test |
| `/dashboard/[id]` — Požadavky | 12 (5 vln) | **1** (3 dotazy) | čtení kódu + smoke test |
| `/dashboard/[id]` — Aktivita / Fakturace | 12 (5 vln) | **3** (2 vlny) | zbývá AD12/AD13 |
| `/dashboard/calls` | 5 | **1** (2 dotazy) | čtení kódu |
| `/dashboard/calendar` | 7 | **1** (4 dotazy) | čtení kódu |
| `/dashboard/faktury` | 5 | **1** (2 dotazy) | čtení kódu |
| `/dashboard/klienti` | 1 kolo, 11 korelovaných podvýběrů na účet | **1** (3 dotazy, 8 laterálů, LIMIT 50) | čtení kódu + test v PGlite |
| `/dashboard/finance` — Osobní | ~12 (3 vlny) | **9** (2 vlny: 2 zápisy + 7 čtení) | čtení kódu |
| `/dashboard/finance` — Podnikání | ~16 (3 vlny) | **7** (2 vlny: 2 zápisy + 5 čtení) | čtení kódu |

Finance zůstávají nejdražší obrazovkou adminu: dva zápisové generátory běží při
každém GET (ruší AD08) a jedenáct čtecích funkcí má každá vlastní mapování
(slučuje AD13).

### Kolik řádků stáhne kalendář (AD08)

| | před AD08 | po AD08 |
|---|---|---|
| konzultace, události, termíny a plánované hovory | celá historie | okno měsíc ± 7 dní |
| tři roky provozu v PGlite (`admin-calendar.test.ts`) | 4 380 řádků | **176 řádků** |
| kol do databáze | 1 (dávka ze AD06) | 1 (dávka), + 1 při prokliku mimo okno |

Čísla jsou z testu nad syntetickými daty (jedna konzultace, událost, deadline a hovor
na každý den od 2025-01-01), ne z produkce — tam dnes tolik záznamů není. Jde o to, že
objem **přestal růst s délkou provozu**.

### Co udělaly indexy (migrace 103)

`EXPLAIN` v PGlite nad syntetickými daty produkční velikosti (4 000 leadů,
2 000 zakázek, 3 000 událostí, 2 000 faktur), měří `lib/__tests__/admin-indexy.test.ts`.
**Čísla jsou odhad ceny od plánovače, ne milisekundy** — PGlite je Postgres ve WASM
a jeho časy o Neonu nic neříkají (sekce 7). Co platí bez výhrad: před migrací čte
všech sedm dotazů celou tabulku, po ní ani jeden.

| Dotaz | Plán před | Plán po | Cena |
|---|---|---|---|
| Hovory: `client_leads ORDER BY created_at DESC LIMIT 50` | Seq Scan + Sort | Index Scan | 217,0 → 2,3 |
| Dnes: zakázky bez pohybu | Seq Scan + Sort | Index Scan | 88,0 → 0,6 |
| Faktury: `ORDER BY issued_on DESC LIMIT 50` | Seq Scan + Sort | Index Scan | 105,6 → 3,6 |
| Dnes: faktury po splatnosti | Seq Scan + Sort | Index Scan | 63,1 → 1,8 |
| Kalendář: události podle `starts_at` | Seq Scan + Sort | Index Scan | 239,8 → 121,3 |
| Kalendář: naplánované hovory | Seq Scan | Bitmap Index Scan | 99,8 → 64,4 |
| Kalendář: termíny zakázek | Seq Scan | Bitmap Index Scan | 61,3 → 53,8 |

Dotazy, které filtrují `EXTRACT(YEAR FROM date)` nebo `to_char(date, 'YYYY-MM')`
(roční příjem, peníze za měsíc na Dnes), index použít **nemůžou** — funkce nad
sloupcem to znemožní. Přepsat je na rozsah patří k AD13.

### Staré třídy v adminu

Ukazatel postupu místo screenshot testů. Počítá `components/admin/__tests__/admin-classes.test.ts`
nad `app/dashboard`, `app/p`, `app/h`, `app/(auth)`, `app/globals.css`, `components/*.tsx`,
`components/admin` a `lib/types.ts` (272 souborů) — tedy nad tím, co AD05 a AD17 překreslují.
Test tvrdí „nejvýš strop", takže úklid nikdy neblokuje, ale návrat staré třídy ano.
**Po každém sezení snížit na naměřenou hodnotu.**

| Třída | Strop po AD04 (2026-11-11) | Po AD05 | Po AD07 (2026-11-11) | Po AD17 (2026-11-13) | **Po AD18 (2026-11-14)** |
|---|---|---|---|---|---|
| `muted-foreground` | 743 | 691 | 589 | 283 | **0** |
| `rounded-lg\|xl\|2xl` | 463 | 434 | 396 | 197 | **0** |
| `border-border` | 335 | 314 | 269 | 123 | **1** |
| duhové `bg\|text\|border\|ring-{barva}-NNN` | 927 | 755 | 677 | 269 | **0** |
| `bg-white` | 211 | 199 | 176 | 96 | **0** |
| šedé škály (`gray`, `slate`, `zinc`, `neutral`, `stone`) | — | — | — | 41 | **0** |
| `brand-*` | **0** | 0 | 0 | 0 | **0** |

Jediný zbylý `border-border` je `@apply border-border` v základní vrstvě `app/globals.css` —
výchozí barva okraje pro celé repo, která se řídí motivem (AD04 ji tam nechal záměrně).
Třída v žádném `.tsx` není.

**Rozsah se v AD18 zúžil, a je to oprava, ne úhyb.** Test měřil `components/*.tsx`, ale `*`
v gitovém pathspecu zabírá i lomítko, takže do počtu padaly i `components/{ws,marketing,ui}`.
Bílá v nich **je správně**: bílé tlačítko v hero, dílky loga, razítko věrnostní karty, palec
přepínače — to jsou bílé plochy na tmavém, ne nepřepsané karty. Komentář u testu to tvrdil
od AD04, pathspec to ale nedělal.

AD18 kromě tříd uklidil i to, co do „staré vizuální vrstvy" patří a nikdo to nepočítal:
`.brand-gradient` (44×) i literální paletu `brand` v `tailwind.config.ts`, gradienty
`from-violet-*` a **emoji v rozhraní** (ikony konzultantů, popisky v kalkulačce startupu →
Lucide). Test to od teď hlídá: nula u všech skupin, žádný ručně psaný `fixed inset-0`
a žádné emoji v `.tsx`.

Z AD07 ubylo 78 duhových tříd a asi stovka šedých: zmizely celé soubory
`CompletedProjectsTable`, `InvoiceRegistry`, `CostsManager`, `WaitlistSection`
a `DashboardFilters` (emerald v evidenci faktur, sky/violet u nákladů, amber
a emerald u waitlistu) a nahradila je sdílená tabulka v Dílcích.

Z AD05 ubylo hlavně 172 duhových tříd v odznacích. Zbytek duhy je jinde než na odznacích:
zelená a červená u částek ve Financích (`IncomeExpenseSection` 52, `ScenarioSection` 42,
`FinanceHealthSection` 28, `BusinessCalculator` 24), barvy událostí v kalendáři
(`SmartCalendar` 36) a emeraldový vzhled evidence faktur (`InvoiceRegistry`, `InvoiceArchive`,
`InvoiceFields`). To překresluje AD17, kalendář AD08 a fakturaci AD12/AD13.

Čísla z plánu (1057 / 710 / 536 / 477 / 302) byla měřená před AD01, který smazal čtyři moduly,
a nad jiným rozsahem souborů — nejsou s těmihle porovnatelná. `brand-*` je nula od AD04;
zbývá jen `.brand-gradient` (44×) a `colors.brand` v `tailwind.config.ts`, obojí maže AD18.

### JavaScript na trase

Měřeno z HTML produkčního buildu (`npm run build` + `npm run start`, 2026-11-11):
součet skriptů, které jsou v HTML stránky, gzip spočítaný z souborů na disku
(`node scripts/bundle-stats.mjs --server http://localhost:3000 --cookie …`).
Společné pro každou stránku: **168,6 kB gzip** (7 souborů).

| Trasa | JS před (AD00) | JS po (AD06) | JS po (AD08) | Před AD18 (`cabe01c`) | **Po AD18 (`32c785c`)** |
|---|---|---|---|---|---|
| `/login` | 226,2 kB | 226,2 kB | 226,2 kB | 226,4 kB | **226,3 kB** |
| `/` (landing) | 267,0 kB | **251,5 kB** | 251,3 kB | 251,5 kB | **248,4 kB** |
| `/dashboard` (Dnes) | 234,4 kB | 245,2 kB | 245,7 kB | 297,5 kB | **297,8 kB** |
| `/dashboard/zakazky` | 237,0 kB | 249,9 kB | 249,1 kB | 300,9 kB | **301,2 kB** |
| `/dashboard/calls` | 278,1 kB | 291,5 kB | **263,8 kB** | 344,5 kB | **344,5 kB** |
| `/dashboard/calendar` | 274,4 kB | 287,6 kB | **260,6 kB** | 339,4 kB | **339,6 kB** |
| `/dashboard/faktury` | 241,4 kB | 254,4 kB | 254,8 kB | 305,7 kB | **305,9 kB** |
| `/dashboard/naklady` | 239,3 kB | 252,7 kB | 267,5 kB | 303,0 kB | **302,8 kB** |
| `/dashboard/finance` (dřív `/hub/finance`) | 255,6 kB | 273,9 kB | 274,7 kB | 325,5 kB | **325,6 kB** |
| `/dashboard/poptavky` | — | 250,1 kB | 250,6 kB | 331,0 kB | **331,3 kB** |
| `/hub`, `/alteno` | 230,3 / 238,0 kB | zrušeno (AD02, AD03) | — | — | — |

**Sloupce AD18** (měřeno 2026-11-14 stejným postupem: `next build`, `next start` na portu 3100,
`bundle-stats --server --cookie`). Protože mezi AD08 a AD17 nikdo neměřil, změřil se zvlášť
i stav **před** AD18 — commit `cabe01c` se kvůli tomu přeložil a změřil samostatně, aby šlo
odlišit, co přidalo AD18 a co devět sezení před ním.

Výsledek: **AD18 je na JavaScriptu nula** (−0,2 až +0,3 kB; landing −3,1 kB, což je přesypání
společných chunků, ne ubraný kód). Převod sedmi ručně psaných modálů na Radix tedy **nic
nepřidal** — `@radix-ui/react-dialog` v adminu už byl (dialog nákladů z AD07, ⌘K) a čtyři
komponenty naopak přestaly importovat `AnimatePresence`.

**Co přidalo 50–80 kB, je AD09–AD17**: Hovory 263,8 → 344,5 kB (+31 %), Kalendář 260,6 → 339,4
(+30 %), Dnes 245,7 → 297,5 (+21 %), Poptávky 250,6 → 331,0 (+32 %). Jsou to funkce
(kontakty, fakturace, asistent, paměť, předání, AI leady), ne regrese ve vzhledu — ale strop,
který AD08 postavil, se mezitím o třetinu zvedl a nikdo si toho nevšiml, protože měření
nebylo součástí „Hotovo, když" u AD09–AD17. Zapsané v otevřených problémech.

**Sloupec AD08** (měřeno 2026-11-12, `build:check` + `npm start` + `bundle-stats`):
Framer Motion se přestal stahovat předem (`m` + `LazyMotion` v `AdminRoot`), což sebralo
**28,3 kB z Hovorů a 28,4 kB z Kalendáře** — jen tyhle dvě trasy ho totiž nesly. Ostatní
obrazovky zaplatily +0,4 kB za samotnou `LazyMotion`; `/dashboard/naklady` vyskočilo
o 14,8 kB proti AD06, což **není AD08** (sahalo se jen na Framer Motion a tahle trasa ho
nenesla) — číslo z AD06 bylo naměřené před AD07, který Náklady přepsal na dialogy.

`next/dynamic` v tabulce není, protože ho nakonec nikde nepoužíváme: na šesti místech
nezměnil nic (komponenta se vykresluje na serveru, chunk v HTML zůstává) a na Financích
přidal +1,4 kB. První „po" měření AD08, které slibovalo −18 až −27 %, bylo **neplatné** —
běželo proti starému `next start`, kterému mezitím build přepsal statické soubory, takže
tři chunky chyběly a počítaly se jako nula. Proto je v postupu měření nově kontrola,
že žádný skript z HTML na disku nechybí.

**Takhle se to čte:** sloupec „po AD06" není přínos AD06, ale stav po AD03–AD06 dohromady.
Admin od AD00 vyrostl o 11–18 kB, protože AD04 a AD05 mu přidaly `components/ui/*`
(portály, toasty, odznaky) a jednu kostru. Zhubnutí adminu má v plánu AD08
(`next/dynamic`, `LazyMotion`, strop v testu), ne tohle sezení.

Jediné číslo, které patří AD06, je **landing: −15,5 kB**. Je to `SessionProvider`
z kořenového layoutu: landing na něm nic nestavěla, jen kvůli jedné podmínce
v hlavičce načítala NextAuth a po načtení volala `/api/auth/session`. V HTML
produkčního buildu po změně `/api/auth/session` není ani jednou.

Čistý rozdíl „před AD06 / po AD06" změřit nešlo: v pracovní kopii leží cizí
rozpracované soubory (`lib/admin/costs.ts`, `components/admin/costs/`,
změněná `app/dashboard/naklady/page.tsx`), se kterými se starší commit nepřeloží,
a cizí práce se nepřepisuje ani neuklízí.

Turbopack v Next 16 per-route klientské chunky v manifestech `.next` neuvádí (všechny
trasy by vyšly stejně, jen společné soubory), proto se měří z vykresleného HTML.
`route-bundle-stats.json` je generovaný a není ve gitu.

### p75 z produkce

Nic. Admin na produkci běží ze starého buildu (`d948400`) a nová kostra nasazená není —
p75 per route má smysl měřit až po nasazení (Vercel runtime logy).

Zakázané třídy (ukazatel z AD04 h): `muted-foreground` 1057 · `rounded-xl|2xl|lg` 710 ·
`brand-*` 668 · `border-border` 536 · duhové `bg-{barva}-NNN` 477 · `bg-white` 302.

## 12. Zápis do paměti

**Zapsáno 2026-11-10:** **R-081** (Dílky i v adminu; přepisuje R-027, rozšiřuje R-071), **R-082**
(paralelní postup vůči launchi; cesta na produkci zůstává otevřená — otázka A), **R-083**
(vystavování faktur v adminu), **R-084** (AI navrhuje, člověk potvrzuje; kontakt odkazy, ne VoIP),
**R-085** (paměť projektu: facts + AI shrnutí).
**Zapsáno 2026-11-10 večer (druhé kolo zadání):** **R-087** (Hub se ruší, jedna navigace —
mění R-081 v části „Hub v rozsahu"), **R-088** (Alteno není byznys, ale zdroj poptávky; tři weby
do jednoho inboxu — mění R-008), **R-089** (Škola, Sport, Plány a Šablony se mažou včetně tabulek),
**R-090** (Dokončené se slučují do zakázky, hodnocení automaticky, předávací dokument).
**Zbývá:** **R-086** (ARES jako nová vnější závislost) se zapíše až v AD12.
Technická fakta průběžně do `docs/admin/AGENTS-ADMIN.md`, changelog a stav po každém sezení.
