# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Stručné instrukce: [`../AGENTS.md`](../AGENTS.md); technická fakta: [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md).
>
> **Poslední aktualizace:** 2026-11-12 · Modernizace adminu: AD00–AD09 hotové (nově jedna entita kontaktu: tabulka `contacts`, obrazovka Kontakty se sloučením duplicit, normalizace telefonů a e-mailů, backfill skript a převod z Hovorů, který už nic neztrácí; migrace 104 jen na testu; R-095) · Modernizace adminu: AD00–AD08 hotové (nově rychlost II: e-maily a oznámení mimo akci přes `after()`, kalendář čte okno místo celé historie a tři nahlášené chyby zadávání času opravené, Finance v GET nezapisují, Framer Motion líně — Hovory a Kalendář o 28 kB lehčí, potvrzení poptávky vypadá okamžitě, PDF faktury s ETagem; R-093, R-094, DECISIONS #022) · 2026-11-11 · AD00–AD07 hotové (nově sdílená tabulka adminu: řazení, filtry a stránkování v adrese, počítá je databáze, a žádný výpis už netahá celou tabulku) (rychlost I: dávkovaný `lib/admin/db.ts` — Dnes 8 kol → 1, detail zakázky 12 dotazů v 5 vlnách → 1 dávka, Klienti bez 11 korelovaných podvýběrů; migrace 103 s indexy; kostra streamem, `staleTimes`, landing bez NextAuth, R-092) na větvi `admin/modernizace` (nově jedna kostra: šířku a hlavičku obrazovky určuje stránka přes `PageShell`/`PageHeader`, jeden systém odznaků v `lib/admin-status.ts` místo deseti palet, R-091) (nově vizuální základ: paleta Dílků na `:root`, Instrument Sans místo Interu, zúžená CSP, portály a toasty adminu přes `components/ui`, `brand-*` → `navy-*`) (ukázková data, evidence migrací, výchozí měření, úklid čtyř modulů, jeden byznys se třemi zdroji poptávek, zrušení Hubu a jedna navigace s měsíčními čísly na Dnes; migrace 100–102 jen na testu) · 2026-11-10 · Plán modernizace admin konzole AD00–AD18 (R-081–R-085, kód se zatím nemění) · Řemeslné skilly třetích stran, impeccable 4.8.2, tasteskill 2.5.1 uživatelsky (R-080) · 2026-11-04 · Incident: produkce bez DB po výměně hesla `neondb_owner`, opraveno (AUDIT-LOG) · 2026-11-03 · Právní texty a provozovatel na webu (R-079) · Review před spuštěním a opravy (R-077, migrace 099 připravená, CI s testy, chybové stránky, Clerk `authorizedParties`, session adminu 12 h) · 2026-11-01 · Klientský prostor, hlášení z Claude Code a nová kostra adminu (R-070–R-073, migrace 092–096 aplikované na produkci, `portal_app` vytvořena, commit 41c6873 pushnutý, Preview Ready) · Požadavky klientů z portálu (R-069) · Preview na testovací DB, 084 na testu i produkci; redesign aplikace: R-058 až R-063; RD01–RD14 a RD16 hotovo v kódu, RD15 rozpracováno; produkční migrace 064–091 aplikované; připraven samostatný prázdný testovací Neon projekt · S19 částečný živý audit/Preview; S05 základní SEO (R-055); Next 16.4 + React 19 (R-053)

---

## 1. Aktuální stav

*Snímek — přepisuje se, nedoplňuje. Předchozí podrobný snímek po sezeních: `archiv/2026-10.md`.*

**Admin konzole (produkce):** VIZEON `/dashboard`, ALTENO `/alteno`, portál `/p/[token]`, Hub `/hub`; deploy z `main`, produkce běží na starém buildu `d948400`. Popis: `docs/admin/AGENTS-ADMIN.md`. Na větvi `ws/redesign-app` (nenasazeno) má admin novou kostru (R-071), Dnes, detail zakázky se záložkami a správu klientských prostorů; na `admin/modernizace` navíc úklid z AD01.

**Modernizace adminu (R-081–R-092), stav po sezení 2026-11-11:** běží na větvi **`admin/modernizace`** (založená z `ws/redesign-app`, protože `main` se ještě nenasazoval — viz Další krok). **AD00–AD07 hotové, AD08 uzavřené** (ne všechna kritéria splněná — viz níž), AD09 (jedna entita kontaktu, migrace 104) je další.
Z „Hotovo, když" u AD08 je splněné a ověřené **všech osm bodů** včetně jednoklikového „Zaplaceno" a doslovného kliku na slot v 11:00. **Průchod s přihlášením a 390 px v kritériích AD08 nejsou**, je to diligence navíc v otevřených problémech.
Z AD08: vedlejší efekty adminu jdou přes `after()` z `next/server` — uložení zakázky, potvrzení
poptávky, dokončení ani poptávka z webu nečekají na Gmail SMTP (`sendPortfolioEmail`
a `sendCustomLeadEmail` zůstávají awaitované, tam je e-mail smyslem akce). Kalendář čte
**okno měsíc ± 7 dní** (`lib/admin/calendar.ts` + `calendar-window.ts`) a další období dotáhne
server action `loadCalendarMonth`; dřív šla do prohlížeče celá historie (R-093). Tři nahlášené
chyby zadávání času jsou opravené a celý kalendář počítá v pražské zóně nad `'YYYY-MM-DD'`
a minutách, ne nad `Date` v zóně prohlížeče. Stránka Finance už při vykreslení **nezapisuje** —
opakované transakce dělá denní cron `send-reminders` a tlačítko „Doplnit opakované".
Framer Motion se načítá líně (`m` + `LazyMotion` v `AdminRoot`): Hovory 292,1 → **263,8 kB**,
Kalendář 289,0 → **260,6 kB**, ostatní trasy +0,4 kB; `next/dynamic` se podle měření neujal
a v kódu není (R-094). Potvrzení poptávky a akce v Hovorech mají `useOptimistic`. PDF faktury
posílá `ETag` a při shodě 304 bez čtení bajtů (DECISIONS #022). Migrace žádná.
**Ověřeno i v prohlížeči** (2026-11-12): kalendář na dočasné stránce s fiktivními daty (klik na slot v 11:00, geometrie 10:15 na pixel, 390 px) a **přihlášený průchod adminem na skutečných datech** headless Chromem — sedm obrazovek 200 bez jediné chyby v konzoli, Dnes s měsíčními čísly, krok kalendáře mimo okno dotáhl data dvěma voláními server action, Faktury mají jednoklikové „Zaplaceno", Finance „Doplnit opakované".
Z AD07: výpisy adminu jedou na sdílené serverové tabulce (`lib/admin-table.ts` +
`components/admin/{data-table,pagination,table-search}.tsx`). Stav seznamu je v adrese
(`?sort=&dir=&page=`), takže řazení i stránka jsou obyčejné odkazy, přežijí reload i tlačítko
Zpět a nic se kvůli nim nehydratuje; pod 640 px se místo posuvníku kreslí karty. Filtry, řazení,
stránkování i součty počítá databáze — dotazy jsou v `lib/admin/{completed,invoices,costs,leads,projects,waitlist}.ts`.
Klíč řazení se z adresy **vybírá** ze seznamu povolených sloupců, do SQL se nikdy nevkládá.
Zmizelo pět ručně psaných tabulek (`CompletedProjectsTable`, `InvoiceRegistry`, `CostsManager`,
`WaitlistSection`, `DashboardFilters`) a s nimi `getAllLeadNotes`, které posílalo do prohlížeče
všechny poznámky všech kontaktů. **Okem v prohlížeči neověřeno** (ověřeno smoke testem přes HTTP).
Z AD06: nový `lib/admin/db.ts` posílá víc dotazů **jedním požadavkem** (Neon HTTP transakce) —
Dnes stojí 1 kolo místo 8, odznaky v menu 1 místo 3, detail zakázky 1 dávku místo 12 dotazů
v pěti vlnách, kalendář 1 místo 4, faktury a Hovory 1 místo 2. `batchTolerant` drží dřívější
chování pro tabulky z migrací 092/093. `/dashboard/klienti` má místo 11 korelovaných podvýběrů
na účet osm `LEFT JOIN LATERAL` a stránkování po padesáti. Evidence faktur počítala „jiné příjmy
zakázky" korelovaným `COUNT(*)` na každý řádek — přepsáno na `GROUP BY`, shodu s původním
dotazem hlídá test v PGlite. **Migrace 103** (indexy + `pg_trgm`) je připravená, **neaplikovaná
nikde**; je aditivní, takže se smí pustit i před nasazením větve. Kostra adminu se nečeká na
čísla u odznaků (příslib + `<Suspense>`), deset obrazovek má `loading.tsx` ve svém tvaru,
`staleTimes: { dynamic: 30 }` a `SessionProvider` zmizel z kořenového layoutu (landing −15,5 kB
a žádné `/api/auth/session`). **Finance zůstávají nejdražší obrazovkou** (9 a 7 kol) — slučuje
AD13, zápisy z renderu ruší AD08. **V prohlížeči okem neověřeno** (smoke test přes podepsanou
session: 22 adresářů, pět záložek detailu a `?strana=2` vracejí 200). Z AD05: `<main>` v `AdminShell` nemá šířku ani okraje — každá z 27 obrazovek `/dashboard` se obaluje `<PageShell>` (`narrow` 960 · `default` 1280 · `wide` 1440 · `table` 1600) a 25 vlastních `<h1>` nahradil `<PageHeader>`; jedenáctisloupcové tabulky Dokončených a Hovorů se tím vejdou bez posuvníku. Deset vlastních palet odznaků nahradil `lib/admin-status.ts` s pěti tóny (R-091). Přes podepsanou session vrací 200 všech 22 adresářů adminu i šest detailů; **okem v prohlížeči neověřeno.** Z AD04: Dílky jsou výchozí vzhled celého repa — paleta je na `:root` (`app/tokens-dilky.css`), takže platí i na `/login`, `/p` a `/h`; Inter se nenačítá a CSP profilu `admin` o výjimku na Google Fonts přišla (zúžení, CSP-LOG v8); admin má kořen s portály (`components/admin/admin-root.tsx`), takže hotové komponenty `components/ui/*` v něm fungují, a toasty jdou přes `@/components/ui/toast` se vzorem „akce hned + Zpět"; 527 tříd `brand-*` v 69 souborech je přejmenovaných na `navy-*`. Kolik starých tříd v adminu zbývá, počítá `components/admin/__tests__/admin-classes.test.ts` (stropy v plánu, sekce 11). **V prohlížeči neověřeno.** Z AD03: **Hub zanikl** — Finance a daně, Projekty a Startup jsou pod `/dashboard`, všechny `/hub/*` trvale přesměrovávají (i `/hub/plany`, `/hub/school`, `/hub/sport` z AD01), menu má jednu podobu (Přehled · Práce · Peníze · Klienti · Osobní) a Dnes má vpravo „Jak se daří tenhle měsíc" (příjem a z toho přiznaný, nezaplacené faktury po měnách, odhad daně a měsíční rezerva ze stejných pravidel jako Finance). Z AD02: VIZEON a ALTENO jsou jeden byznys se třemi zdroji poptávek (`lib/lead-origins.ts`), sekce `/alteno` a `/dashboard/vizeon` zanikly a trvale přesměrovávají, poptávky ze všech webů padají do jednoho inboxu `/dashboard/poptavky`, staré ALTENO zakázky získaly fakturaci, dokončení i poznámky ze schůzek, pošta adminu odchází z jedné schránky a přibyl endpoint `/api/public/prvotka-leads` (web Prvotky zatím napojený není). Migrace 102 je **jediná nekompatibilní změna plánu** — přejmenovává `business` na `lead_origin`, takže se smí aplikovat na produkci jen spolu s nasazením větve. Co z AD00/AD01 platí: `npm test` je zase pojistka (60 souborů, 727 testů, 28 s — vitest ignoruje `.claude/worktrees`), běhoun migrací vede `public.schema_migrations`, čistá DB se zakládá `scripts/admin-base-schema.sql` + migrace 001–063 a 092–096, ukázková data dává `node scripts/admin-seed.mjs --ano`, výchozí měření je v plánu sekce 11. Testovací Neon (větev `rd-test`, kam míří `.env.local`) má admin tabulky i ukázková data, takže admin jde lokálně otevřít. Smazané moduly: Škola, Sport, Plány, Šablony webu a mrtvé `app/dashboard/projekty`. Migrace 100 a 101 jsou připravené a vyzkoušené jen na testu. Plán: `docs/admin/MODERNIZACE-ADMIN-PLAN.md` (stav v sekci 6), prompty `new - area of zakaziq/prompty/admin/`.

**Klientský prostor (R-070–R-073), stav po sezení 2026-11-01:** kód KP01–KP07 a KP09 (úroveň 2) je commitnutý (`41c6873`) a pushnutý na `origin/ws/redesign-app`, na produkci (`main`) nasazený není. Migrace 092–096 jsou **aplikované na produkčním Neonu** (projekt `projectiq`, ověřeno čtecím dotazem), role `portal_app` je tam vytvořená (`scripts/portal-create-role.js`, kontrola skriptu prošla: bez BYPASSRLS, bez přístupu do `public`). Ve Vercelu nastaveno: `DATABASE_URL_PORTAL` (jen Production; Preview míří na testovací DB bez schématu `portal`), `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`, `CLIENT_REQUEST_AI_MODEL=claude-haiku-5-5` (poslední tři Production i Preview). Preview https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app vrací 200 na `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni`. Ověřeno testy (PGlite oddělení klientů, nav, Dnes, hlášení, aktivita, CSP) a `tsc`/`build:check`; **v prohlížeči nic z toho ověřeno není** (admin lokálně nemá data, přihlášení Clerku na `/klient` nikdo neprošel). Zbývá KP08 (soubory, odloženo), KP10 (audit, GDPR, pilot) a úroveň 3 předání. Plán: `docs/klientsky-prostor/PLAN.md` sekce 6.

**Workspace + landing:** všechna sezení S00–S18 a redesign RD01–RD14, RD16 jsou v kódu na větvi `ws/redesign-app` (RD15 vizuální audit rozpracovaný). Plán rozsahu `docs/workspace/PLAN.md`, redesign `docs/workspace/REDESIGN-APP-PLAN.md`, technika `docs/AGENTS-REFERENCE.md` část B, spuštění `docs/workspace/LAUNCH.md`. Nic z Workspace není na produkci.

**Landing R-068:** vrácena interaktivní mřížka v hero, zploštěny dekorativní rámečky, přichycené scény omezeny na široké obrazovky a animace respektují reduced motion. Typová kontrola a náhledy 390/768/1440 px hotové; testy/build neprovedeny.

**Databáze:** produkční Neon má migrace 064–096 a role `ws_app`, `portal_app`. Testovací Neon `ZakazIQ RD test` (větev `rd-test`) má totéž, `.env.local` míří na něj (bez admin tabulek → admin lokálně i v Preview padá/je prázdný). Práva `ws_app` doplní `node scripts/ws-create-role.js` (`scripts/ws-grants.sql`); na produkci po dnešním doplnění neověřeno. Migrace 099 (R-077) je připravená, neaplikovaná nikde; 097 a 098 na produkci už na heslo nečekají (`neondb_owner` vyměněné, Production `DATABASE_URL` opravená 2026-11-04), aplikované zatím nejsou; `.env.local` míří na test, pro produkci je potřeba produkční connection string.

**Preview `ws/redesign-app`:** https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app — testovací DB, vlastní `NEXT_PUBLIC_APP_URL`. Testovací účet `rdtest+clerk_test@example.com` (Clerk testovací kód), byznys `testovaci-salon` (kadeřnictví, ukázková data ze seedu, zapnuté Faktury, fiktivní dodavatel), předplatné `trialing` do 2026-11-14 ve Stripe sandboxu. Ověřeno s přihlášením 2026-10-31: Dnes, Kalendář, Poptávky, Zákazníci, Nastavení › Firma, vystavení faktury a PDF s QR (200, 1 strana), export ZIP, výmaz zákazníka; telefonní rozvržení (614 px). Vzhled PDF okem neověřen.

**Externí služby (ověřeno 2026-11-03):** Clerk: produkční instance `zakaziq.cz` má DNS, SSL i poštu hotové (`clerk deploy status` = `oauth_pending`); chybí vlastní Google OAuth klient, webhook, `force_organization_selection=false` v produkci (neověřeno) a produkční klíče ve Vercelu, aplikace dál běží na dev instanci. Resend: doména ověřená, `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` ve Vercel Production, webhook vypnutý do nasazení; doručení zatím nikdo nezkusil. Stripe jen sandbox, live mód a produkční webhook chybí. DNS u WEDOS: 5 CNAME Clerku a `_dmarc` (`p=none`, bez `rua`) existují, chybí CAA (už jde přidat, certifikáty Clerku jsou vydané) a SPF apexu.

**Další krok:** blokující věci před spuštěním. Kryštof: aktivace Stripe live, provozovatel do Stripe (Public details, šablona faktury), migrace 097–099 na produkci, Google OAuth klient pro Clerk, pilotní klient a podpora (D4, D6, D7), Vercel Pro, test obnovy Neonu, DNS CAA, SPF a `rua` v DMARC. Agent: admin po Next 16 s daty (V2), klientský prostor v prohlížeči, scénáře Stripe sandboxu, zkušební e-maily do tří klientů, telefon 390 px a RD15. Pořadí v `docs/workspace/LAUNCH-PLAN.md`. Merge a produkční deploy jen se souhlasem Kryštofa.

**Prostředí agentů:** `AGENTS.md` + `docs/AGENTS-REFERENCE.md` (R-047), skilly a bezpečnost synchronizované do `.agents/` (R-046, `docs/CODEX.md`); řemeslné skilly třetích stran jsou uživatelské mimo repo, dostupnost ověřuj (R-080).

---

## 2. Rozhodnutí

*Číslovaná, nepřečíslovávat. Než v kódu „opravíš" něco, co tu je, zeptej se.*

### R-001 · Osobní nástroj s jedním adminem (2026-06-14)
**Rozhodnutí:** jediný admin účet v env (`ADMIN_EMAIL` + bcrypt hash), NextAuth Credentials, JWT. Žádná registrace, žádné role.
**Proč:** první fáze = nástroj pro vlastní potřebu; multi-user by zdržel.
**Důsledek:** žádné `user_id` v jádře zakázek. Kdyby se z toho dělal SaaS, je to velká migrace.

### R-002 · Neon místo Supabase (2026-06-14)
**Rozhodnutí:** DB je Neon serverless Postgres přes `sql` tag z `lib/db.ts`, bez ORM.
**Důsledek:** `sql` tag neumí skládat fragmenty → sdílené podmínky žijí jako DB funkce (`is_vizeon_pending()`), viz AGENTS.md.

### R-003 · Rebrand ProjectIQ → ZakazIQ (2026-06-15)
**Důsledek:** starší dokumenty (`docs/CLAUDE_BOOKING_PROMPT.md`) a historie mluví o ProjectIQ — je to tentýž projekt.

### R-004 · Emaily přes Gmail SMTP, ne Resend (2026-06-15)
**Rozhodnutí:** veškeré emaily přes nodemailer + Gmail v `lib/email.ts`.
**Výjimka:** hromadné launch emaily na waitlist ve Startupu stále přes Resend (`RESEND_API_KEY`).
**Proč:** odesílání z vlastní schránky, bez ověřování domény u Resendu.

### R-005 · Kolize termínů řeší databáze (2026-06-15, rozšířeno migracemi 043/044)
**Rozhodnutí:** UNIQUE/overlap guard v DB + catch `23505`, nikdy „zkontroluj a pak vlož". Guard platí napříč tabulkami i byznysy.
**Proč:** jeden člověk = jeden diář; race condition při souběžných rezervacích.

### R-006 · Crony maximálně 1× denně (2026-06-25)
**Rozhodnutí:** všechny crony ve `vercel.json` běží denně (tax-news týdně). Hodinový cron pro připomínku „2 h před" byl vrácen.
**Proč:** Vercel Hobby plán nedovolí častější crony.
**Důsledek:** připomínky „2 h před konzultací" nejdou přes Vercel cron — viz Otevřené problémy.

### R-007 · Projekty patří do Hubu, ne do VIZEON dashboardu (2026-06-23)
**Rozhodnutí:** osobní projekty žijí v `/hub/projekty`; odkaz z navigace dashboardu odstraněn.
**Důsledek:** `/dashboard/projekty/**` je legacy — viz Otevřené problémy.

### R-008 · Dva byznysy nad jedním datovým modelem (2026-08-14)
**Rozhodnutí:** VIZEON a ALTENO sdílí kód i tabulky, liší se sloupcem `business`, cestami a brandingem z `lib/business.ts`. ALTENO má záměrně jen jádro (zakázky + inbox).
**Proč:** jeden software místo dvou kopií, které by se rozjely.
**Důsledek:** každý nový dotaz nad `projects`/`calendar_events` filtruje `business`; Hovory, Dokončené, Hodnocení, Náklady a Kalendář jsou jen VIZEON (emaily tam natvrdo `business: 'vizeon'`).

### R-009 · VIZEON má vlastní emailovou schránku (2026-08-18)
**Rozhodnutí:** VIZEON posílá z info@vizeon.cz (vlastní transporter), admin notifikace jdou na `VIZEON_ADMIN_EMAIL`. Chybí-li kompletní dvojice env, fallback na výchozí účet.

### R-010 · Kalendář a Hovory jsou párově propojené (2026-09-03)
**Rozhodnutí:** kalendářní událost automaticky zakládá lead v Hovorech a naopak se mažou spolu. Kalendář z `client_leads` bere jen řádky bez `calendar_event_id`.
**Proč:** jeden termín nesmí být v kalendáři dvakrát.

### R-011 · Finance, faktury a daně (2026-09-11)
**Rozhodnutí:** viz sekce „Zafixovaná rozhodnutí" v `docs/FINANCE_SYSTEM_PLAN.md` — tam je kompletní seznam. Nejdůležitější: dvě linie příjmů (příznak `declared` na transakci, default `false`), rok = datum zaplacení, OSVČ vedlejší činnost + neplátce DPH + 60% paušál, měny se nikdy nesčítají, AI přepis nikdy neblokuje ruční uložení.

### R-012 · Evidence faktur napříč byznysy ve VIZEONu (2026-09-18)
**Rozhodnutí:** `/dashboard/faktury` ukazuje faktury VIZEON i ALTENO; logika zůstává v `app/hub/finance/invoice-actions.ts`.
**Proč:** jedno IČO, jedno daňové přiznání — rozdělený archiv = hledání dokladu na špatném místě.

### R-013 · Paměťový systém projektu (2026-10-08)
**Rozhodnutí:** `CLAUDE.md` (chování) + `AGENTS.md` (technická fakta, přejmenováno z původního `Claude.md`) + `memory/` (index, pravidla, živý stav). Každá dokončená změna se zapisuje do changelogu.
**Proč:** kontinuita mezi sezeními a mezi AI nástroji; aby se znovu neodvozoval kontext ani „neopravovala" záměrná rozhodnutí.

### R-014 · ZakazIQ Workspace jako SaaS ve stejném repu (2026-10-08)
**Rozhodnutí:** vedle admin konzole vzniká Workspace pro malé firmy (`/w/*`, `/api/ws/*`, `/api/public/v1/*`, Clerk, schéma `ws`, jeden tarif 249 Kč/měsíc přes Stripe) a landing page (`app/(marketing)/`). Admin konzole se nemění — co se přebírá, kopíruje se do `lib/ws/` / `components/ws/`. Izolace dat přes `requireWorkspace()` + `account_id`. Pravidla jsou v `CLAUDE.md` → „Workspace — tvrdá pravidla".
**Proč:** produkt pro cizí firmy nesmí rozbít osobní produkční nástroj; R-001 (jeden admin) platí dál pro admin konzoli.
**Důsledek:** paměť zůstává v `memory/` (R-013), původně navržená struktura `.claude/memory/` (STATE, SESSION-LOG, DECISIONS, OPEN-QUESTIONS) se nezavádí. Pravidla Workspace jsou v `AGENTS.md` → Hranice v repu + Část B; při rozporu CLAUDE.md × AGENTS.md platí AGENTS.md.

### R-015 · Git podle oblasti (2026-10-08)
**Rozhodnutí:** Workspace + landing page na větvi `workspace`, commit po každém uceleném kroku, zpráva `ws/oblast: …`. Admin konzole dál na `main`, commit jen na požádání, `feat: …` / `fix: …`. Push na `main` jen se souhlasem.
**Proč:** výstavba SaaS nesmí jít rovnou do produkčního deploye adminu; admin údržba zůstává jako dřív.
**Důsledek:** `AGENTS.md` → Společné → Git; větev `workspace` zatím neexistuje, založí se s prvním kódem Workspace.

### R-016 · Cesty veřejných částí Workspace (2026-10-08)
**Rozhodnutí:** aplikace `/w/*`, objednávací stránka `/r/[slug]`, widget `/embed/[slug].js`, klientský portál Workspace `/z/[token]`, veřejné API `/api/public/v1/*`. Admin portál `/p/[token]` zůstává.
**Proč:** widget pod `/w` by kolidoval s aplikací (Clerk), portál pod `/p` s admin portálem.
**Důsledek:** `AGENTS.md` → Hranice v repu (`app/r/`, `app/embed/`, `app/z/`).

### R-017 · Jedna doména, aplikace na /w (2026-10-08)
**Rozhodnutí:** landing page i aplikace na jedné doméně (`/` a `/w/*`), ne subdoména.
**Proč:** jedna Clerk instance, jeden deploy, jednodušší cookies, CORS a CSP.
**Důsledek:** `NEXT_PUBLIC_APP_URL` je jedna adresa pro landing i aplikaci; `AGENTS.md` → B4.

### R-018 · 249 Kč je konečná cena (2026-10-08)
**Rozhodnutí:** tarif 249 Kč měsíčně je konečná cena bez připočtení DPH.
**Proč:** provozovatel je neplátce DPH (R-011). Až se stane plátcem, řeší se nová cena ve Stripe.
**Důsledek:** ceník na landing page „249 Kč měsíčně", bez „+ DPH"; `AGENTS.md` → B5.

### R-019 · Zkušební doba 14 dní bez karty (2026-10-08)
**Rozhodnutí:** po registraci 14 dní zdarma bez zadání karty, pak výzva k platbě přes Stripe Checkout; bez předplatného režim jen pro čtení (data se nemažou, poptávky se ukládají dál).
**Proč:** nejnižší bariéra pro malé firmy.
**Důsledek:** trial se počítá v `ws` (ne Stripe trial s kartou); `hasActiveSubscription` musí znát i běžící zkušební dobu. `AGENTS.md` → B5.
**Nahrazeno:** R-038 (2026-10-09) — 14 dní zdarma s kartou.

### R-020 · V ceně 1 byznys a neomezeně pracovníků (2026-10-08)
**Rozhodnutí:** jeden účet = jedno předplatné = jeden byznys; pracovníků neomezeně.
**Proč:** jednoduché vysvětlit, drží „jeden tarif".
**Důsledek:** datový model si `business_id` nechává (plán), ale UI nenabízí založení druhého byznysu; S08/S13. `AGENTS.md` → B5.
**Nahrazeno:** R-026 (2026-10-08) — „další byznys = další účet" nebylo rozhodnuto.

### R-026 · Další byznys na účtu zatím vypnutý (2026-10-08)
**Rozhodnutí:** v ceně 249 Kč je 1 byznys a neomezeně pracovníků. Struktura účtu s více byznysy z plánu zůstává (`business_id`, `/w/[byznys]`, přepínač), jen přidání dalšího byznysu je v UI vypnuté.
**Proč:** upřesnění R-020 podle plánu (účet = firma s libovolným počtem byznysů); cena za další byznys není rozhodnutá.
**Důsledek:** S07/S13 stavějí datový model a URL pro víc byznysů, průvodce „Nový byznys" jen pro první. `AGENTS.md` → B5.

### R-021 · Design systém Dílky je závazný (2026-10-08)
**Rozhodnutí:** Workspace, klientský portál, objednávací stránka, e-maily a landing page vypadají podle mockupu LP-D (barvy a dílky z loga, Instrument Sans/Serif, JetBrains Mono). Starší mockupy (A–D, C2–C5, LP-A–A3) platí jen pro rozložení a funkce. Admin si nechává svůj vzhled.
**Proč:** jednotná identita podle loga; převzato ze sady (rozhodl Kryštof).
**Důsledek:** skill `zakaziq-design-dilky`, `AGENTS.md` → B8.

### R-022 · SEO skilly pro landing page (2026-10-08)
**Rozhodnutí:** S05 používá `seo` + `seo-quality-principles`, klíčová slova případně přes `seo-collabim-keyword-loop`.
**Důsledek:** prompt `S05-landing-seo-texty.md` a `00-README.md` upraveny.

### R-023 · Landing bez sekce „Kdo za tím stojí", právní texty zástupně (2026-10-08)
**Rozhodnutí:** sekce „Kdo za tím stojí" se na landing page nedělá (odchylka od řádku 10 v `docs/workspace/PLAN.md`). IČO a právní stránky jsou v S04 jako `[DOPLNIT]`, skutečné texty nejpozději v S19.
**Důsledek:** prompt `S03-landing-brief.md` upraven.
**Nahrazeno:** R-079 (2026-11-03) v části právních textů a údajů provozovatele.

### R-024 · Napojení webů klientů primárně přes Claude Code (2026-10-08)
**Rozhodnutí:** klientské weby se staví v Claude Code; hlavní cesta je skill `zakaziq-napojeni` → serverová akce webu → `POST /api/public/v1/requests` s tajným klíčem. Záložně objednávací stránka (odkaz, QR) a jednořádkový widget pro cizí weby.
**Proč:** převzato ze sady (rozhodl Kryštof) — weby staví Kryštof sám.

### R-025 · Segmenty zákazníků (2026-10-08)
**Rozhodnutí:** segmenty Noví, Stálí, Jednorázoví, Spící, Ukončení; hranice podle oboru, nastavitelné.
**Proč:** převzato ze sady (rozhodl Kryštof). Detail v `docs/workspace/PLAN.md`.

### R-027 · Oddělení Dílků od admin konzole (2026-10-08)
**Rozhodnutí:** tokeny Dílků platí jen uvnitř `[data-app="ws"]` (`app/ws-tokens.css`, importované jen v layoutech `app/w` a `app/(marketing)`); písma přes `next/font` jen tam; Tailwind dostal jen nové klíče (`navy`, `ground`, `surface`…, adminové `brand`/`card`/`muted`/rádiusy/`font-sans` beze změny). Kořen `WsRoot` je i kontejner pro Radix portály, aby dialogy a menu nebyly v `<body>` bez tokenů. Tmavý režim = `data-theme="dark"`, `darkMode` v Tailwindu rozšířen o tenhle selektor (`.dark` zůstal). Toasty Workspace jdou přes adminův `<Toaster>` v `app/layout.tsx` (sonner 1.x neumí víc toasterů) jako `toast.custom` s vlastním `data-app="ws"`. Bez pluginu `tailwindcss-animate`.
**Proč:** admin se nesmí změnit ani o pixel; plugin `tailwindcss-animate` přidával `animation-duration` do existujících tříd `duration-*`/`ease-*` (ověřeno porovnáním zkompilovaného CSS). Kořenový `app/layout.tsx` se neměnil.
**Důsledek:** `AGENTS.md` → B8 (tabulka „Jak je systém v kódu"). Ověřeno: všech 1011 existujících CSS selektorů beze změny, screenshoty `/login`, `/dashboard`, `/hub`, `/alteno` (1280 i 390 px) bajtově shodné.

### R-028 · Závislosti UI kitu (2026-10-08)
**Rozhodnutí:** `@radix-ui/react-{slot,label,select,checkbox,switch,dialog,popover,dropdown-menu,tabs,tooltip,separator}`, `class-variance-authority`, `cmdk` (⌘K), `react-day-picker` 10 (kalendář, česká lokalizace z balíčku). shadcn komponenty psané ručně (bez `shadcn` CLI, které by přepsalo `tailwind.config.ts` a `globals.css`).
**Proč:** standardní základ shadcn/ui, přístupnost (klávesnice, ARIA) zadarmo; Radix je jen v kódu Workspace, admin ho nenačítá.

### R-029 · Bezpečnostní základ celého repa (2026-10-08)
**Rozhodnutí:** jeden `middleware.ts` (admin NextAuth → místo pro Clerk → CSP s nonce a `strict-dynamic`), statické hlavičky v `next.config.mjs`, logika v `lib/security/`. CSP pro admin a vše mimo Workspace jen Report-Only, pro `/w`, `/r`, `/z` vynucená (layout `/w` je proto dynamický). Bezpečnostní stav a kompromisy se vedou v `.claude/security/` (STATE, DECISIONS, CSP-LOG, AUDIT-LOG), do `memory/` jen odkaz.
**Proč:** admin běží v produkci a `/login` je statický (bez nonce) — vynucení by rozbilo přihlášení; nová část se staví rovnou do politiky. Podrobně `.claude/security/DECISIONS.md` #001–#006.
**Důsledek:** `AGENTS.md` → Hranice (řádek Bezpečnost) a B13 (plná pravidla); `CLAUDE.md` → Bezpečnost.

### R-030 · Doména zakaziq.cz a bezpečnostní kontakt (2026-10-08)
**Rozhodnutí:** Workspace i landing poběží na `zakaziq.cz` (rozhodl Kryštof). Kontakt pro hlášení zranitelností v `security.txt` je `info@vizeon.cz`.
**Důsledek:** `public/.well-known/security.txt` (Canonical na `zakaziq.cz`, `Expires` 2027-10-01); DNS doporučení pro `zakaziq.cz` v `.claude/security/STATE.md`.

### R-034 · `/` je landing page, admin přes /login (2026-10-08)
**Rozhodnutí:** `app/page.tsx` (přesměrování na `/hub`/`/login`) smazán (povoleno promptem S04). Přihlášený admin vidí v hlavičce landing „Do administrace“ místo „Přihlásit“ (`useSession` z kořenového SessionProvideru). Komponenty landing page v `components/marketing/`.
**Proč:** dvě stránky pro `/` nejdou; landing nemá importovat NextAuth na serveru.

### R-031 · Sekce landing page: LP-D + Proč to řešit (2026-10-08)
**Rozhodnutí:** landing má pořadí z mockupu LP-D a navíc sekci „Proč to řešit“ (srovnání dnes / se ZakazIQ) hned za pásem oborů: hero · pás oborů · 01 Proč to řešit · 02 Co to umí · 03 Jak to funguje · 04 Funkce · 05 Napojení · 06 Ceník · 07 Dotazy · footer. Ostatní sekce z `docs/workspace/PLAN.md` (Pro koho, Zákazníci se vracejí, Peníze a daně, Kontakt) se nedělají samostatně, pokryje je pás oborů a karty v Co to umí.
**Proč:** rozhodl Kryštof v S03. LP-D je kratší a soustředěnější, srovnání „před a po“ v něm chybělo.
**Důsledek:** `docs/landing/PROJECT-BRIEF.md` § 4, čísla sekcí posunutá oproti mockupu.

### R-032 · Landing bez kontaktního formuláře, místo něj e-mail podpory (2026-10-08)
**Rozhodnutí:** místo „Domluvit hovor“ a formuláře do Hovorů je na landing odkaz „Napište nám“ (`mailto:` na e-mail podpory) v hero, dotazech a footeru. Adresa zatím `[DOPLNIT]`, firemní e-mail se řeší. Kdyby se formulář vrátil: vlastní server action v `app/(marketing)/actions.ts` (Zod, honeypot, rate limit, zápis do `client_leads` přes `lib/db.ts` s vlastním popisem), ne volání `/api/public/leads`.
**Proč:** rozhodl Kryštof v S03, landing má vést na registraci a dotazy na podporu. `/api/public/leads` chce tajný `N8N_API_KEY`, poptávky natvrdo značí „z chatbota“ a rate limit by se počítal na IP serveru.
**Důsledek:** landing nemá žádný veřejný vstup. Odchylka od `PLAN.md` (sekce 11 Kontakt) i od promptu S03. Brief § 5.

### R-033 · Landing dynamická s vynucenou CSP (2026-10-08)
**Rozhodnutí:** `app/(marketing)/layout.tsx` bude `force-dynamic` a `/` + právní stránky dostanou vynucenou CSP (profil `workspace`) jako **přesné cesty**, ne prefix `/`. Statické generování z `PLAN.md` se nepoužije.
**Proč:** rozhodl Kryštof v S03. Nonce dostanou jen dynamické stránky, Report-Only nic nechrání. Cena je o něco horší TTFB a HTML bez cache na CDN.
**Důsledek:** provede S04. `.claude/security/DECISIONS.md` #007, brief § 3.

### R-035 · Schéma ws a oddělení účtů (2026-10-08)
**Rozhodnutí:** 33 tabulek ve schématu `ws` (migrace 064–075). Každá tabulka s daty účtu má `account_id` a RLS politiku `account_id = ws.current_account()` (`set_config('app.account_id')` v transakci). Vazby jsou složené cizí klíče `(account_id, x_id)`. Zákazník patří účtu, skupina (segment) se počítá pro zákazník × byznys (`customer_segments`). Blokace a dovolené jsou termíny `kind = 'block'`, takže je hlídá stejné `EXCLUDE` jako návštěvy. Před známým účtem jen úzké `SECURITY DEFINER` funkce (`ws.account_by_clerk_org`, další přidají S11/S16). Systémové tabulky bez RLS a bez osobních údajů: `stripe_events`, `webhook_events`, `rate_limits`. Aplikace se připojuje rolí `ws_app` založenou **přes SQL** skriptem, nikdy v Neon konzoli. `lib/ws/db.ts` má vlastní tag `q` a ovladač nad Neon HTTP transakcí (neinteraktivní, interaktivní přes Pool přidá S10, pokud bude potřeba).
**Proč:** odsouhlaseno v S06. Kontrola cizího klíče RLS obchází (bez `account_id` v klíči by šlo připojit cizí řádek přes UUID). Role z Neon konzole dostávají `neon_superuser` s BYPASSRLS (ověřeno na `neondb_owner`). Po transakci vrací `current_setting` prázdný řetězec, proto `NULLIF` ve funkci. Hranice skupin má každý byznys vlastní. Jedno `EXCLUDE` je jednodušší než trigger přes dvě tabulky (R-005).
**Důsledek:** `AGENTS.md` → B3 „Jak je to v kódu“, `docs/workspace/SETUP.md`, `.claude/security/DECISIONS.md` #008. Nová tabulka = řádek v `seedAccount()` v testovém helperu.

### R-036 · Testy DB proti PGlite (2026-10-08)
**Rozhodnutí:** vývojová závislost `@electric-sql/pglite` (Postgres 18 ve WASM). Testy Workspace pouští migrace 064+ do čisté DB dvakrát po sobě a ověřují pravidla jako `ws_app`.
**Proč:** Docker neběží, lokální Postgres není a Neon branch by potřebovala přihlašovací údaje a síť. PGlite umí role, RLS, `set_config` i `btree_gist`. Neon běží na PG 18.6, rozdíl verzí je zanedbatelný. Testy jsou součástí běžného `npm test` (asi 2 s).
**Důsledek:** `lib/ws/__tests__/helpers/ws-pglite.ts`, `docs/workspace/SETUP.md` → Testy. Do produkčního bundlu se nedostane.

### R-037 · Clerk jen pod /w, účet zakládá průvodce (2026-10-09)
**Rozhodnutí:** `@clerk/nextjs` 6.39.7 (verze 7 vyžaduje Next 15) + `@clerk/localizations`. Clerk běží jen pro `/w` a `/api/ws` (middleware i `ClerkProvider` v `app/w/layout.tsx`), admin a landing ho nespouští. `clerk init` se nepoužil — přepsal by kořenový layout adminu a `middleware.ts`. Účet (`ws.accounts`) zakládá jen průvodce `/w/novy` spolu s byznysem a šablonou oboru; webhook účty nezakládá, jen drží název a členy. Má-li uživatel organizaci s účtem, nový se nezakládá a průvodce ji jen aktivuje (Clerk po přihlášení aktivní organizaci nevybere). Odhlášení vlastním tlačítkem, ne `UserButton` (správa účtu se vykresluje mimo tokeny Dílků). Nastavení instance Clerku jde přes CLI (`clerk config patch`), ne ručně.
**Proč:** odsouhlaseno v S07. Admin se nesmí změnit; účet bez byznysu nedává smysl; jedno místo založení = jedna transakce bez závodu s webhookem. R-026 (jeden byznys v ceně).
**Důsledek:** `AGENTS.md` → B4 „Jak je to v kódu“, `.claude/security/DECISIONS.md` #009, CSP v3. Krok 2 průvodce (platba) přidá S08 do `app/w/novy`.

### R-038 · 14 dní zdarma s kartou, zkušební doba ve Stripe (2026-10-09)
**Rozhodnutí:** registrace končí krokem 2 průvodce, kde se ve Stripe Checkoutu zadá karta. Prvních 14 dní je zdarma (`trial_period_days` ve Stripe), první platba 249 Kč proběhne po zkušební době. Zkušební doba jen jednou na účet. Účet, který Checkout nedokončil, nemá přístup do aplikace (průvodce ho vrátí na krok 2). Po zrušení nebo nezaplacení jen čtení, data se nemažou. Při nezaplacené platbě (`past_due`) se nový Checkout nezakládá, jen výměna karty v Portalu.
**Proč:** rozhodl Kryštof 2026-10-09 („14 dní zdarma s kartou“). Zkušební doba s kartou plynule přejde v placené předplatné bez další výzvy. Nový Checkout při `past_due` by vedle nezaplaceného předplatného založil druhé a hrozila by dvojí platba.
**Důsledek:** `ws.accounts.trial_ends_at` se nepoužívá. Landing („bez karty“ pryč, nová odpověď v Dotazech s připomínkou 7 dní předem, kterou musí zapnout nastavení Stripe), brief, průvodce. `AGENTS.md` → B5. Odchylka od `docs/workspace/PLAN.md` (export, řádky o zkušební době bez karty), platí tohle rozhodnutí.

### R-039 · Stripe SDK a vývojové prostředí (2026-10-09)
**Rozhodnutí:** závislost `stripe` 22.6.2 (API `2026-08-26.dahlia`, verze se mění jen s upgradem balíčku). Vývoj v samostatném sandboxu „ZakazIQ“, ne ve sdíleném test módu ani v sandboxu jiného projektu. Tajný klíč jako omezený klíč `rk_…` s minimálními právy. Bez `payment_method_types` (metody z dashboardu) a bez Stripe Tax (neplátce, R-018). Předplatné se při každé události znovu načítá ze Stripe, ne z payloadu.
**Proč:** oficiální SDK s typy pro aktuální API, doporučení Stripe pro nové integrace. Načítání ze Stripe odstraní problém s pořadím událostí.
**Důsledek:** `docs/workspace/SETUP.md` → Stripe, `AGENTS.md` → B5 „Jak je to v kódu“, `.claude/security/STATE.md`.

### R-040 · Kostra aplikace: stav v URL, zástupné části (2026-10-09)
**Rozhodnutí:** obrazovky byznysu jsou pod `/w/[byznys]` se společným layoutem (`AppFrame`). Detail čehokoli = pravý panel řízený `?detail=<druh>:<id>` (sdílitelný odkaz, Zpět v prohlížeči ho zavře), výběr karty na Dnes `?zakaznik=`, týden `?tyden=`. Všechno se kreslí na serveru, v prohlížeči jen kostra, panel, ⌘K a menu. Nepostavené části menu řeší jedna dynamická zástupná stránka `[section]` (vypnutá funkce = 404). Poslední byznys si pamatuje HttpOnly cookie `ws_byznys` (jen slug, vždy znovu ověřený). Pevné cesty pod `/w` jsou rezervované slugy, nový byznys s takovým názvem dostane koncovku. Příkaz v ⌘K rozpoznává jen parser s pravidly (bez AI). Na telefonu místo týdenní mřížky seznam termínů do konce týdne. `requireWorkspace`/`requireBusiness` obalené `React.cache`.
**Proč:** prompt S09 a B9 (detail v panelu, 2 kliky, ⌘K); server components kvůli rychlosti bez blokujícího JS. Zástupná stránka drží menu funkční, dokud S10–S14 nepostaví skutečné obrazovky. Bez rezervace by byznys „Nový“ dostal slug `novy` a jeho Dnes by zakryl průvodce.
**Důsledek:** `AGENTS.md` → B9 „Jak je to v kódu (S09)“. Nová obrazovka = `app/w/[business]/<část>/page.tsx` (přebije zástupnou), nový detail = `DetailRef` + větev v `detail-slot.tsx`, nová pevná cesta pod `/w` = `RESERVED_BUSINESS_SLUGS`.

### R-041 · Ukázková data skriptem, jasně označená (2026-10-09)
**Rozhodnutí:** `scripts/ws-seed.mjs <slug> [--smazat] --ano` vloží (nebo smaže) fiktivní zákazníky „Testová, Ukázková…“ s telefony `+420000000xxx` a e-maily `@example.cz`, poptávky, termíny, skupiny, razítka a upozornění kolem dneška pro jeden byznys. Označení: poznámka `[ukázková data]`, `external_id 'ws-seed-*'`, pracovnice „Ukázková pracovnice“, odměna „Ukázková odměna“. Seed vždy nejdřív smaže starou ukázku. Zápis jde rolí `ws_app` pod RLS, byznys se dohledá rolí vlastníka. Bez `--ano` jen vypíše, co by udělal. Skript je `.mjs` (ne `.ts` z promptu): Node 24 spustí `lib/ws/demo-seed.ts` bez překladu, ten proto nemá runtime importy a časy počítá Postgres.
**Proč:** jiná databáze než produkční Neon zatím není; data musí jít bezpečně odstranit a nesmí se plést se skutečnými zákazníky (B10, žádné vymyšlené údaje vydávané za skutečné). `tsx` v projektu není a `.ts` skript s příponami importů by neprošel kontrolou typů Nextu.
**Důsledek:** pouštět jen na vlastním testovacím účtu a se souhlasem. Testy `ws-today.test.ts` používají stejná data.

### R-042 · Popis adminu mimo AGENTS.md, kratší paměť (2026-10-09)
**Rozhodnutí:** popis kódu admin konzole (dřív `AGENTS.md` → Část A) žije v `docs/admin/AGENTS-ADMIN.md` a čte se jen před změnou adminu. V `AGENTS.md` z části A zůstalo shrnutí, příkazy a env proměnné. Changelog v `memory.md` drží jen poslední den práce, starší dny a měsíce jdou do `memory/archiv/` (upřesnění pravidel §4).
**Proč:** rozhodl Kryštof po auditu tokenů 2026-10-09. `CLAUDE.md` s importy měl ~45,8k tokenů a čte se v každém kroku každé relace; popis adminu (~9k) potřebují jen sezení na adminu, ne Workspace. Úprava R-013 (struktura paměti zůstává, mění se jen to, co se importuje).
**Důsledek:** nová admin tabulka, routa nebo API → `docs/admin/AGENTS-ADMIN.md`; env a příkazy dál do `AGENTS.md`. Workspace pravidla beze změny v části B.

### R-043 · Nehotové akce se neukazují (2026-10-09)
**Rozhodnutí:** akce, které kostra umí nabídnout, ale ještě nefungují, jsou vypnuté přepínači `WS_FEATURES` v `lib/ws/features.ts`: odkaz na objednání (`/r/[slug]` vrací 404 do S11), Nová rezervace (ukládání S10), Nová faktura (S14). Vypnutá akce není v „+ Nová“, ⌘K (ani příkaz „rezervace …“), uvítání ani v pravém panelu, ani když přijde sdílený odkaz `?detail=nova-…`. Bez žádné hotové akce chybí tlačítko „+ Nová“ i „+“ ve spodní liště. Zástupné obrazovky v menu zůstávají (R-040). Build při běžícím `next dev` jen přes `npm run build:check` (kopie repa).
**Proč:** rozhodl Kryštof 2026-10-09 — neposílat zákazníkům odkaz na 404 a nenabízet formuláře, které nic neuloží. Menu se zástupnými stránkami ukazuje strukturu aplikace. Build v repu přepsal `.next` běžícímu dev serveru.
**Důsledek:** S10, S11 a S14 zapnou svůj přepínač ve `WS_FEATURES` (test `ws-app-shell.test.ts` hlídá, že dnes jsou všechny vypnuté — při zapnutí ho upravit). `AGENTS.md` → B9 „Jak je to v kódu (S09)“, příkazy, B12.


### R-044 · Poptávky a termíny: jak se potvrzuje a vrací (2026-10-10)
**Rozhodnutí:** (1) „Jiný čas“ = se zákazníkem už domluvený jiný termín, potvrdí se rovnou (stav `rescheduled`), nečeká na souhlas zákazníka — návrh termínu, který zákazník přijme v e-mailu nebo portálu, je až S15/S16. (2) S kalendářem vznikne potvrzením termín, se zakázkami zakázka (s časem v prvním stavu „rozpracováno“, bez času v prvním stavu „nová“). Byznys jen s kalendářem potvrzuje vždy s časem. (3) Byznys bez pracovníků dostane při prvním termínu jednoho se jménem byznysu (`ensureStaff`, zámek na byznys), sloupce a výběr pracovníka se ukazují až od dvou. (4) „Zpět“ (8 s) mají odmítnutí, zrušení, přesun termínu a přesun zakázky; potvrzení ne (termín jde zrušit, zakázka by se musela mazat). (5) Živé obnovení pollingem po 10 s s ETagem, žádný WebSocket. (6) Přetažení termínu jen myší na počítači, na telefonu Přesunout v detailu. (7) Neinteraktivní transakce Neon HTTP stačí: každý zápis je jeden SQL příkaz (CTE), Pool se nepřidával.
**Proč:** prompt S10 a B9 (jeden klik, Zpět místo dialogů, 15 s); e-maily zákazníkům zatím nejsou (S15), tak nejde čekat na jejich odpověď. Návštěva musí mít pracovníka (migrace 068), šablony oborů pracovníky nezakládají a tým je až S13. Pool by znamenal WebSocket na Vercelu a další závislost.
**Důsledek:** `AGENTS.md` → B9 „Jak je to v kódu (S10)“. S13 (tým) přejmenuje nebo nahradí automaticky založeného pracovníka; S15 doplní e-mail zákazníkovi po potvrzení, změně a zrušení.

### R-045 · Příjem poptávek z webů (2026-10-10)
**Rozhodnutí:** (1) Jedna cesta `ingestRequest` pro API s tajným klíčem, widget s veřejným klíčem, objednávací stránku i „Ověřit napojení“. (2) Bez otevírací doby si zákazník čas navrhne sám (den + čas po 30 min, 7–20 h, 60 dní, bez kontroly obsazenosti); s otevírací dobou se nabízí volné časy (21 dní, nejdřív za hodinu, termíny, blokace pracovníka i celého byznysu) a obsazený čas vrátí `SLOT_TAKEN`; bez kalendáře bez času. (3) Neaktivní předplatné: poptávka se uloží, API vrátí `202` s `notice: SUBSCRIPTION_INACTIVE` (ne chybu — web by zákazníkovi ukázal chybu u uložené poptávky). (4) Zkušební poptávky (`requests.is_test`, `test: true`, Ověřit napojení) se uloží, ale nezakládají zákazníka ani upozornění a nejsou v Dnes, Poptávkách, kalendáři ani hledání. (5) Záznam požadavků `ws.intake_log` (bez IP a osobních údajů, 30 dní). (6) „Poslat návod webáři“ otevře e-mail (`mailto:`) s kódem widgetu, bez tajného klíče — e-maily Workspace jsou až S15. (7) Tajný klíč s hlavičkou `Origin` API odmítne. (8) API přijímá i pražské `date` + `time` místo `start` (widget a weby bez časových pásem). (9) Napojení (veřejný klíč) se zakládá otevřením Nastavení › Napojený web; bez něj widget vrací 404, objednávací stránka funguje vždy. (10) Bez captchy, honeypot + rate limit (DECISIONS #010). (11) QR kód přes existující `qrcode.react`, PNG/SVG se skládá v prohlížeči.
**Proč:** odsouhlaseno v S11 (migrace 076, otevírací doba „navrhne si sám“, mailto, 202 + upozornění). B5: poptávky se ukládají vždy. Plán: zkušební poptávka a zelená fajfka. Bez nové závislosti.
**Důsledek:** `AGENTS.md` → B6 „Jak je to v kódu (S11)“, `docs/workspace/API.md`, `.claude/security/DECISIONS.md` #010, CSP-LOG v4. S13 (otevírací doba) přepne byznys z režimu `free` na `slots` automaticky. S15 doplní e-maily v `afterSave` (`lib/ws/intake/intake.ts`). Nový výpis poptávek musí mít `AND NOT r.is_test`.

### R-046 · Společný proces pro Claude Code a Codex (2026-10-10)
**Rozhodnutí:** společná komunikace a protokol sezení jsou v `AGENTS.md`; `CLAUDE.md` přidává importy a specifika Claude Code. `.claude/skills/` a `.claude/security/` jsou společný zdroj, `.agents/` drží identické kopie pro Codex synchronizované přes `scripts/sync-agent-context.mjs`. Paměť zůstává jediná v `memory/`. Projektová konfigurace Codexu má limit instrukcí 96 KiB a lokální setup/akce; setup instaluje závislosti, neklonuje klíče a nemění skutečnou DB.
**Proč:** Kryštof chce používat projekt stejně v obou nástrojích; nezávislé instrukce a bezpečnostní historie by se rozcházely. AGENTS.md přesahuje výchozí limit Codexu 32 KiB.
**Důsledek:** `AGENTS.md` → Komunikace a protokol sezení / Codex, `docs/CODEX.md`, `.codex/`, `memory/pravidla.md`. Globální skilly a připojení služeb se na jiné prostředí automaticky nepřenášejí.

### R-047 · Stručné vstupní instrukce, podrobnosti podle úlohy (2026-10-10)
**Rozhodnutí:** AGENTS.md obsahuje stručné společné instrukce, kritické zásady a povinné čtení podle úlohy. Úplný původní kontext, postupy a katalogy jsou zachované v závazné docs/AGENTS-REFERENCE.md s číslováním A/B1–B13; mění se tam technická fakta. Paměť a pravidla zůstávají společné pro všechny agenty.
**Proč:** Kryštof požaduje co největší zkrácení AGENTS.md bez ztráty účelu a kontextu; katalogy se nemají načítat při každé úloze.
**Důsledek:** aktualizované odkazy v CLAUDE.md, docs/CODEX.md, memory/index.md a pravidla údržby. Rozhodnutí R-046 dál platí; limit 96 KiB je nyní rezerva, podrobnosti se čtou výslovně podle úlohy.

### R-048 · Částková věrnost jen v korunách bez kurzu (2026-10-10)
**Rozhodnutí:** pravidlo „každých X Kč“ a minimální útrata se použijí jen pro návštěvy v CZK. Návštěva v jiné měně může dostat razítko podle pravidla „zaplacená návštěva“, ale ne podle částky.
**Proč:** bez uloženého kurzu by porovnání EUR s Kč vytvářelo nepravdivé nároky na odměnu.
**Důsledek:** `lib/ws/loyalty.ts`; budoucí práce s cizími měnami vyžaduje samostatné rozhodnutí o kurzech.

---

### R-049 · Peníze: atomické doklady a ověřené sazby (2026-10-10)
**Rozhodnutí:** číslo YYYY-NNNNNN za účet a faktura vzniknou ve stejné transakci se zámkem účtu; platba i převzetí stejné platby zakázky jsou atomické pod RLS. PDF používá stávající Puppeteer/Chromium a lokální písma, bez nové závislosti. Sazby 2026 jsou oddělené od adminu a ověřené na oficiálních zdrojích (docs/workspace/MONEY.md); sociální minimum a první pásmo paušální daně berou zpětnou novelu 2026.
**Proč:** souběh nesmí tvořit duplicitní čísla, díry ani dva příjmy za stejnou platbu; admin předpokládá studentovu vedlejší činnost a má historické pravidlo DPH.
**Důsledek:** DPH za kalendářní rok se dvěma hranicemi, posledních 12 měsíců jsou přehled. Příjmy jsou jen vodítko obratu DPH. Odhad skrytý pro jiný rok, EUR bez kurzu a plátce DPH; výjimky a zaměstnání nejsou zahrnuté. Koncept fakturačního e-mailu odešle až S15; ICS připomíná 7 dní předem.

### R-050 · E-maily: fronta bez častého cronu, vlastní šablony (2026-10-10)
**Rozhodnutí:** (1) E-mail se zařadí do `ws.outbound_messages` a odešle hned po akci (limit 2,5 s, akce na něj nečeká déle), při živém obnovení otevřené aplikace a jednou denně cronem `/api/cron/ws-email` (5:00 UTC). Připomínka termínu odchází den předem ráno, ne přesně 24 h. (2) Šablony jsou vlastní tabulkové HTML v TypeScriptu (`lib/ws/email/layout.ts`), ne React Email — bez nové závislosti a stejná funkce dělá náhled v Nastavení i odeslaný e-mail. (3) Web Push až v S18. (4) Odesílá se jen s `WS_EMAIL_FROM` (ověřená doména), do té doby zprávy čekají; prošlé (připomínka po termínu) se zruší. (5) Odmítnutí, zrušení a přesun čekají 60 s, „Zpět“ e-mail zruší. (6) Zákazníkům jen s aktivním předplatným (R-045), majiteli vždy.
**Proč:** rozhodl Kryštof v S15 (Vercel Hobby = cron 1× denně, R-006; doména zatím neověřená). React Email = 2 závislosti pro pár šablon. Toast „Zpět“ by jinak nestihl zastavit e-mail.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B7 „Jak je to v kódu (S15)“, `.claude/security/DECISIONS.md` #011, `docs/workspace/SETUP.md` → E-maily. Odchylka od plánu (React Email, přesně 24 h). Při přechodu na Vercel Pro nebo externí cron stačí volat `flushAll` častěji.

### R-051 · Klientský portál: trvalý náhodný odkaz a pravidla změn (2026-10-10)
**Rozhodnutí:** Termín i zakázka mají náhodné UUID v DB pro `/z/[token]`. Odkaz platí, dokud existuje záznam a je zapnutý portál. Zákazník smí termín přesunout nebo zrušit jen do nastaveného počtu hodin předem (výchozí 24 h); konečné kolize hlídá DB. Viditelné zprávy jsou pouze v `ws.job_updates`, interní poznámky se nepublikují.
**Proč:** Odkaz bez přihlášení musí fungovat z e-mailu i telefonu a zůstat jednoduchý; oddělená tabulka zpráv brání náhodnému zveřejnění poznámek.
**Důsledek:** migrace 082, `lib/ws/portal.ts`, `/z/[token]`, Nastavení › Funkce a tlačítka v e-mailech. Veřejné akce mají Zod a limity; bezpečnostní kompromis je v `.claude/security/DECISIONS.md` #012.

### R-052 · Admin nad Workspace: pozvání, novinky, „Učesat text“ bez AI (2026-10-10)
**Rozhodnutí:** (1) Admin čte `ws` vlastníkem tabulek (`lib/ws/admin/db.ts`), zapisuje jen novinky, interní poznámky (`ws.account_admin_notes`, `ws_app` bez práv) a audit (`actor = 'admin'`, bez e-mailu); data klienta mění přes `lib/ws` pod RLS. (2) „Pozvat klienta“ založí Clerk organizaci bez vlastníka, účet s byznysem ze šablony a pozvánku `org:admin`; člena zapíše průvodce `/w/novy` (`ensureMember`), takže to funguje i bez webhooku Clerku. Pozvaný klient platí jako každý jiný (R-038). (3) Novinky: koncept → Zveřejnit v aplikaci → Poslat e-mailem všem (jednou, s potvrzeným počtem příjemců, jen `news_emails`, jen účty existující v okamžiku odeslání). Denní cron posílá jen výslovně odeslané novinky — S15 posílal každou zveřejněnou. (4) Obrázek novinky v DB (PNG/JPEG/WebP do 600 kB podle bajtů), servíruje `/z/novinky/[id]/obrazek`. (5) „Učesat text“ = návod a místní tipy podle pravidel `humanize-text-cs` (`newsTextHints`), žádné volání AI. (6) Kromě 2 položek navigace (layout + `MobileNav`) se admin nemění.
**Proč:** prompt S17 (pozvat bez SQL, novinka v aplikaci i e-mailem, „Učesat text“ jen návod — rozhodnout). AI volání by znamenalo náklady, latenci a text, který by stejně musel projít člověk; pravidla stylu jdou zkontrolovat místně. Obrázek z cizí domény by zablokovala CSP aplikace (`img-src 'self'`), úložiště souborů v projektu není. Webhook Clerku zatím není nastavený.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B3 „Admin nad Workspace (S17, R-052)“, `.claude/security/DECISIONS.md` #013, migrace 083, `docs/workspace/SETUP.md`.

### R-053 · Next.js 16.4 a React 19 (2026-10-17)
**Rozhodnutí:** celé repo (admin, Workspace, landing) je na `next` 16.4.2 s Turbopackem a `react` 19. Kód přešel na async request API, `middleware.ts` na `proxy.ts` (Node runtime). `@clerk/nextjs` zůstal na 6.39.7 a `next-auth` na 4.24 (obojí podporuje Next 16 a React 19), `lucide-react` zůstal na řadě 0.x, `forwardRef` v `components/ui/*` se nepřepisoval.
**Proč:** Kryštof chtěl Next 16.2. Nejnovější patch té řady 16.2.12 ale podle `npm audit` obsahuje známé zranitelnosti (3× critical: `next/og`, Image Optimization, Windows hosting; opravy až od 16.3.8), proto Kryštof schválil 16.4.2. Aplikace `next/image` ani `next/og` nepoužívá a běží na Vercelu, takže reálné riziko bylo nižší, ale CI audit by zůstal červený. Jeden skok 14 → 16 bez mezistupně 15 zvládly codemody.
**Důsledek:** `proxy.ts` je jediné místo pro Clerk + NextAuth + CSP (logika beze změny). `next lint` v Next 16 není (skript smazán; kontrolu dělá `tsc`). `next.config.mjs` má explicitní `turbopack.root`/`outputFileTracingRoot` — bez něj padá Turbopack na cestě s diakritikou a hlásí cizí lockfile. Další velká verze (Next 17, Tailwind 4, Clerk 7, nodemailer 10) je samostatný krok. Odchylka: R-037 psal, že Clerk 7 vyžaduje Next 15 — upgrade Clerku nebyl při přechodu na Next 16 potřeba.

### R-054 · Nastavení: otevírací doba, pracovníci, dovolené, pořadí (2026-10-17)
**Rozhodnutí:** (1) Bez nové migrace: otevírací doba a směny v `ws.opening_hours` (staff NULL = firma), dovolené a „zavřeno“ jako celodenní blokace v `ws.appointments`, přiřazení v `ws.service_staff`. (2) Uložení nahradí celý týden; pracovník bez vlastních směn pracuje podle firmy, prázdná doba firmy = zákazník si čas navrhne sám (R-045). (3) Posledního aktivního pracovníka skrýt nejde (jinak by `ensureStaff` založil nového se jménem firmy); pracovník se nemaže, jen skryje — termíny zůstávají. (4) „Kdo ji dělá“ se ukazuje až od dvou aktivních pracovníků, prázdný výběr = kdokoli. (5) Pořadí se ukládá hned po puštění (bez tlačítka Uložit), při chybě se vrátí. Kratší blokace (hodiny) zůstávají v kalendáři. (6) `build:check` je od Next 16 obyčejný build v repu — kopie repa pod Turbopackem nefungovala (odkaz na `node_modules` mimo `turbopack.root`) a `next dev` má vlastní `.next/dev`.
**Proč:** prompt S13 (směny, dovolené, kdo dělá, přetažení); datový model z S06 to už unesl a kalendář i volné časy blokace i směny čtou. Ověřeno: build v repu při běžícím dev, dev dál vrací 200.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S13, R-054)“, `lib/ws/hours.ts`, `lib/ws/settings.ts`, `components/ws/settings/{sortable-list,week-hours-editor,team-settings,service-settings}.tsx`, test `ws-settings.test.ts`.

### R-054 · GDPR: výmaz zákazníka, lhůty a zrušení účtu (2026-10-17)
**Rozhodnutí:** (1) Výmaz zákazníka na žádost: zákazník, věrnost, hodnocení, zprávy z portálu, upozornění a e-maily s jeho id se smažou; poptávky, termíny a zakázky zůstanou bez osobních údajů („Smazaný zákazník“, bez kontaktů, poznámek a odpovědí z formuláře), částky a příjmy zůstanou. (2) Vystavené faktury zůstanou s povinnými údaji (jméno, adresa, IČO/DIČ, PDF), smaže se jen e-mail odběratele a vazba na zákazníka; koncepty faktur se smažou. Po 10 letech od konce roku vystavení je denní cron anonymizuje úplně. (3) Zrušení účtu: předplatné ve Stripe skončí hned (bez vrácení nevyčerpané části), byznysy se archivují (zavře se objednávací stránka, widget, API, portál), data 30 dní, během nich obnovení, pak cron smaže účet celý i organizaci v Clerku. (4) Export: ZIP s CSV a PDF bez nové závislosti. (5) Vzhled v cookie pro zařízení, ne v DB. (6) S18 staví na `chore/next-16` ve větvi `ws/s18`.
**Proč:** rozhodl Kryštof 2026-10-17 (pravidla výmazu, 10 let, větev). Faktura je daňový doklad (zákon o DPH § 35, zákon o účetnictví § 31), GDPR čl. 17 odst. 3 písm. b výmaz nevyžaduje; e-mail není povinná náležitost a PDF ho netiskne. Čísla v historii drží přehledy a daně.
**Důsledek:** migrace 084, `lib/ws/gdpr.ts`, `docs/AGENTS-REFERENCE.md` → B3 „GDPR, vzhled a PWA (S18)“, `.claude/security/DECISIONS.md` #014. Nový výpis zákazníků nemusí nic filtrovat (vymazaný zákazník neexistuje); nové osobní údaje v jiné tabulce = doplnit do `ws.erase_customer` a do exportu.

### R-055 · Základní SEO landing page bez klíčových slov (2026-10-17)
**Rozhodnutí:** (1) S05 = jen základní technické SEO: metadata, canonical, Open Graph/Twitter, OG obrázek, ikony, `robots.txt`, `sitemap.xml`, JSON-LD `Organization` + `WebSite` + `SoftwareApplication` (249 CZK měsíčně, bez hodnocení). Výzkum klíčových slov a přepis textů kvůli nim se nedělá. (2) Neveřejné cesty (`/w`, `/r`, `/z`, `/embed`, `/api`, admin) mají `X-Robots-Tag: noindex, nofollow`; `robots.txt` zakazuje jen `/api/`. (3) Právní stránky `noindex, follow` a mimo sitemapu, dokud mají `[DOPLNIT]` (od R-079 indexované a v sitemapě). (4) Bez `FAQPage`. (5) Oborové podstránky se nestaví, jen návrh.
**Proč:** rozhodl Kryštof 2026-10-17 („základní SEO, klíčová slova nepotřebujeme“). Zákaz v `robots.txt` by robotovi nedovolil noindex přečíst a adresa z cizího odkazu by mohla skončit ve výsledcích bez obsahu (odchylka od briefu § 11). Bohaté výsledky FAQ Google v roce 2026 zrušil a jedna odpověď má `[DOPLNIT]`.
**Důsledek:** `components/marketing/seo.ts`, `app/{robots,sitemap}.ts`, `app/(marketing)/{opengraph-image,twitter-image}.tsx`, `next.config.mjs`, `.claude/security/STATE.md`. `SITE_URL` bere `NEXT_PUBLIC_APP_URL` — musí to být hlavní produkční host (apex, nebo www). Po vyplnění právních textů odstranit `LEGAL_ROBOTS` a přidat stránky do sitemapy.

### R-056 · Nodemailer 10 přes legacy peer resolver (2026-10-17)
**Rozhodnutí:** `nodemailer` 10.1.2 se používá pro `lib/email.ts`; `.npmrc` nastavuje `legacy-peer-deps=true`, protože NextAuth 4 deklaruje volitelný peer Nodemailer 7 pro EmailProvider. Aplikace používá jen CredentialsProvider.
**Proč:** Nodemailer 7 obsahoval high zranitelnost; Vercel `npm install` bez resolveru odmítl neshodu peer rozsahu.
**Důsledek:** instalace ignoruje peer rozsahy obecně; při změnách auth/e-mailů znovu ověřit kompatibilitu. Tailwind 3 high nálezy zůstávají, Tailwind 4 je samostatná major migrace.

### R-057 · Redesign Landing a Workspace: kalendář, příběh poptávky, produktové kapitoly (2026-10-17)
**Rozhodnutí:** nový vizuální směr kombinuje (1) kalendář jako hlavní produktovou plochu, (2) jednu ovladatelnou příběhovou ukázku poptávky na Landing od přijetí po termín, zákazníka a peníze a (3) několik výrazných produktových kapitol. Rozložení a hierarchie se mění, barvy, logo a vizuální identita Dílky zůstávají. Příběhové ukázky na Landing jdou ovládat scrollováním a kliknutím a nepřehrávají se opakovaně automaticky. Směr 4 (přepínání oborů) a 5 (pracovní nástroj jako samostatný vizuální koncept) nebyly vybrány. Backend, produktová pravidla a neodsouhlasené funkce jsou mimo rozsah.
**Proč:** Kryštof 2026-10-17 schválil kombinaci směrů 1–3, zachování vlastní palety a vizuálů a požádal o implementaci v projektu po předání plného kontextu.
**Důsledek:** `docs/REDESIGN-HANDOFF.md` je startovací kontext pro implementaci. V otázkách layoutu a opakovaného přehrávání ukázek má toto rozhodnutí přednost před staršími pokyny v briefu; pravdivá fakta, obsahové limity a systém Dílky zůstávají v platnosti. Před implementací nejprve prověřit současné komponenty a zachovat cizí neuložené změny.

### R-058 · Redesign aplikace Workspace: rozsah, pořadí a rozhodnutí D-1–D-10 (2026-10-18)
**Rozhodnutí:** redesign aplikace `/w/[byznys]` + objednávky `/r` a widgetu podle `docs/workspace/REDESIGN-APP-PLAN.md`, sezení RD00–RD16 (pořadí v plánu, sekce 5; RD16 doporučeně za RD12, RD09 volitelné). Kryštof odsouhlasil 2026-10-18:
- **D-1 soukromí:** úroveň 1 (admin nečte osobní údaje zákazníků klientů, audit + test; sahá na admin, jen s výslovným souhlasem v RD11) + úroveň 2 (režim soukromí v aplikaci). Šifrování sloupců se nedělá.
- **D-2 Návody:** záložky + malé „?“ v záhlaví obrazovek. **D-3 Dnes:** karta zákazníka z třetího sloupce do pravého panelu.
- **D-4 kapacita:** nejdřív více služeb (RD08); skupinové termíny / souběžní zákazníci až v RD09 a rozhodne se znovu.
- **D-5:** QR platba (SPAYD) na fakturách (potřebuje IBAN v profilu dodavatele) i opakované rezervace jsou v rozsahu.
- **D-6:** region Vercelu `fra1` po ověření v dashboardu; projeví se po deployi, ten jen se souhlasem.
- **D-7:** rozpracované změny na `ws/s18` jdou do tří commitů (bezpečnost + migrace 080 + balíčky · landing + redesign R-057 · paměť a dokumenty), po konkrétních souborech a se schválením Kryštofa.
- **D-8:** redesign se vyvíjí na Neon branch s ukázkovými daty (R-041), ne na produkčním Neonu.
- **D-9:** Nastavení z hlavního menu do Účtu, adresy zůstávají.
- **D-10 kontakt zákazníka:** povinný aspoň jeden údaj (telefon nebo e-mail); zatím `mailto:`, přímé odeslání z ZakazIQ po ověření domény v Resendu; osobní zpráva k obsluze smí odejít vždy, nabídky jen se souhlasem.
**Proč:** zadání Kryštofa 2026-10-18 (rychlost, jednoduchost, rezervace pro všechny obory, fakturace, věrnost, daně a soukromí, nastavení, Návody, kontakt jedním klikem); rozfázování a doporučení v plánu.
**Důsledek:** větev `ws/redesign-app` z `ws/s18` (RD00); migrace od 085 se při implementaci připravují a aplikují až po výslovném souhlasu. Kryštof 2026-10-19 schválil aplikaci 080 a 087–091 na produkci; 085/086 byly už dříve aplikované; 084 aplikoval Kryštof 2026-10-31. Admin se nemění (výjimka jen RD11); stav sezení v plánu, sekce 5. Navazuje na R-057.

### R-059 · Kalendář a Zakázky (RD05, RD06): rady k času, barvy, délka, filtry, historie (2026-10-18)
**Rozhodnutí:** (1) Rady k času (`getSlotAdvice`, `lib/ws/slot-advice.ts`) počítá stejná funkce jako objednávka (`computeSlots`), ale bez předstihu (majitel smí zapsat i hned); hledá kolem zadaného času (2 dny zpět, 14 dní dopředu), nikdy do minulosti. Bez nastavené otevírací doby kolizi ověří, návrhy ne a UI odkáže do Nastavení › Otevírací doba. Mimo otevírací dobu je jen upozornění, zapsat jde. (2) Délku termínu jde změnit tažením za spodní okraj nebo výběrem „Délka“ v detailu: začátek se nemění, kolizi rozhodne DB, „Zpět“ 8 s, 15 min až 12 h; **zákazník o změně délky e-mail nedostane**. (3) Barva pracovníka v kalendáři jen při víc pracovnících: uložená `ws.staff.color`, jinak tokeny `--staff-1…5` (světlé i tmavé); nastavení barvy v UI čeká na RD13. (4) Filtry zakázek: *Čeká na mě* = otevřená zakázka v prvním stavu „nová“; *Po termínu* = otevřená zakázka, jejíž poslední termín proběhl a žádný další není; *Bez termínu* = otevřená zakázka bez jediného termínu; otevřená = není uzavřená ani hotovo/zaplaceno/zrušeno. Pohled a filtr jsou v URL (`?pohled=`, `?filtr=`), na telefonu je bez volby výchozí seznam. (5) Historie stavů zakázky se zapisuje do `ws.audit_log` (`job.stage_changed`, názvy stavů opsané) **bez migrace**; starší změny nejsou zaznamenané, zakázka má v historii aspoň den vzniku.
**Proč:** zadání RD05 a RD06 nechalo pojmy otevřené („nová, nepřiřazená“, „po termínu“, „historie stavů beze změny datového modelu“); zvolil jsem nejmenší výklad, který jde ověřit testy a vrátit. E-mail při změně délky by zákazníka rušil bez nové informace (čas začátku je stejný).
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (RD05, RD06)“. Kdyby se mělo posílat upozornění o prodloužení, doplnit `notify` v `resizeAppointment` (`app/w/[business]/poptavky/actions.ts`). Když se začne psát historie i jinými cestami (potvrzení poptávky, portál), použít stejnou akci `job.stage_changed`.

### R-060 · Objednávka RD07, výběr pracovníka a portál poptávky (2026-10-18)
**Rozhodnutí:** `/r` a widget sdílejí `OrderFlow`; widget vkládá `/r/<slug>?embed=1` přes sandboxovaný iframe. U objednávky lze vybrat „Kdokoli“ (sjednocení volných časů způsobilých pracovníků) nebo konkrétního pracovníka; volba se ukládá do `requests.requested_staff_id` a při potvrzení se předvolí, pokud je pracovník stále aktivní a službu nabízí. `GET /api/public/v1/schema` přidává nepovinné `booking.staff` a `staffId` pro filtrování časů; `POST /requests` přijímá volitelné `staffId`. Poptávka dostane `public_token`; dokud čeká, portál ukáže pouze stav, službu a požadovaný čas bez kontaktních údajů. Jakmile vznikne termín, stejný token ukáže běžný portál termínu. Předběžný soubor ICS z objednávky má `STATUS:TENTATIVE` a neblokuje kalendář.
**Proč:** čas od zákazníka je poptávka, nikoli potvrzený termín; stejný formulář ve stránce i widgetu omezuje rozdíly v pravidlech, přístupnosti a dalších úpravách.
**Důsledek:** migrace `087_ws_objednavka_pracovnik_a_portal.sql` je připravená, na Neonu se nespouštěla. RD10 následně obsadilo číslo 088; pro RD08 je nově 089 (R-061).

### R-061 · Fakturace RD10: profil účtu, bezpečné vrácení platby a pořadí migrací (2026-10-18)
**Rozhodnutí:** profil dodavatele ukládá jedno `ws.accounts.invoice_profile` pro celý účet; vystavená faktura dál nese neměnný snímek údajů. Migrace 088 přidává `invoices.payment_origin` a SECURITY INVOKER `money_unpay`. „Zpět“ smaže jen příjem vytvořený platbou faktury, pokud jej mezitím nepoužila návštěva; převzatou platbu zakázky nebo příjem navázaný na termín od faktury odpojí a zachová. UI nabízí „Zpět“ 8 sekund, databáze odmítne platbu starší než 60 sekund. SPAYD QR se generuje jen pro nezaplacenou vystavenou fakturu v CZK s validním IBANem. Migrace 088 je před RD08; RD08 se posouvá na 089.
**Proč:** dodavatel i faktura jsou společné účtu, ale účetní doklady musí zachovat údaje platné při vystavení. Převzaté/kalendářem využité platby jsou skutečné příjmy a nesmějí se při vrácení omylem smazat.
**Důsledek:** profil mění pouze vlastník přes Nastavení › Firma a fakturace. `scripts/ws-grants.sql` uděluje `ws_app` spouštění obou platebních funkcí; migrace 088 je připravená, neaplikovaná. Rozsah a stav RD10: plán redesignu sekce 5 a `docs/workspace/MONEY.md`.

### R-062 · Kontakt zákazníka (RD16) a pět částí Nastavení (RD13) (2026-10-18)
**Rozhodnutí:** RD16 zachovává D-10: při nové poptávce stačí telefon nebo e-mail; zákaznickou kartu lze doplnit později. Duplicitní kontakt nikdy nepřepisuje jiné záznamy potichu, nabídne sloučení. Ruční zprávy mají pět typů; osobní zpráva k obsluze není blokována odhlášením z nabídek, marketingová nabídka vyžaduje souhlas a při čekání ve frontě se pravidla ověří znovu těsně před odesláním. Odeslání do fronty předchází 60s možnost „Zpět“; bez připraveného Resend transportu se otevře `mailto:` a nic se nevykáže jako odeslané. RD13 seskupuje nastavení do Firma, Nabídka, Objednávky, Zákazníci a Komunikace; původní adresy zůstávají přes přesměrování.
**Proč:** kontakt musí jít doplnit u zákazníka bez ztráty jeho vazeb a nabídka musí respektovat odhlášení; pět sekcí snižuje počet samostatných voleb, aniž by rozbilo uložené odkazy.
**Důsledek:** migrace 089 rozšiřuje pouze `message_settings_type_check`; je připravená, na Neonu neaplikovaná. Vložení RD16 přesunulo budoucí migraci RD08 z 089 na 090 (předchozí odhad v R-061 už neplatí). RD13 nemá migraci. Bezpečnostní review opravilo kódování adresy `mailto:` proti vložení parametrů a skončilo bez otevřených nálezů. Plán a technické podrobnosti jsou v `docs/workspace/REDESIGN-APP-PLAN.md` a `docs/AGENTS-REFERENCE.md`.

### R-063 · Skupinové lekce a soukromí v adminu (2026-10-18)
**Rozhodnutí:** Kryštof schválil RD09: majitel vypisuje jednotlivé budoucí lekce z kalendáře, každá má jednu službu, jednoho pracovníka a kapacitu 2–30 míst. Přihlášky sdílejí jediný blok pracovníka a místo se rezervuje atomicky už při podání; majitel může registraci zavřít/otevřít a každého účastníka potvrdit/odmítnout. Odmítnutí místo uvolní. Čekací listina ani souběžné termíny více zákazníků u pracovníka nejsou v rozsahu. Tím se upřesňuje D-4 z R-058. RD11 zároveň omezuje kód adminu: přestává číst poznámky, volný obsah auditu a osobní/finanční obsah zákaznických tabulek; agregace a údaje účtu, byznysů a členů týmu zůstávají. Vlastník tabulek má stále širší technický přístup.
**Proč:** skupinová lekce dostává pevnou kapacitu bez dvojího blokování pracovníka; omezení adminu naplňuje D-1 bez změny databázové role a její správy.
**Důsledek:** migrace 090/091 jsou aplikované na produkci i testovací DB; RD11 migraci nemá. Technické podrobnosti a omezení ověření jsou v redesign plánu a referenci B9; bezpečnostní rozhodnutí #017.

### R-064 · QR platba v PDF přes balíček qrcode (2026-10-31)
**Rozhodnutí:** SPAYD QR v PDF faktury kreslí `qrcode` 1.5.4 (`QRCode.toString(…, {type:'svg'})`), ne `qrcode.react`. `qrcode.react` zůstává jen pro QR v prohlížeči (Nastavení › Napojený web).
**Proč:** route handlery a server actions běží s React serverovým buildem bez hooků; `QRCodeSVG` volá `useMemo` a PDF s QR na Vercelu padalo (`Cannot read properties of null (reading 'useMemo')`). Vitest to nezachytil, běží s běžným Reactem. Kryštof vybral balíček (MIT) před vložením generátoru do repa.
**Důsledek:** `lib/ws/money/pdf.ts`; v kódu pro server nepoužívat React komponenty s hooky přes `renderToStaticMarkup`.

### R-065 · Kontaktní formulář na landing page (2026-10-31)
**Rozhodnutí:** Kryštof vrací na landing formulář, který zapíše dotaz do Hovorů (`client_leads`) s úkolem odpovědět e-mailem do 24 hodin. Podpora používá adresu `info@vizeon.cz`; hero i footer vedou na formulář a e-mail zůstává jako přímá záloha. Vstup chrání serverová Zod validace, honeypot, časový filtr a rate limit `landing_contact`; `/api/public/leads` se nepoužije.
**Proč:** návštěvník může poslat dotaz bez otevření e-mailového klienta a dotaz se objeví v existujícím pracovním seznamu.
**Důsledek:** implementace v `app/(marketing)/actions.ts` a `components/marketing/`; admin soubory se nemění. Rozhodnutí nahrazuje část R-032, která formulář odkládala. Retence kontaktů a právní popis zůstávají součástí právní přípravy spuštění.

### R-066 · Bezplatný pilotní klient (2026-10-31)
**Rozhodnutí:** první pilotní klient ZakazIQ nebude platit.
**Proč:** Kryštof to potvrdil při přípravě launch plánu.
**Důsledek:** délku pilotu a způsob nastavení ve Stripe je nutné doplnit před vytvořením live nabídky; konkrétní pilotní firmu určit samostatně.

### R-067 · Výraznější rozložení při zachování Dílků (2026-10-31)
**Rozhodnutí:** Kryštof požádal o výraznou změnu kompozice, hierarchie a hustoty Landing i Workspace při zachování identity Dílky. Příběh v úvodu má otevřený kalendář s detailem a střídmé pole dílků; na Dnes je kalendář na široké obrazovce hlavní plochou vedle věcí k vyřízení, na telefonu je časově řazená agenda. Široký postranní panel používá popisky vedle ikon.
**Proč:** původní celoplošné pole dílků a velká ukázka s rovnocennými pilulkami působily podle Kryštofa šablonovitě a překrývaly hierarchii obsahu.
**Důsledek:** pravidla a rozměry jsou v `DESIGN.md`, scéně `components/marketing/live-demo.tsx` a sdílené kostře `components/ws/app/`; produktová fakta a stavová pravidla R-057 se nemění.

### R-068 · Interaktivní pole a otevřenější Landing (2026-10-31)
**Rozhodnutí:** R-068 upřesňuje pouze Landing z R-067: v hero zůstává plná interaktivní mřížka Dílků v původních barvách; mohou ji doplnit jemné perspektivní, světelné a stavové pohyby. Odstranit dekorativní rámečky, které neukazují skutečné rozhraní. CTA pravdivě uvádí 14 dní zdarma, kartu při registraci, potom 249 Kč měsíčně a možnost zrušit.
**Proč:** Kryštof chce zachovat živý motiv a produktovou osobitost, ale omezit opakované AI šablonové panely. Přesvědčivý dojem má vycházet z konkrétních ukázek a jasných podmínek.
**Důsledek:** výjimka platí jen pro Landing; Workspace a barvy Dílků se nemění. Pohyb respektuje `prefers-reduced-motion`; bez nové závislosti. Podrobnosti v `docs/landing/PROJECT-BRIEF.md`.

### R-069 · Požadavky klientů z portálu, zadání vkládá člověk (2026-11-01)
**Rozhodnutí:** Kryštof schválil první krok většího nápadu: klient na stávajícím portálu `/p/[token]` (bez přihlášení) napíše nebo nadiktuje požadavek; systém z něj udělá shrnutí a návrh zadání pro Claude Code, upozorní Kryštofa (zvonek, e-mail) a ten zadání zkontroluje a vloží do projektu sám. Hlas se přepisuje přes OpenAI (výchozí `gpt-4o-transcribe`, název modelu v env), audio se neukládá, ukládá se jen text. Automatické spuštění Claude Code z klientova textu (Channels, Routines API) se nedělá. Odloženo a nerozhodnuto: přihlášený klientský prostor, automatické hlášení práce z Claude Code do systému, redesign adminu.
**Proč:** inbox s ručním vložením je nejbezpečnější varianta (text klienta je nedůvěryhodný vstup pro agenta s přístupem k počítači) a nejlevnější; hlas stojí asi 0,07–0,14 Kč za minutu podle agregátorů, ceník OpenAI jsem neověřil. Přihlášený prostor a hlášení z Claude Code potřebují samostatné rozhodnutí o umístění (rozšířit Workspace, nebo samostatný modul) a Workspace ještě nemá produkční Clerk, Stripe live ani ověřený Resend.
**Důsledek:** migrace 092 je připravená, neaplikovaná. Funkce běží na větvi `ws/redesign-app`, na produkci půjde až s jejím sloučením. Poskytovatel přepisu je zpracovatel osobních údajů: doplnit do právních textů a ověřit DPA a evropskou rezidenci. `.claude/security/DECISIONS.md` #018.

### R-070 · Klientský prostor, hlášení práce a nový admin: rozsah a rozhodnutí D-K1–D-K11 (2026-11-01)
**Rozhodnutí:** Kryštof zadal „implementuj veškeré kroky“ plánu `docs/klientsky-prostor/PLAN.md`; tím jsem přijal **doporučení z plánu** u všech D-K1–D-K11 (každé zvlášť nepotvrzoval, napravit lze kdykoli): D-K1 `/klient` s Clerkem a schématem `portal`; D-K2 `/p/[token]` zůstává jako čtení; D-K3 víc členů na klienta; D-K4 součást zakázky (zdarma); D-K5 hlášení se vždy schvalují (automatické publikování nezavedeno); D-K6 layout + Dnes + detail zakázky, Hub stranou; D-K7 úroveň 1 a 2, úroveň 3 ne; D-K8 soubory odloženy (KP08 nezačato); D-K9 práce na `ws/redesign-app`; D-K10 retence 3 roky (nezavedeno, patří do KP10); D-K11 firma klienta je `portal.clients`. Platí zásada: cokoli zvenku je koncept ke schválení, nic se nespustí ani nepublikuje samo.
**Proč:** zadání Kryštofa 2026-11-01; plán počítal s těmito doporučeními.
**Důsledek:** `docs/klientsky-prostor/PLAN.md` (stav sezení v sekci 6), R-071–R-073, `.claude/security/DECISIONS.md` #019–#020. Navazuje na R-069.

### R-071 · Kostra administrace na Dílky, obsah beze změny (2026-11-01)
**Rozhodnutí:** `/dashboard` a `/alteno` mají společnou kostru (`components/admin/admin-shell.tsx`): postranní menu, spodní lišta na telefonu, hledání ⌘K. Kostra používá barevné tokeny Dílků v samostatném rozsahu `data-app="admin"` (`app/admin-tokens.css`, bez přepsání proměnných shadcn); obsah stránek zůstává na původním vzhledu (Inter, `brand-*`) a přepíná se po stránkách. Hub si nechává vlastní postranní panel. `/dashboard` je nově Dnes, seznam zakázek je `/dashboard/zakazky` (obě firmy), detail zakázky má záložky. Starý `MobileNav` smazán.
**Proč:** zadání „admin je škaredý a roztříštěný“ (KP01/KP02) při minimálním riziku pro produkční admin: žádná stránka neztratila funkci, staré adresy fungují.
**Důsledek:** upřesňuje R-027 (admin se vzhledově mění jen v kostře). `docs/admin/AGENTS-ADMIN.md` → Kostra administrace. Nová stránka adminu = položka v `lib/admin-nav.ts`.
**Nepřevedeno:** změna stavu a fáze jedním klikem se „Zpět“ (`updateProject` posílá klientovi e-mail, „Zpět“ by ho poslal podruhé).

### R-072 · Aktivita zakázky a hlášení z Claude Code (2026-11-01)
**Rozhodnutí:** zprávy „co se udělalo“ jsou v `project_activity` (migrace 093) jako koncept → schválit → klient je vidí na `/p` i `/klient`. Souhrnný e-mail klientovi max. 1× za 24 h. Klíč projektu pro Claude Code (`project_agent_keys`, migrace 094, vlastní `AGENT_KEY_PEPPER`) umí jen uložit koncept; server zakrývá klíče, tokeny, connection stringy, `.env` řádky a cesty v domovské složce a takový koncept nejde schválit bez úpravy. Skript `scripts/zakaziq-report.mjs`, skill `zakaziq-hlaseni`, návod `docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md`.
**Proč:** KP03/KP04; klíč leží v cizím projektu a může uniknout, proto nejmenší možná síla (DECISIONS #019).
**Důsledek:** hlášení dělá člověk po člověku schválením. Automatické publikování (D-K5) až po důvěře. Hook v návodu je jen připomenutí na konci sezení (`SessionEnd`); pole vstupu hooků jsem nečetl celá.

### R-073 · Klientský prostor: schéma portal, pozvánky, Clerk bez organizací (2026-11-01)
**Rozhodnutí:** `/klient` pro přihlášené klienty (Clerk, bez organizací), data ve schématu `portal` a role `portal_app` bez práv do `public` (migrace 095, 096; `scripts/portal-create-role.js`, `DATABASE_URL_PORTAL`). Do `portal` jde jen schválené triggerem (vybrané sloupce zakázky, aktivita `published`). Klient zapisuje požadavek, zprávu a hodnocení jen funkcemi `portal.submit_*` (členství, limity, zápis i do interních tabulek admina). Vstup přes jednorázovou pozvánku (HMAC hash, 14 dní, volitelně vázaná na ověřený e-mail, uplatnění tlačítkem). Hodnocení se nabídne samo, když je zakázka hotová nebo zaplacená (jednou na člena). Správa v adminu `/dashboard/klientsky-prostor`. Předání do Claude Code úroveň 2: tlačítko „Příkaz pro terminál“ (text v souboru přes heredoc, ne v `$(…)`; první verze s `$(…)` se při zkoušce v bash 3.2 dala zneužít řádkem `)"` v textu).
**Proč:** KP05–KP07, KP09; oddělení klientů nesmí záviset na jedné podmínce v kódu (DECISIONS #020).
**Důsledek:** `proxy.ts` má pro `/klient` a `/api/klient` vlastní Clerk middleware, CSP `workspace` s Clerkem i na `/klient` (CSP-LOG v6), `microphone=(self)` i na `/klient/*`. Odchylka od plánu: formulář požadavku v prostoru je společná komponenta `ClientRequestBlock` v původním vzhledu (`brand-*`), ne přepsaná do Dílků.

### R-074 · Zrušení účtu ke konci zaplaceného období (2026-11-01)
**Rozhodnutí:** (D5) po zrušení účtu doběhne předplatné do konce zaplaceného období (`cancel_at_period_end` ve Stripe, i během zkušební doby), nic se nevrací ani nedoplácí. Až předplatné skončí, účet se zavře (archivace byznysů) a teprve pak běží 30denní lhůta do výmazu. Nezaplacené předplatné (`past_due`, `unpaid`…) končí hned. Před koncem období jde zrušení vzít zpět („Nechat účet“), obnovení předplatného v Portalu naplánování zruší.
**Proč:** rozhodl Kryštof 2026-11-01 (doporučená varianta): zákazník nepřijde o zaplacené dny a odpadá spor o vrácení i poplatky za refundace.
**Důsledek:** migrace 097 (`accounts.close_scheduled_at`, `ws.schedule_close_account`, `unschedule_close_account`, `finish_scheduled_close`, `scheduled_closings`), dokončení z webhooku Stripe a záložně z cronu `ws-gdpr`. Customer Portal ve Stripe live nastavit na zrušení ke konci období. Upravuje R-054 bod 3. Reference B3 „Zrušení účtu“, `/podminky`.

### R-075 · Hlavní host www.zakaziq.cz (2026-11-01)
**Rozhodnutí:** (D1) hlavní adresa je `https://www.zakaziq.cz`, apex přesměrovává na www. `NEXT_PUBLIC_APP_URL`, webhooky Stripe a Clerku, canonical, sitemap a `security.txt` míří na www.
**Proč:** rozhodl Kryštof 2026-11-01; Stripe webhook nenásleduje přesměrování, Vercel už www používá.
**Důsledek:** `.env.example`, výchozí `SITE_URL`, kód widgetu na landing a `security.txt` přepnuté na www. `NEXT_PUBLIC_APP_URL` ve Vercelu Production se mění až s nasazením Workspace (dnes ho používá starý admin build).

### R-076 · Retence dat klientů: 3 roky od posledního pohybu dokončené zakázky (2026-11-01)
**Rozhodnutí:** (D-K10) dokončená zakázka (`done`/`paid`), na které se 3 roky nic nestalo (změna zakázky, aktivita, požadavek ani zpráva), přijde o aktivitu, požadavky (`client_requests`, `portal.requests`), zprávy a slovní hodnocení. Zakázka, cena, platby a číselné hodnocení zůstávají. Pozvánky do klientského prostoru se mažou 90 dní po použití, zrušení nebo vypršení. Rozpracované zakázky se nemažou. Žádost GDPR se řeší okamžitě ručně.
**Proč:** Kryštof 2026-11-01 odsouhlasil návrh („pojďme do toho“) k D-K10 z R-070. Lhůta od posledního pohybu chrání klienta, který se ke staré zakázce vrátí.
**Důsledek:** migrace 098 (`public.purge_client_retention`, jen vlastník tabulek), cron `/api/cron/client-retention` denně 3:30 UTC, `lib/client-retention.ts`, test `lib/__tests__/client-retention.test.ts`. Zmínit v právních textech (KP10).


### R-077 · Objednávací stránka jen po dokončené registraci (2026-11-03)
**Rozhodnutí:** `/r/[slug]` a widget podle slugu fungují jen pro účet, který aspoň jednou dokončil Stripe Checkout (má řádek ve `ws.subscriptions`). Po skončeném nebo nezaplaceném předplatném se poptávky přijímají dál (R-045, B5). Nedokončené registrace se nemažou (AGENTS.md: účty ani data se kvůli neplacení nemažou); případný úklid je samostatné rozhodnutí.
**Proč:** review před spuštěním 2026-11-03, opravu Kryštof zadal („oprav vše“). Účet s byznysem vzniká před Checkoutem (R-038). Kdokoli by tak dostal zdarma veřejnou objednávku na zakaziq.cz pod libovolným názvem firmy a poptávky skutečných lidí by nikdo nečetl.
**Důsledek:** migrace 099 (`ws.business_by_public_slug`), test v `ws-intake.test.ts`. Klíče webu (API, widget s klíčem) se nemění. Pozvaný klient (S17) má objednávací stránku až po dokončení Checkoutu. `.claude/security/STATE.md` → Aplikace.
### R-078 · Nadpisy landing page bez vzhledu AI šablony (2026-11-03)
**Rozhodnutí:** nadpis na landing page je jedna obyčejná věta jedním písmem (Instrument Sans). Nemá kurzívu Instrument Serif v druhé půlce ani štítek nebo číslo sekce nad sebou („01 — Proč to řešit“, „01 / 04“). Popisek „Ukázka“ je malým textovým písmem, ne verzálkami v JetBrains Mono. Hero zůstává „Každá poptávka na svém místě.“ (bez kurzívy). Nové nadpisy: „Den, kdy máte plné ruce.“, „Co vám zůstane po návštěvě.“, „Od objednávky po zaplacení.“, „Zapněte si jen to, co použijete.“, „Web vám postavím a rovnou napojím.“, „Všechny funkce za jednu cenu.“, „Než se zaregistrujete.“, „Máte ještě nějaký dotaz?“, v patičce „První poptávku můžete přijmout ještě dnes.“
**Proč:** Kryštof 2026-11-03 chtěl, aby landing nepůsobila jako vygenerovaná. Kontrola skillem `design-taste-frontend` našla kurzívu ve 12 nadpisech, 64 drobných štítků verzálkami a stejný vzorec „Věta. Druhá věta.“ v každé sekci.
**Důsledek:** upravuje R-021 (serifová kurzíva se na nadpisech landing page nepoužívá, ve Workspace zůstává) a R-031 (pořadí sekcí platí, čísla se nezobrazují). Mono jen pro časy, data a částky. `SectionHead` nemá `number`, `label` ani `accent`. Upraveno v `docs/landing/PROJECT-BRIEF.md`, `DESIGN.md` a `.impeccable/design.json`.

### R-079 · Právní texty připravil agent, schvaluje Kryštof (2026-11-03)
**Rozhodnutí:** obchodní podmínky, ochrana údajů a zpracovatelská smlouva (čl. 28 GDPR) jsou na webu v plném znění. Napsal je agent podle skutečného chování aplikace a zákona, na zadání Kryštofa („pojďme to vyřešit“). Provozovatel podle ARES: Kryštof Sobotka, Kamenice 64, 294 04 Dobšín, IČO 29977231, živnostenský úřad Magistrát města Mladá Boleslav, neplátce DPH. Volby, které agent zvolil a Kryštof 2026-11-03 potvrdil: služba jen pro podnikatele (ne spotřebitele); odpovědnost omezená na zaplacené za 12 měsíců (ne úmysl, hrubá nedbalost, přirozená práva); změna podmínek, ceny i odebrání funkce oznámení 30 dní předem; nový zpracovatel 14 dní předem s možností ukončit; porušení zabezpečení oznámit do 48 h; audit 1× ročně na náklady správce; ukončení služby z naší strany s výpovědí 3 měsíce a vrácením předplaceného; dotazy z kontaktního formuláře nejdéle 3 roky od poslední komunikace; ze záloh databáze data zmizí nejpozději do 30 dní (maximum historie Neonu).
**Proč:** blokovalo spuštění (LAUNCH-PLAN stopa A). Fakta ověřená v kódu (lhůta po nezaplacení 7 dní, zrušení R-074, výmaz R-054, IP u formuláře 1 den, otisk IP u poptávek, odhlášení v nabídkách) a v ARES; region Neonu podle záznamu RD00 (eu-central-1).
**Důsledek:** nahrazuje R-023 v části „právní texty se negenerují“. Údaje provozovatele a seznam zpracovatelů jen v `components/marketing/legal.ts` (patička, tři stránky, záznam o zpracování v Účtu); nový zpracovatel nebo změna chování = upravit text a `LEGAL_VERSION` a oznámit e-mailem. Souhlas s podmínkami pod tlačítkem „Pokračovat k platbě“. Stránky jsou indexované a v sitemapě (konec `LEGAL_ROBOTS` z R-055). Neon nesmí držet historii, snímky ani větve s produkčními daty déle než 30 dní, jinak upravit text. Kontrolu právníkem Kryštof nechce (2026-11-03), texty platí tak, jak jsou.

### R-080 · Řemeslné skilly třetích stran: co se vzalo, co ne a čím jsou omezené (2026-11-10)
**Rozhodnutí:** (1) `impeccable` zůstává v repu (4.8.2, engine 0.1.22) a synchronizuje se do `.agents/`. (2) Ostatní řemeslné skilly jsou **uživatelské** (`~/.claude/skills/`, `~/.agents/skills/`), nejsou součástí repa a nepřenesou se na jiný počítač ani do worktree; `design-taste-frontend` (tasteskill 2.5.1) tím z repa odešel. (3) Nainstalováno 9 skillů z `emilkowalski/skills` (pohyb, telefon, odolnost UI, sonner), 4 z `vercel-labs/agent-skills`, 5 z `affaan-m/ecc` a `grill-me` + `grilling` z `mattpocock/skills`. (4) Žádný z nich nepřebíjí pravidla projektu; kdy co a čím je to omezené je v referenci → Skills. (5) tasteskill má ze `SKILL.md` odstraněný Stop hook, gate (`scripts/gate.mjs`) se pouští ručně.
**Proč:** Kryštof 2026-11-10 vybral „vybraná sada + pár z ECC“, „upgrady v repu, nové uživatelsky“ a „bez Stop hooku“. 37 MB assetů tasteskill by se synchronizací do `.agents/` zdvojilo a zůstalo natrvalo v git historii, a jeho hlavní hodnota je stavba nových webů (weby klientů), ne hotová landing page ZakazIQ s Dílky. Harness `affaan-m/ecc` (314 skillů, 71 agentů, 98 příkazů, 7 hooků, vlastní `CLAUDE.md` a `AGENTS.md`) se nebral celý: šel by do křížku s R-013, R-046 a R-047 a popisky všech skillů se načítají do každého sezení. Stop hook tasteskill by pouštěl Node a Chrome po každém zastavení (timeout 600 s) i v sezeních, kde se landing neřeší.
**Důsledek:** záměrně **nenainstalováno** — `deploy-to-vercel` a `vercel-cli-with-tokens` (deploy jen se souhlasem, B12), `writing-guidelines` a `copy-lint` tasteskill jako pravidlo (pravidla anglické prózy; na české texty platí `zakaziq-ux-texty-cs` a `humanize-text-cs`), `conventional-commit-review` (commity jsou `ws/oblast: …`, R-015), `architecture-decision-records` a `design-system` z ECC (rozhodnutí patří do `memory/memory.md` jako `R-xxx`, vzhled do `DESIGN.md` a Dílků), `security-review` z ECC (překrývá B13 a `web-security-review`), `react-performance` z ECC (je to kopie `react-best-practices`), `animate-expo`, `write-swift`, `react-native-skills`, `react-view-transitions`. `e2e-testing` **není** schválení Playwrightu — nová závislost potřebuje vlastní rozhodnutí. Po reinstalaci počítače je nutné uživatelské skilly nainstalovat znovu. Zdroje: `leonxlnx/taste-skill`, `emilkowalski/skills`, `vercel-labs/agent-skills`, `affaan-m/ecc`, `mattpocock/skills` (MIT), `pbakaus/impeccable` (Apache-2.0).

### R-081 · Dílky jsou vizuální systém i v admin konzoli (2026-11-10)
**Rozhodnutí:** design systém Dílky platí pro celé repo včetně admin konzole (VIZEON, ALTENO, Hub). Paleta Dílků se přesouvá na `:root` (nový `app/tokens-dilky.css`), Inter z Google Fonts se ruší, admin dědí Instrument Sans a `components/ui/*` se v adminu odemkne (`PortalContainerProvider`, shadcn proměnné v rozsahu `[data-app="admin"]`). Admin **nemá** tmavý režim. Rozsah: mechanické sjednocení všude (`brand-*` → `navy-*`, odznaky, rádiusy, písmo) + ruční překreslení denně používaných obrazovek. Hub je v rozsahu.
**Proč:** Kryštof 2026-11-10: „je to moc retro, škaredé CRM oproti tomu SaaS, nechci se za to stydět." Dva vizuální systémy v jednom repu zdražují každou změnu. Hodnoty `brand-50…950` jsou shodné s `--navy-*` ve všech 11 odstínech (ověřeno), takže přejmenování je opticky neutrální.
**Důsledek:** **přepisuje R-027** („admin se nesmí změnit ani o pixel") a **rozšiřuje R-071** (dosud jen kostra). Ruší zákaz v `DESIGN.md` i obě výjimky `inter` v `.impeccable/config.json`. Past: `navy-*` je `var(--navy-…)` jen v `[data-app]`, zatímco `brand-*` je pevný hex — bez palety v `:root` by přejmenování rozbilo barvy klientům v portálu `/p`, `/h` (importuje `StatusBadge`, `FeedbackBlock`, `SurveyForm`, `BookingCTA`, `ClientRequestBlock`). Plán: `docs/admin/MODERNIZACE-ADMIN-PLAN.md` sekce 4.

### R-082 · Modernizace adminu paralelně se spuštěním Workspace (2026-11-10)
**Rozhodnutí:** admin se modernizuje na vlastní větvi `admin/modernizace` a **neblokuje** spuštění Workspace. Rozfázováno do sezení AD00–AD18 (`docs/admin/MODERNIZACE-ADMIN-PLAN.md`, prompty `new - area of zakaziq/prompty/admin/`). Migrace se jen připraví, aplikuje je Kryštof, číslování od 100. Žádný nový npm balíček. Testovací data: admin migrace na testovací Neon + `scripts/admin-seed.mjs` po vzoru `ws-seed.mjs`.
**Proč:** Kryštof 2026-11-10 vybral „paralelně"; zbývající kroky launche jsou hlavně na jeho straně (Stripe live, Google OAuth, migrace 097–099, Vercel Pro).
**Důsledek:** **otevřené:** nová kostra adminu (R-071) leží jen na `ws/redesign-app` (92 commitů před `main`, opačně 0 → sloučení je fast-forward), takže admin se na produkci dostane až s jejím sloučením. Varianty a doporučení jsou v plánu, sekce 8 (otázka A) — rozhodnutí o nasazení Kryštof ještě neudělal. Soubory `app/globals.css`, `tailwind.config.ts`, `next.config.mjs`, `lib/security/csp.ts` a `app/layout.tsx` mění jen admin větev, Workspace si je bere rebasem.

### R-083 · Faktury se budou vystavovat v adminu (2026-11-10)
**Rozhodnutí:** admin bude faktury vystavovat, ne jen archivovat cizí PDF. Rozšíří se tabulka `invoices` (`kind` s `DEFAULT 'archived'`, `items jsonb`, `issuer jsonb`), ne nová evidence; číslo přidělí atomická funkce `admin_invoice_issue` se zámkem po vzoru `ws.money_issue`; profil dodavatele v `admin_settings`, na dokladu snímek. PDF se **sdílí** s Workspace (`lib/invoice-pdf/render.ts` vytažený z `lib/ws/money/pdf.ts`), QR přes už přítomný `qrcode`. Archiv cizích PDF a dnešní `syncInvoiceTransaction` zůstávají funkční.
**Proč:** Kryštof 2026-11-10: „zjednodušit fakturaci, nemuset furt něco opisovat." Dnes dělá fakturu v jiném nástroji a do adminu nahrává PDF; číslo, splatnost, IČO a odběratel vypisuje ručně u každé faktury znovu, IČO/DIČ klienta v DB vůbec není.
**Důsledek:** migrace 103 a 104; `DEFAULT 'archived'` nechá každý existující řádek archivem, takže dnešní obrazovky se nemění. Opraví se i to, že **EUR faktura se v ledgeru sčítá s korunami** (`finance_transactions` bez `currency`). Vědomě se nechává: `updateProject` přepisující `declared`, dvě sady daňových sazeb, `pdf_data bytea` v řádku. ARES lookup potřebuje vlastní rozhodnutí (R-086 v AD12).

### R-084 · AI v adminu navrhuje, člověk potvrzuje; kontakt odkazy, ne VoIP (2026-11-10)
**Rozhodnutí:** (1) AI asistent z věty udělá **strukturovaný návrh akce** (Zod + `messages.parse`, ne tools), uloží ho jako koncept do `ai_suggestions` a provede ho až server action po kliknutí; nikdy nezapíše, neodešle ani nesmaže nic sám. (2) Modely na jednom místě (`lib/ai/models.ts`): haiku na odvozování a čtení PDF **místo dnešního `claude-opus-5`** (~50× dražší na tutéž práci), sonnet na asistenta. (3) Kontakt jedním klikem přes `tel:`, `mailto:`, `sms:` a WhatsApp + šablony zpráv, které plní odkaz a neposílají samy. **VoIP se nedělá.**
**Proč:** Kryštof 2026-11-10 vybral „navrhne, potvrdím klikem" a „jedním klikem přes telefon/Mac". Text od klienta je nedůvěryhodný vstup (R-069), takže AI nesmí konat; strukturovaný výstup navíc obchází to, že vynucené `tool_choice` na opus-5-5 a sonnet-5-5 vrací 400.
**Důsledek:** migrace 105. Povinná součást: oprava `app/api/ai-assistant/route.ts`, který dnes přijímá `systemPrompt` i `messages` z prohlížeče bez validace (jediná ochrana je přihlášení) — zápis do `.claude/security/`. Seznam „co asistent nesmí" je v plánu, sekce 5 (AD14).

### R-085 · Paměť projektu: předvyplnění z historie a AI shrnutí odděleně (2026-11-10)
**Rozhodnutí:** dvě oddělené vrstvy. (1) **Deterministické předvyplnění** (`lib/admin/memory/facts.ts`) — čistě SQL nad historií, bez AI, nikdy se neukládá jako text; **jen tohle plní formuláře.** (2) **AI shrnutí kontextu** (`project_memory`, scope projekt/kontakt/globální) — zapisuje se na kliknutí, nebo cronem jako „Návrh paměti" s `confirmed_by IS NULL`; nepotvrzené je označené a vyprší za 90 dnů. Do paměti se nesmí dostat klíče ani connection stringy — každý text projde `redact()` z `lib/project-activity.ts`.
**Proč:** Kryštof 2026-11-10 vybral „paměť + shrnutí od AI". Do předvyplněného pole ale nesmí vstoupit text, který napsal model — jinak by se vymyšlený údaj tvářil jako historický fakt (B10).
**Důsledek:** migrace 105 společně s R-084. Retence 3 roky od posledního pohybu podle R-076, smazání kontaktu maže i jeho paměť (`ref_id` je polymorfní, FK to neudělá), řádky paměti patří do exportu údajů.

### R-087 · Hub se ruší, admin má jednu navigaci (2026-11-10)
**Rozhodnutí:** `/hub` zaniká. Finance a daně, Projekty a Startup se přesouvají do hlavní navigace (`/dashboard/finance`, `/dashboard/projekty`, `/dashboard/startup`), `/hub/*` trvale přesměrovává. Admin má jedno menu se čtyřmi skupinami: Přehled, Práce, Peníze, Osobní. `components/HubSidebarNav.tsx`, `app/hub/layout.tsx` i `app/hub/page.tsx` se mažou; maže se i mrtvé `app/dashboard/projekty/**` (559 ř., duplikát po R-007). Dnes dostane sloupec „Jak se daří tenhle měsíc" z existujících `getBusinessIncome`, `calculateTax` a `getInvoices`.
**Proč:** Kryštof 2026-11-10 večer: „pro celou appku platí jeden přehled". Dvě navigace a tři layouty znamenaly dva světy a žádné společné číslo. Zrušený Hub se navíc nemusí překreslovat do Dílků, takže to ubírá práci v AD05 i AD17.
**Důsledek:** **mění R-081** v části „Hub je v rozsahu modernizace" — modernizuje se celý admin, ale Hub se místo překreslení ruší. Provádí AD03; plán `docs/admin/MODERNIZACE-ADMIN-PLAN.md`.
**Provedeno 2026-11-11 (AD03), se třemi upřesněními:** (1) kalkulačka **Výkonnost podnikání** z `/hub/byznys` se nemazala, přesunula se do Finance › Podnikání — rozcestník s dlaždicemi byl duplicitní s menu, ale kalkulačka počítá z reálných dat. (2) **Kontakty v menu zatím nejsou**: obrazovku staví AD09 a menu nemá slibovat, co neexistuje; Dokončené a Hodnocení v Práci zůstávají do AD11/AD16 (R-090). (3) Skupin je nakonec **pět** (SaaS část Klienti zůstala zvlášť) a na spodní liště telefonu je místo Požadavků klientů hlavní inbox **Poptávky z webů**.

### R-088 · Alteno není byznys, ale zdroj poptávky (2026-11-10)
**Rozhodnutí:** VIZEON a ALTENO přestávají být dva byznysy. Zůstává jeden byznys se třemi zdroji poptávek: **vizeon.cz, alteno.cz, prvotka.cz** (estetik.cz má být jeden řádek konfigurace). Sloupec `business` se **přejmenuje na `lead_origin`** (nezahazuje se — ruční zakázka z `/alteno` má `source='manual'` a informace o původu je jen tam). Funkce `is_vizeon_pending()` a `is_alteno_pending()` nahradí generovaný sloupec `lead_pending`. Sekce `/alteno/**` zaniká a přesměrovává; `lib/business.ts` se mění na `lib/lead-origins.ts`. Veřejná API `/api/public/booking/alteno` a `/api/public/alteno-leads`, jejich payload i klíče `ALTENO_API_KEY` a `ALTENO_LEAD_WEBHOOK_SECRET` **zůstávají beze změny** — volá je cizí repozitář.
**Proč:** Kryštof 2026-11-10: „Alteno neruším, poptávka furt přijít může, jen to chci dát jako součást Vizeonu." Kryštof dnes dělá weby, e-shopy, design i automatizace — je to jeden byznys. Dvojí model stál sedm míst s natvrdo zapsaným `business: 'vizeon'` (tabulky `completed_projects`, `project_surveys` a `client_leads` sloupec nikdy neměly) a ALTENO zakázky kvůli němu neměly fakturaci ani dokončení.
**Důsledek:** **mění R-008.** Staré ALTENO zakázky získají fakturaci, dokončení i poznámky schůzek; historická ALTENO data se objeví v kalendáři a Hovorech, odkud byla dosud filtrovaná. Rate limit zůstává per zdroj. Migrace 102, provádí AD02.
**Provedeno 2026-11-11 (AD02), s dvěma upřesněními:** (1) místo slití `alteno_confirmed` do `vizeon_confirmed` vznikl **jeden nový příznak** `lead_confirmed` + `lead_confirmed_at`; staré příznaky zůstávají a drží je v souladu trigger, takže se zahodí samostatnou migrací až po provozu. (2) Přejmenování sloupce je nekompatibilní se starým buildem adminu, proto se **migrace 102 aplikuje na produkci jen spolu s nasazením větve** `admin/modernizace`, ne dřív. Názvy env proměnných s klíči jsou v `LEAD_ORIGIN_KEYS` odděleně od `LEAD_ORIGINS`, protože ten se importuje i do klientských komponent.

### R-089 · Škola, Sport a zdraví, Plány a Šablony webu se mažou (2026-11-10)
**Rozhodnutí:** z adminu mizí celé sekce Škola (`/hub/school`), Sport a zdraví (`/hub/sport`), Plány (`/hub/plany`) a Šablony webu (knihovna i bloky u zakázek) — kód i **tabulky**: 23 tabulek `school_*`, `nutrition_logs`, `workout_logs`, `health_scores`, `weight_logs`, `plan_*`, `plans_legacy_archived` (migrace 100) a `project_blocks` + `block_templates` (migrace 101). Odchází i cron `scrape-school`, `lib/lernsax.ts`, `lib/besteschule.ts` a `lib/fatsecret.ts`. **Před spuštěním migrací se obsah vyexportuje do CSV mimo repo.**
**Upřesněno 2026-11-11 (AD01):** závislost `@dnd-kit/*` **zůstává** — používá ji `components/ws/settings/sortable-list.tsx` (pořadí služeb, stavů, kolonek a pracovníků v Nastavení Workspace, R-054). Odstranění by rozbilo Workspace.
**Proč:** Kryštof 2026-11-10: „to už nemá absolutně žádný smysl". Nepoužívané moduly by jinak v AD04 vstoupily do codemodu přes 143 souborů a v AD17 do překreslování.
**Důsledek:** `puppeteer-core` a `@sparticuz/chromium` **zůstávají** — scraper školy byl jejich jediný dnešní konzument, ale PDF faktur v AD12 je potřebuje. `DROP TABLE` je jediná nevratná věc celého plánu, proto až po potvrzeném exportu. Provádí AD01.

### R-090 · Dokončené se slučují do zakázky, hodnocení chodí samo (2026-11-10)
**Rozhodnutí:** zakázka ve stavu `done` nebo `paid` **je** dokončená. `completed_projects` (dnes plná kopie zakázky s vlastní cenou) se přejmenuje na `completed_projects_archiv`, hodnocení se přepojí na `project_id`, zakázka dostane `closed_at` a `project_type`. Stránky Dokončené a Hodnocení mizí z menu — obojí je v zakázce a na kartě kontaktu. Dotazník odejde **automaticky** při uzavření zakázky, jedna připomínka po sedmi dnech, pak už nic; z hodnocení se souhlasem jde jedním klikem vzít text reference pro web (ke zkopírování, ne automatická publikace). Přibývá **předávací dokument** pro klienta („co bylo dodané") generovaný stejnou cestou jako PDF faktury.
**Proč:** Kryštof 2026-11-10. `createCompletedProject` umí založit příjem znovu nezávisle na zakázce — odtud riziko dvojího započtení; Dokončené a Hodnocení přitom čtou týž dataset a liší se jen filtrem. Dotazník se dnes posílá jen při ručním kliknutí a při nereagujícím klientovi se odkaz kopíruje ručně.
**Důsledek:** migrace 106 a 110. **Součet příjmů za 2026 a 2025 musí po migraci sedět na korunu**, jinak se migrace vrací; `completed_projects_archiv` se nemaže, dokud to neplatí. Odpadá dluh z `AGENTS-ADMIN.md:355` (změna stavu jedním klikem) — e-mail klientovi jde přes `after()` s 60s odkladem a „Zpět" ho zruší. Provádí AD11 a AD16.

### R-091 · Tón odznaku nese naléhavost, ne druh (2026-11-11)
**Rozhodnutí:** admin má pět tónů odznaků (`lib/admin-status.ts`): `neutral` (nic se neděje, kategorie), `info` (běží), `signal` (čeká na vás), `success` (uzavřeno), `danger` (konec bez výsledku). Vykresluje je `components/ui/badge.tsx`. Stav zakázky: `new` a `review` = `signal`, `in_progress` a `done` = `info`, `paid` = `success`. **Kategorie** (typ akce v Hovorech, druh změny, oblast života, kategorie nákladu, zdroj daňové novinky) jsou vždy `neutral`. Škála (náročnost 1–10) roste tmavostí, ne odstínem. Obrazovka si vlastní barvu odznaku nedefinuje.
**Proč:** pět stavů zakázky se na pět tónů 1:1 namapovat nedá, takže tón musí znamenat něco obecnějšího než konkrétní stav. Deset vlastních palet ve 40 kombinacích znamenalo, že stejný odstín říkal na dvou obrazovkách něco jiného, a barvy u kategorií z nich dělaly stavy, kterými nejsou. Dílky mají jednu paletu a jedinou teplou barvu (`signal`) vyhrazenou pro „čeká na vás“.
**Důsledek:** nový stav = řádek v `lib/admin-status.ts`, ne nová třída v komponentě. Ztratilo se rozlišení „hotovo“ × „běží“ barvou (rozlišuje je popisek) — kdyby to vadilo, přidá se šestý tón, ne vlastní paleta. Barvy událostí ve `SmartCalendar` (`CHANNEL_COLORS`, `KIND_COLORS`) stojí mimo: nejsou to odznaky stavu, řeší je AD08. `docs/admin/AGENTS-ADMIN.md` → Kostra administrace.


### R-092 · Admin čte z databáze v dávkách; kolo = požadavek, ne dotaz (2026-11-11)
**Rozhodnutí:** obrazovky adminu čtou přes `lib/admin/db.ts` — `adminDb.batch([...])` pošle víc
dotazů jedním požadavkem (Neon HTTP transakce). `lib/db.ts` zůstává pro zápisy a zhruba padesát
starších souborů; **nové a přepisované čtení jde přes `adminDb`**. Chybějící tabulku snese
`batchTolerant` (transakce padá celá, tak se dotazy zkusí jednotlivě). Měřítko rychlosti je
od teď **počet požadavků**, ne počet dotazů: osm dotazů v jedné dávce je po síti jedno volání.
`pg_trgm` a trigramové indexy v migraci 103 se zakládají dřív, než je kdo použije (hledání
v databázi staví AD07).
**Proč:** admin byl jediná datová vrstva v repu bez dávkování — `lib/ws/db.ts`, `lib/ws/admin/db.ts`
i `lib/portal/db.ts` ji mají. Každý dotaz byl samostatný HTTPS požadavek, takže detail zakázky
stál dvanáct cest tam a zpět v pěti vlnách za sebou. Počítat dotazy by po dávkování mátlo:
číslo by kleslo, i kdyby se nic nezrychlilo, nebo naopak.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Jak admin čte z databáze"; strop drží
`lib/__tests__/admin-db-rounds.test.ts`, naměřené hodnoty plán modernizace sekce 11. Čísla kol
z AD00 nejsou s pozdějšími přímo porovnatelná. Nezaměňovat `lib/admin/db.ts` (tabulky adminu
ve schématu `public`) s `lib/ws/admin/db.ts` (admin nad schématem `ws`, R-052).

### R-093 · Kalendář čte okno, zobrazení zůstává v prohlížeči (2026-11-12)
**Rozhodnutí:** `/dashboard/calendar` stáhne jen **měsíc kotvy ± 7 dní** (`windowFor`); proklik mimo
načtené okno dotáhne server action `loadCalendarMonth` a `replaceRange` vymění, co do okna padá.
Rozsah si počítá server z kotvy `'YYYY-MM-DD'`, nikdy nepřijde z prohlížeče. Který měsíc a jaké
zobrazení je vidět, zůstává ve **stavu komponenty**, ne v adrese. Dotazy nad `timestamptz`
porovnávají okamžiky (`starts_at >= $1`), ne `AT TIME ZONE … ::date`. Vykreslování počítá v pražské
zóně nad `'YYYY-MM-DD'` a minutách (`pragueDayOf`, `pragueMinutesOf`, `isoWeekday`), ne nad `Date`.
**Proč:** do prohlížeče šla celá historie `calendar_events`, `consultation_slots`, deadlinů
a plánovaných hovorů a objem rostl s délkou provozu (tři roky dat = 4 380 řádků, okno 176).
Stav v adrese — jak to po AD07 má zbytek adminu — by při každém kroku o měsíc problikl
kostlivcem z `loading.tsx`, protože změna searchParams je navigace. `AT TIME ZONE` v podmínce
zahodí index z migrace 103. `getHours()` zahazuje minuty i zónu (jedna ze tří chyb z AD08).
**Důsledek:** nový dotaz kalendáře **musí** mít podmínku okna, hlídá to `admin-bundle-guard.test.ts`.
Zobrazený měsíc nejde poslat odkazem (dřív to taky nešlo). Kdyby byl stav v adrese potřeba,
musí se nejdřív vyřešit kostlivec. `docs/admin/AGENTS-ADMIN.md` → `/dashboard/calendar`.

### R-094 · `next/dynamic` v adminu ne, Framer Motion líně přes `LazyMotion` (2026-11-12)
**Rozhodnutí:** admin animuje výhradně přes `m` a balíček Framer Motion se načítá líně
z `AdminRoot` (`LazyMotion` + `lib/admin/motion-features.ts`), stejně jako Workspace od RD03.
`next/dynamic` se **nepoužívá**. Výjimka z `m` je `BookingModal` na portálu `/p`, který kořen
adminu nemá.
**Proč:** plán AD08 chtěl `next/dynamic` na šest míst. Zkusil jsem to a změřil: nic to neušetřilo,
protože komponenta se vykresluje na serveru a její chunk zůstane v HTML — na Financích to
přidalo 1,4 kB. `LazyMotion` naopak sebrala 28,3 kB z Hovorů a 28,4 kB z Kalendáře (jen tyhle
dvě trasy balíček nesly), za cenu +0,4 kB na ostatních.
**Důsledek:** `components/admin/__tests__/admin-bundle-guard.test.ts` zakazuje `motion` mimo
zapsané výjimky a hlídá, že `loadMotionFeatures` zůstane u `domAnimation` (`domMax` by balíček
zdvojnásobil). Kdo bude chtít `next/dynamic` znovu, musí přinést měření — a kontrolu, že žádný
skript z HTML na disku nechybí (bez ní vyšlo první měření falešně o 18–27 % lépe).

### R-095 · Sloučení kontaktů nepřesměrovává, jen ukazuje kam patří (2026-11-12)
**Rozhodnutí:** sloučení dvou kontaktů nastaví `contacts.merged_into` a **nic víc** — `contact_id`
v zakázkách, hovorech, dokončených, konzultacích a poptávkách zůstává, kde je. Čtení vede na cíl
přes `COALESCE(merged_into, id)` a dotazy počítají s *rodinou* kontaktu (on sám + co je do něj
sloučené). „Zpět" je smazání té jedné hodnoty. Řetěz je vždy plochý (A → B, nikdy A → B → C) —
kdo slučuje do už sloučeného kontaktu, dostane jeho kořen; drží to trigger `contacts_before_write`.
Unique na telefon a e-mail je **částečný** (`WHERE merged_into IS NULL`), takže sloučený kontakt
své údaje uvolní.
**Proč:** zadání AD09 chtělo obojí — „přesměruje `contact_id`" a „Zpět = smazat `merged_into`
(nic se nemazalo, takže sloučení nepotřebuje zálohu)". To dohromady nejde: po přesměrování by
smazání `merged_into` sloučení nevrátilo a bylo by potřeba evidovat, které řádky se přesměrovaly.
Vyhrála reverzibilita — spojení dvou lidí do jednoho je omyl, který se pozná až později, a vrátit
ho musí jít beze zbytku.
**Důsledek:** hotové dotazy jsou v `lib/admin/contacts.ts`, nové čtení kontaktu musí počítat
s rodinou, ne jen s `contact_id = $1`. Odchylka od plánu, zapsaná i v `docs/admin/MODERNIZACE-ADMIN-PLAN.md`
→ AD09. Fyzické přesměrování se nikdy nedělá; kdyby bylo potřeba (výkon při tisících sloučení),
je to samostatné rozhodnutí včetně toho, čím se nahradí „Zpět".


---

## 3. Otevřené problémy

- [ ] **Migrace 104 na produkci (AD09):** tabulka `contacts`, `contact_id` v pěti tabulkách, čtyři funkce a tři triggery. **Aplikovaná jen na testovacím Neonu.** Je **aditivní**, takže na rozdíl od 102 nečeká na nasazení větve. Po ní pustit `node scripts/admin-contacts-backfill.mjs` (nejdřív bez `--ano`, podívat se na sporné případy, pak `--ano`); na produkci to dělá Kryštof · od 2026-11-12
- [ ] **Výmaz kontaktu na žádost GDPR neexistuje (AD09):** `contacts` drží jméno, telefon, e-mail a poznámku, ale `public.purge_client_retention` (R-076) o tabulce neví a admin žádnou cestu výmazu nemá. Při žádosti je od teď potřeba smazat i kontakt. Není to nová kategorie údajů (kontakt je odvozený z leadů a zakázek), ale patří to k AD16/KP10 · `.claude/security/AUDIT-LOG.md` 2026-11-12 · od 2026-11-12
- [ ] **AD09 v prohlížeči neověřený:** projít na 390 / 768 / 1280 / 1440 px `/dashboard/kontakty` — tři pohledy (Kontakty, Možné duplicity, Sloučené), hledání podle telefonu zapsaného jinak, **karty místo tabulky pod 640 px** — a kartu kontaktu: uložení údajů (hlavně hláška u telefonu, kterému nejde rozumět, a kolize e-mailu), **Sloučit sem** a jeho „Zpět" v toastu, „Rozdělit zpět" u sloučeného kontaktu. Dál převod kontaktu na zakázku z Hovorů: musí skončit na nové zakázce, mít v ní poznámky z hovorů a navázaný termín v kalendáři · od 2026-11-12
- [ ] **`notFound()` v adminu vrací 200, ne 404 (zjištěno 2026-11-12):** `/dashboard/<neexistující id>`, `/dashboard/faktury/<id>`, `/dashboard/kontakty/<id>` i neexistující stránka **vykreslí 404 obrazovku, ale se stavem 200**. Je to důsledek streamování kostry (AD06): hlavička odejde dřív, než stránka zjistí, že záznam není. Pro uživatele je to v pořádku (vidí „nenalezeno"), pro monitoring a roboty ne — `/dashboard` je sice `noindex`. Platí pro celý admin, ne jen pro nové obrazovky; opravit s AD18 (přístupnost a kvalita) · od 2026-11-12
- [ ] **`npm run build:check` při běžícím `next dev` není neškodný (zjištěno 2026-11-12):** `scripts/build-check.sh` tvrdí, že od Next 16 má dev vlastní výstup a `next build` mu ho nepřepíše. V AD08 se ukázalo, že build **přepíše `.next/static`** pod už běžícím `next start` — ten pak servíroval chunky, které na disku nejsou (HTML na ně odkazuje, server vrací 500), a měření balíčku kvůli tomu jednou vyšlo falešně o 18–27 % lépe. Pro měření proto platí: po buildu server **restartovat** a zkontrolovat, že žádný skript z HTML na disku nechybí. `next dev` build **přežije** (ověřeno v AD09: po `build:check` vracel dev server dál 200 na 15 adresách); zbývá tedy jen případ `next start` · `scripts/build-check.sh` · od 2026-11-12
- [ ] **Datum v UTC na dalších čtyřech místech financí:** `new Date().toISOString().slice(0, 10)` místo `getPragueTodayISO()` v `app/dashboard/faktury/[id]/page.tsx:91`, `invoice-actions.ts:116,158` a dvakrát v `IncomeExpenseSection.tsx`. Mezi 23:00 a půlnocí je to o den vedle — dnes jen u porovnání „po splatnosti" a výchozího data ve formuláři, ne u zápisu. Na výpisu faktur opraveno v AD08 (tam z toho je datum zaplacení); zbytek patří k nápravě financí v **AD13** · od 2026-11-12
- [ ] **Tlačítko „Uložit událost" v `AdminEventModal` má 39 px**, Dílky chtějí plochy ≥ 44 px (naměřeno na 390 px v AD08). Oprava je `py-3` nebo `min-h-[44px]`; vzhled obrazovek překresluje **AD17**, tak jsem ho na konci sezení o rychlosti neměnil · `components/AdminEventModal.tsx` · od 2026-11-12
- [ ] **Potvrzení poptávky a „Zaplaceno" neklikané na ostro:** při průchodu adminem 2026-11-12 jsem je vědomě nezkoušel — zapsalo by to do databáze a potvrzení poptávky by přes `after()` poslalo **skutečný e-mail** z produkční schránky. Optimistické chování je ověřené reducerem a testy. Až se bude zkoušet naostro, použít poptávku s `@example.cz` a počítat s tím, že e-mail adminovi odejde · od 2026-11-12
- [ ] **Ikonová tlačítka v kalendáři nemají přístupný název:** šipky vpřed/vzad v `SmartCalendar` jsou `<button>` jen s SVG, bez `aria-label` — čtečka přečte „tlačítko". Všiml jsem si při řízení prohlížeče (musel jsem je hledat přes sourozence tlačítka „Dnes"). Patří k přístupnosti v **AD17** · `components/SmartCalendar.tsx` · od 2026-11-12
- [ ] **PDF faktury 200 → 304 ověřené jen unit testem (AD08):** na testovací databázi žádná faktura PDF nemá (`demo-seed` ho nepřikládá, route správně vrací 404), takže skutečné 304 v DevTools nikdo neviděl. Ověřit s fakturou, která `pdf_data` má · `app/api/invoices/[id]/pdf/route.ts` · od 2026-11-12
- [ ] **`LeadsTable` drží kopii serverových dat v `useState`** a synchronizuje ji ručně po každé akci. `useOptimistic` z AD08 na tom nic nemění. Rozchod je možný (jiná záložka, cizí změna) a stránka se po každé akci zbytečně vykreslí na serveru nadarmo. Odstranit při přepsání obrazovky v **AD17** — vykreslovat z propů · `components/LeadsTable.tsx` · od 2026-11-12
- [ ] **Ostatní `void createNotification(…)` zůstávají plovoucí:** AD08 opravil `app/actions.ts` a `lib/web-leads.ts`, ale `app/portal-actions.ts` (4×), `app/klient/projekt/[id]/actions.ts` (3×) a `app/api/cron/send-reminders/route.ts` (4×) dál spouštějí zápis bez `await` i bez `after()`. U cronu to nehrozí (čeká na `Promise.allSettled`), u portálu se oznámení může ztratit · od 2026-11-12
- [ ] **Migrace 103 na produkci (AD06):** indexy a `pg_trgm`, **neaplikovaná nikde** — ani na testovacím Neonu. Je **aditivní**, takže na rozdíl od 102 nečeká na nasazení větve a smí se pustit kdykoli. `CREATE INDEX` (bez CONCURRENTLY) na dobu stavby zamkne zápisy do tabulky; při dnešní velikosti dat jsou to desítky ms. Aplikuje Kryštof · od 2026-11-11
- [ ] **AD06 v prohlížeči neověřený:** 22 adresářů adminu, pět záložek detailu zakázky a `?strana=2` u Klientů vracejí 200 přes podepsanou session a obsah v HTML sedí, ale okem to nikdo neviděl. Projít hlavně: **kostlivce** (`loading.tsx` — nesmí se po načtení nic přeskládat), **odznaky v menu**, které teď doskakují až po kostře, **stránkování Klientů** a **landing bez NextAuth** (přihlášený admin musí v hlavičce `/` pořád vidět „Do administrace") · od 2026-11-11
- [ ] **Trigramové indexy zatím nic nezrychlují (AD06):** `pg_trgm` a čtyři GIN indexy v migraci 103 jsou příprava pro hledání v databázi (AD07). ⌘K dnes prochází jen názvy stránek v prohlížeči. Kdyby se AD07 rozhodlo hledat jinak (full-text), indexy zrušit — nesou cenu při každém zápisu · od 2026-11-11
- [ ] **Finance jsou nejdražší obrazovka adminu (AD06):** Osobní 9 kol do DB, Podnikání 7, a dva zápisové generátory běží při **každém GET** před čtením. Zápisy do cronu ruší AD08, sloučení jedenácti čtecích funkcí patří k nápravě financí v AD13 · `app/dashboard/finance/` · od 2026-11-11
- [ ] **Migrace 102 na produkci jen spolu s nasazením větve (AD02):** přejmenování `business` → `lead_origin` je jediná nekompatibilní změna celého plánu. Produkce běží na starém buildu `d948400`, který `business` čte i zapisuje — samotná migrace by rozbila `/dashboard` a veřejná booking API. Pořadí: nasadit větev `admin/modernizace`, pak 102. Po aplikaci zkontrolovat `SELECT … WHERE lead_pending` (dotaz je v hlavičce migrace): objeví-li se tam stará nikdy nepotvrzená poptávka, potvrdit nebo smazat · od 2026-11-11
- [ ] **`PRVOTKA_LEAD_WEBHOOK_SECRET` do Vercelu (AD02):** endpoint `/api/public/prvotka-leads` bez klíče odmítá vše (fail-closed). Vygenerovat, nastavit v Production i Preview a tutéž hodnotu dát do repozitáře webu Prvotky · Kryštof · od 2026-11-11
- [ ] **Napojení webu prvotka.cz:** formulář musí posílat `POST /api/public/prvotka-leads` s `section: 'prvotka'`, `source: 'web_contact_form'` a hlavičkou `x-prvotka-lead-signature`. **Je to práce v repozitáři Prvotky, ne tady.** Prvotka je zatím SaaS ve vývoji, proto má výchozí typ služby obecné „Poptávka z webu" — až bude nabídka hotová, změnit jeden řádek v `lib/lead-origins.ts` · od 2026-11-11
- [ ] **Kalendář a Hovory po AD02 ukazují i historická ALTENO data:** dřív je filtrovala podmínka `business = 'vizeon'`, teď tam jsou. Je to záměr (jeden byznys, jeden diář), ale při prvním otevření to bude vypadat, že přibyly záznamy · od 2026-11-11
- [ ] **Migrace 100 a 101 na produkci (AD01):** připravené a vyzkoušené jen na testovacím Neonu. Před spuštěním na produkci **musí** proběhnout `node scripts/export-before-drop.mjs --ano` proti produkční DB (`DROP TABLE` je nevratný, R-089) — na testu byly tabulky prázdné, kolik řádků je na produkci, nikdo neví. Aplikuje Kryštof · od 2026-11-11
- [ ] **Admin v prohlížeči okem neověřený (AD00, AD02, AD03):** stránky vracejí 200 s ukázkovými daty, ale jen přes HTTP (session podepsaná klíčem z `.env.local`, heslo adminu agent nemá; Chrome není připojený). Projít `/dashboard` (**nový pravý sloupec s měsíčními čísly**), `/dashboard/poptavky` s filtrem zdroje a potvrzením poptávky, detail zakázky (včetně Fakturace u staré ALTENO zakázky), kalendář, Hovory, faktury a **přesunuté obrazovky `/dashboard/{finance,projekty,startup}`** (graf TradingView, kalkulačka Výkonnost podnikání) v prohlížeči na 390 / 768 / 1280 / 1440 px — stačí `npm run dev` a přihlášení · od 2026-11-11
- [ ] **AD07 v prohlížeči neověřený:** 23 adres vrací přes podepsanou session 200 a server nehlásí chybu, ale okem je nikdo neviděl. Projít na 390 / 768 / 1280 / 1440 px: řazení kliknutím do hlavičky (šipka, aria-sort), stránkování, **karty místo tabulky pod 640 px**, nové dialogy u Dokončených a Nákladů (dřív se upravovalo v řádku), hledání ve Fakturách (Enter odešle formulář), waitlist u startupového projektu a Hovory — hlavně rozbalení kontaktu, kde se poznámky teprve dotahují. Drobnost k ověření: na `?page=2` bez řádků se ukáže prázdný stav obrazovky, ne „na téhle stránce nic není" · od 2026-11-11
- [ ] **AD05 v prohlížeči neověřený:** stránky vracejí 200 přes podepsanou session, ale okem je nikdo neviděl. Projít na 390 / 768 / 1280 / 1440 px: nové šířky (Dokončené a Hovory bez vodorovného posuvníku, Dnes a Kalendář na 1440), hlavičku `PageHeader` (28 px na telefonu, 36 px výš) a nové odznaky — hlavně jestli „Hotovo" a „V řešení" ve stejném tónu `info` nejsou v seznamu zakázek matoucí a jestli `signal` (amber) u „Nová" a „Čeká na schválení" neruší · od 2026-11-11
- [ ] **AD04 v prohlížeči neověřený:** vzhled sedí podle zkompilovaného CSS a hlaviček, ale okem ho nikdo neviděl (agent nemá heslo adminu, Chrome není připojený). Projít `/dashboard`, `/login` a `/p/[token]` na 390 / 768 / 1280 / 1440 px: ⌘K, zvonek, menu, **toasty a dialogy** (nově se portálují do `AdminRoot`, ne do `<body>`) a konzoli — nesmí hlásit blokaci CSP. Stačí `npm run dev` a přihlášení · od 2026-11-11
- [ ] **`/p/<nesmyslný token>` vrací lokálně 500 místo 404:** `public_token` je ve `scripts/admin-base-schema.sql` typu `uuid`, takže dotaz spadne na `22P02`. Podle `AUDIT-LOG` 2026-11-04 vrací produkce 404 — základní schéma z AD00 je rekonstrukce tabulek založených ručně v Neon konzoli a **v tomhle bodě se zřejmě liší od produkce**. Ověřit typ sloupce na produkční DB a buď opravit `admin-base-schema.sql`, nebo ošetřit neplatné UUID v `app/p/[token]` (stejná třída chyby jako `/dashboard/[id]` v AD01) · od 2026-11-11
- [ ] **Výpadek 2026-11-04 — dohledat:** ověřit, jestli během výpadku (nejpozději 10:38–14:35) nepropadla poptávka z vizeon.cz nebo alteno.cz (veřejné endpointy vracely chybu); přihlášený `/hub` po opravě ověřit okem · `.claude/security/AUDIT-LOG.md` · od 2026-11-04
- [ ] **Landing — zbytek auditu R-078:** (1) na telefonu 390 px je v Jak to funguje úsek asi 3 100 px skoro bez obsahu (velké mezery mezi kroky), (2) žádná fotka, (3) ozdoby: tenké a čárkované čáry, stíny v klidu, modrá záře v hero, plovoucí navigace ve tvaru pilulky, (4) 21 velikostí písma a texty pod 13 px, (5) karty Funkce se stejným rámečkem · `components/marketing/` · od 2026-11-03
- [ ] **Vercel Hobby a komerční provoz:** podle podmínek Vercelu je Hobby jen pro nekomerční osobní použití; placený Workspace potřebuje Pro. Pro zároveň dovolí častější crony (připomínky 2 h předem, rychlejší fronta e-mailů, R-006, R-050) a Observability. Rozhodnutí a platba: Kryštof · před spuštěním · od 2026-11-03
- [ ] **Admin bez dvoufázového ověření:** session je od 2026-11-03 jen 12 h, zámek na IP zůstává; dvoufázové ověření (TOTP s novou závislostí, nebo admin přes Clerk s MFA) potřebuje rozhodnutí · `lib/auth.ts`, DECISIONS #021 · od 2026-11-03
- [ ] **Monitoring chyb:** žádný (Sentry, Vercel Observability); chybové stránky už jsou, ale o chybě se nikdo nedozví. Sentry potřebuje závislost a záznam v CSP-LOG; výpadek 2026-11-04 se zjistil jen ze screenshotu · od 2026-11-03
- [ ] **Admin běží rolí vlastníka DB:** `DATABASE_URL` = `neondb_owner` s BYPASSRLS; samostatná role pro běh adminu bez DDL, vlastník jen na migrace · `lib/db.ts`, `lib/ws/admin/db.ts` · od 2026-11-03
- [ ] **Testy s pevnými daty:** 16 testových souborů míchá pevná data z listopadu 2026 se skutečnými hodinami (`now()`); jak dny projdou, můžou padat jako `ws-email.test.ts` 2026-11-03. Převést na `vi.setSystemTime` nebo data od dneška · `lib/ws/__tests__`, `lib/__tests__` · od 2026-11-03

- [ ] **Požadavky klientů (R-069) — před nasazením:** (1) ~~migrace 092~~ aplikovaná na produkci, (2) ~~`OPENAI_API_KEY`~~ ve Vercelu (Production i Preview), (3) ověřit v prohlížeči mikrofon a nahrávání (Chrome, Safari iOS `audio/mp4`) a že hlavička `Permissions-Policy` na `/p/*` má `microphone=(self)`, (4) ~~ověřit rezidenci a DPA~~ ověřeno 2026-11-01 (`docs/klientsky-prostor/PLAN.md` 8.1: OpenAI i Anthropic zpracovávají v USA na SCC; EU přepis jen s žádostí u OpenAI; zda je DPA OpenAI přijaté automaticky, ověřit v nastavení organizace), zbývá doplnit zpracovatele do právních textů, (5) nahrávku klienta zatím nikdo nevyzkoušel s češtinou · od 2026-11-01
- [ ] **Klientský prostor — před nasazením (R-070–R-073):** (1) ~~migrace 092–096 a role `portal_app`~~ hotovo na produkci, (2) ~~env ve Vercelu~~ nastaveno (`DATABASE_URL_PORTAL` jen Production), (3) **průchod v prohlížeči nikdo neprošel** (jde jen na Neon větvi `projectiq` s migracemi 092–096 a `portal_app`, nebo na produkci se souhlasem; Preview míří na testovací DB bez schématu `portal`): pozvánka → registrace v Clerku → přijetí → přehled → požadavek (text i hlas) → zpráva → hodnocení; kostra adminu, Dnes, záložky detailu, schvalování hlášení a klíč projektu na datech; telefon 390 px, (4) Clerk je jen dev instance, `/klient` s ním ověřit až s produkční, (5) test hlášení ze skriptu `zakaziq-report.mjs` proti běžící aplikaci, (6) souhrnný e-mail o aktivitě se neposlal nikdy naostro · od 2026-11-01
- [ ] **KP08 a KP10:** soubory od klienta jsou odložené (D-K8). KP10: ~~retence 3 roky~~ v kódu (R-076, migrace 098), ~~DPA a rezidence AI~~ ověřeno; zbývá audit `web-security-audit` a pilot s jedním klientem (~~právní texty se zpracovateli a retencí~~ R-079) · od 2026-11-01
- [ ] **Předání do Claude Code úroveň 3** (Routines API) se nedělá, dokud nebude experiment a samostatné rozhodnutí (D-K7) · od 2026-11-01
- [ ] **Admin pod Dílky — zbytek:** AD04 dal adminu paletu, písmo, tokeny shadcn a `navy-*`; obrazovky samy se ale ještě nepřekreslovaly — zbývá `muted-foreground` (743), `rounded-lg|xl|2xl` (463), `border-border` (335), duhové barvy (927) a `bg-white` (211). Dělá AD05 (kostra a odznaky) a AD17 (denní obrazovky); stropy hlídá `components/admin/__tests__/admin-classes.test.ts`. Starý seznam na `/dashboard` se přesunul na `/dashboard/zakazky`; odkazy z e-mailů a poznámek na `/dashboard` teď vedou na Dnes · od 2026-11-01
- [ ] **Nestabilní testy nad PGlite:** `ws-intake` a `admin-calendar` padaly při plném běhu na časový limit v `beforeAll` (samostatně jsou hotové za 7 s). AD09 zvedl `hookTimeout` ve `vitest.config.ts` na 60 s — databází ve WASM startuje najednou víc a 30 s nestačilo. Kdyby to padalo dál, příčina je někde jinde · `vitest.config.ts`, `lib/ws/__tests__` · od 2026-11-01
- [ ] **Nestabilní test limitu veřejných poptávek:** opakovaná plná sada jednou vrátila 400 místo očekávaného 429; samostatný test prošel. Limit používá pevná minutová okna, přechod mezi okny během 21 požadavků je možná příčina, zatím neprokázaná. Upravit test tak, aby nezávisel na hranici minuty · `lib/ws/__tests__/ws-intake.test.ts` · od 2026-10-31
- [ ] **Průchod Preview 2026-10-31 — zbývá:** (1) služby ze šablon oboru nemají cenu (formulář faktury teď upozorní na cenu 0, ceny šablon nedoplněny); (2) ukázková data: `customer_segments` bez počtu a data návštěv, dokud je nepřepočítá cron `ws-segments` nebo Nastavení › Skupiny; (3) šířka 390 px neověřena (okno Chrome nejde zúžit, rámování blokuje CSP); (4) nové úpravy z 2026-10-31 (štítek času v kalendáři, skrytá šablona „Informace k zakázce“, upozornění ve formuláři faktury) ověřené jen testy a `tsc`, ne na Preview · od 2026-10-31
- [ ] **Landing — oborové podstránky (návrh R-055, nestavět bez rozhodnutí):** `/pro/kadernictvi`, `/pro/kosmetika`, `/pro/remeslnici` (zámečnictví, studnařství, stavba), `/pro/autoservis`, `/pro/uklid`; likvidace azbestu spíš jako sekce u řemeslníků. Každá jen s obsahem, který je opravdu jiný: služby a kolonky ze šablony oboru (`lib/ws/templates/`), ukázka objednávky pro obor, vlastní dotazy. Bez skutečných zákazníků z oboru hrozí tenké stránky, proto začít 1–2 obory, kde budou první reference. `/cenik` samostatně nedává smysl (jedna cena, kotva stačí) · od 2026-10-17
- [ ] **Landing — po nasazení na `zakaziq.cz`:** ověřit `curl` canonical/robots/sitemap na produkčním hostu (apex vs. www podle `NEXT_PUBLIC_APP_URL`), schéma v Rich Results Test, odeslat sitemapu do Google Search Console a Bing Webmaster Tools · od 2026-10-17
- [ ] **Landing — kontrast drobných popisků:** Lighthouse přístupnost 96: popisky `text-navy-400` 11 px na bílé a texty v živé ukázce během animace (`opacity-75`, nájezd) nemají 4,5:1. Design Dílků, řešit s mockupem · `components/marketing/{live-demo,features}.tsx` · od 2026-10-17

- [ ] **RD02 — záložní postup po migraci 085:** 085 je aplikovaná (2026-10-18). `loadBusinessScopeSeparately` v `lib/ws/scope.ts` a test „před migrací 085“ smazat, až bude jisté, že 085 běží na každé databázi, kterou aplikace používá (včetně Preview, pokud má jinou) · od 2026-10-18
- [ ] **RD03 — měření na Neonu:** migrace 086 je aplikovaná (2026-10-18). Znovu `EXPLAIN` se skutečnějšími daty a změřit čas po kliknutí; PGlite čísla (plán oddíl 9) jsou jen poměr · od 2026-10-18
- [ ] **Optimistické akce nejsou:** potvrzení poptávky, zaplacení faktury a razítko čekají na odpověď serveru. RD04 je neřešilo (zadání RD04 je nemá); dělat s přihlášením (kolize termínu musí vrátit stav zpět), nejspíš až s RD05/RD06 · od 2026-10-18
- [ ] **Začátek server actions má 3 dotazy za sebou** (`requireWorkspace` → `requireBusiness` → `assertWritable`, ~25 míst). `loadBusinessScope` by to srazil na jeden (kontext + `canWrite(billing)`), ale po přesunu do `fra1` jde o jednotky ms; udělat, až měření ukáže potřebu · od 2026-10-18
- [ ] **RD04 naostro:** Dnes s hlavní věcí, panel s kartou zákazníka po kliku na termín, přesměrování `?zakaznik=` a hlavička v Poptávkách a Zákaznících jsou ověřené jen na dočasné stránce s fiktivními daty a testy; s přihlášením na skutečných datech (včetně telefonu a zadokovaného panelu od 1280 px) ne · od 2026-10-18
- [ ] **RD05 + RD06 naostro:** rychlé zadání z mřížky (klik i tažení), rady k času a kolize, tři nejbližší volné časy u poptávky, změna délky tažením i v detailu, barvy pracovníků, mezery a stínování mimo otevírací dobu, skok na datum, přejetí mezi dny, Najít volný čas (⌘K i menu), filtry a seznam zakázek, historie stavů a stav v panelu jsou ověřené jen na dočasné stránce s fiktivními daty (390/768/1280/1440 px, světle i tmavě; dočasná stránka smazána) a testy v PGlite; s přihlášením na skutečných datech ne (server actions `slotAdvice`, `searchCustomers`, `resizeAppointment`, `createManualBooking` s délkou) · od 2026-10-18
- [ ] **RD07 naostro:** objednávkový tok, výběr služby/pracovníka/času i kontakt ověřeny lokálně s fiktivními daty v úzkém (614 px) a širokém (1228 px) zobrazení. Přesné šířky 390/768/1280/1440 px, widget na cizí doméně, živé odeslání na Preview a chování po migraci 087 ještě ověřit · od 2026-10-18
- [ ] **RD10/S14 naostro:** na Preview ověřeno profil dodavatele, vystavení a PDF s QR (2026-10-31). Zbývá: předvyplnění z karty/zakázky, vzhled PDF okem, přijaté PDF s AI přepisem, e-mail faktury (až s Resendem) · od 2026-10-10
- [ ] **RD12 naostro:** projít věrnostní nastavení, přidání/vrácení razítka a uplatnění/vrácení odměny na přihlášeném Preview a šířkách 390/768/1280/1440 px; lokální prohlížeč skončil na přihlášení, testovací účet ani Neon branch nejsou připravené · od 2026-10-18
- [ ] **RD13 + RD16 naostro:** přihlášený průchod pěti sekcí Nastavení, checklistu na Dnes, doplnění kontaktu, návrhu sloučení a zrušení zprávy v 60s okně; ověřit přímé odeslání po nastavení Resendu. Migrace 089 a její závislosti 080/087/088 byly na Neonu aplikovány 2026-10-19 · od 2026-10-18
- [ ] **Kalendář — přímé tažení perem/dotykem a čára „teď“:** Kryštof 2026-10-18 označil oboje jako dosud zbývající. HTML5 přetažení bloku podporuje myš; na dotykovém displeji se termín přesouvá formulářem Přesunout v detailu. B9 a stav RD05 už ale popisují čáru „teď“ jako přítomnou; při navazujícím kalendářním kroku porovnat očekávaný výsledek se stávajícím kódem, nic nepřepisovat odhadem · `components/ws/app/calendar/time-grid.tsx`, `components/ws/app/calendar/now-indicator.tsx`, `components/ws/app/booking/appointment-actions.tsx` · od 2026-10-18
- [ ] **Zakázky — historie jen od RD06:** změny stavu před 2026-10-18 nejsou v `ws.audit_log`; potvrzení poptávky ani portál záznam stavu nezapisují (jen přesun v aplikaci) · `lib/ws/bookings.ts` (`setJobStage`) · od 2026-10-18
- [ ] **RD02 — region a měření:** `vercel.json` má `regions: ["fra1"]`, ale projeví se až po deployi (nasazení jen se souhlasem). Po deployi ověřit `regions` v nasazení (Vercel MCP `get_deployment`) a změřit čas po kliknutí před/po s přihlášením (plán oddíl 9). Clerk `auth()` v tom neměřený · od 2026-10-18
- [ ] **RD02 — streamování s přihlášením neověřeno:** kostra s `chrome` jako Promise a `loading.tsx` ověřené jen na dočasné stránce bez přihlášení (první bajt 60 ms, bez chyb hydratace); s přihlášením na skutečných datech, na telefonu a při pomalém připojení ne. `DetailSlot` ukazuje panel až po načtení (bez kostry, aby se neotevíral dvakrát), případně dodělat v RD04 · od 2026-10-18
- [ ] **S18 naostro:** obrazovky s přihlášením na telefonu (390 px) a v tmavém režimu, export a výmaz na skutečné DB, zrušení a obnovení testovacího účtu, cron `ws-gdpr` na Vercelu, instalace PWA (Android i iPhone), test „člověk, který aplikaci neviděl“ · od 2026-10-17
- [ ] **Právní texty — Stripe a výmaz dotazů:** texty jsou na webu a potvrzené (R-079), kontrola právníkem se nedělá. Provozovatel chybí ve Stripe (Public details, šablona faktury). Volitelně `consent_collection.terms_of_service` v Checkoutu. Kontaktní dotazy v Hovorech nemají automatický výmaz po 3 letech (slib v ochraně údajů, zatím ručně) · od 2026-10-17
- [ ] **Výmaz a odeslané e-maily majiteli:** přehledy dne/týdne v `ws.outbound_messages.payload` můžou nést jméno vymazaného zákazníka (výmaz maže jen zprávy s jeho id nebo klíčem). Zvážit čištění payloadu odeslaných zpráv po 90 dnech · od 2026-10-17
- [ ] **Tmavý režim — nové třídy:** přemapování v `app/ws-tokens.css` pokrývá třídy použité k 2026-10-17; nová světlá třída (např. `bg-navy-200/50`) potřebuje vlastní `dark:` nebo řádek v tokenech. `/r`, `/z` a landing zůstávají světlé (rozhodnout, jestli i ony) · od 2026-10-17
- [ ] **Upgrade Next 16 — admin s přihlášením:** Workspace (Clerk) a PDF ověřeny na Preview 2026-10-31; zbývá admin NextAuth na datech (Preview má testovací DB bez admin tabulek) · od 2026-10-17
- [ ] **`Dockerfile` nesedí s konfigurací:** kopíruje `.next/standalone`, ale `next.config.mjs` nemá `output: 'standalone'`. Produkce běží na Vercelu; rozhodnout, jestli Dockerfile smazat nebo opravit · od 2026-10-17
- [ ] **Připomínky 2 h před konzultací:** po R-006 není jasné, jestli běží externí hodinový cron (commit 2026-06-20 zmiňuje „externí hodinový cron"). Ověřit u uživatele · od 2026-06-25
- [ ] **Workspace — env ve Vercelu:** Production i Preview mají `DATABASE_URL_WS`, klíče Clerku, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (2026-10-10). Zbývá: `STRIPE_WEBHOOK_SECRET` v Production je od Kryštofa a nemusí patřit produkčnímu endpointu (ten ještě neexistuje) — přepsat podpisovým klíčem endpointu `https://www.zakaziq.cz/api/stripe/webhook` při nasazení `/w`; `NEXT_PUBLIC_APP_URL` v Preview míří na produkční adresu (pro větev `ws/redesign-app` přepsáno 2026-10-31, ostatní větve dál vrací Checkout na produkci) · od 2026-10-08
- [ ] **Clerk — webhook:** v Clerk dashboardu založit endpoint `https://<doména>/api/clerk/webhook` (události `organization.updated`, `organizationMembership.*`) a jeho podpisový klíč dát do `CLERK_WEBHOOK_SECRET` (`.env.local` i Vercel). Do té doby route vrací 503 a členové se nesynchronizují (vlastníka zapíše průvodce) · od 2026-10-09
- [ ] **Clerk — produkční instance:** založená, DNS, SSL a pošta hotové (2026-11-03). Zbývá vlastní Google OAuth klient (consent screen „In production“, jinak limit 100 testovacích uživatelů), `force_organization_selection=false`, produkční klíče jen do Vercel Production. Dev instance nesmí do produkce · od 2026-10-09
- [ ] **Clerk — limit 5 členů na organizaci** (výchozí v Clerku). R-020 slibuje neomezeně pracovníků — pracovníci ve `ws.staff` se přihlašovat nemusí, ale přihlašovací účty pro tým (S13?) limit narazí. Ověřit, jestli jde zvednout na našem plánu Clerku · od 2026-10-09
- [ ] **Clerk — e-maily s kódem** chodí z Clerku (šablona a jazyk podle nastavení instance). Ověřit při první registraci, že jsou česky a jménem ZakazIQ; jinak nastavit v dashboardu Clerku (Customization → Emails) · od 2026-10-09
- [ ] **Clerk — `user.updated`** (změna jména/e-mailu) se do `ws.members` nepropisuje — webhook ho nezpracovává, payload nemá organizace. Řešit, až se jména členů budou někde zobrazovat (S13) · od 2026-10-09
- [ ] **Stripe — lokální webhook:** pro `stripe listen` chybí CLI profil ZakazIQ (`stripe login --project-name zakaziq`), omezený klíč na listen nestačí (403); po přihlášení dát jeho `whsec_` do `.env.local`. Potřeba jen při lokálním testu plateb · od 2026-10-09
- [ ] **Stripe — live mód** (produkt, cena, Portal, e-maily, šablona faktury s IČO a „Nejsem plátce DPH“, webhook endpoint, live klíče jen do Vercelu Production) · před S19 · od 2026-10-09
- [ ] **`ws.accounts.trial_ends_at`** se po R-038 nepoužívá. Nechat, nebo odstranit migrací (data se tím nemažou)? Neblokuje · od 2026-10-09
- [ ] **Evidence migrací na produkci:** tabulku `public.schema_migrations` vede `scripts/apply-migration.js` od 2026-11-11 (AD00), ale na produkční DB zatím neexistuje — vyplní se až prvním spuštěním běhounu proti produkci (migrace 097–099). Dokud to nenastane, drží stav changelog · od 2026-11-11
- [ ] **Resend jen kvůli waitlistu:** závislost `resend` slouží jedné funkci (`sendLaunchEmailBlast`). Zvážit převod na `lib/email.ts` (R-004) · od 2026-10-08
- [ ] **Workspace — SMS poskytovatel** pro připomínky a „Komu napsat". Blokuje S12/S15 (lze odložit) · od 2026-10-08
- [ ] **Workspace — zálohy online přes Stripe Connect** teď, nebo až po spuštění? Neblokuje · od 2026-10-08
- [ ] **Workspace — admin přihlášení:** nechat NextAuth natrvalo, nebo později převést na Clerk? Neblokuje · od 2026-10-08
- [ ] **S16 naostro:** ověřit skutečný termín, zakázku, fakturu a hodnocení v `/z/[token]` (migrace 082 na Neonu) · od 2026-10-10
- [ ] **S17 — pozvaní klienti a platba:** pozvaný klient prochází stejným Checkoutem (14 dní s kartou, R-038). Rozhodnout, jestli klienti, kterým Kryštof staví web, mají mít Workspace zdarma nebo se slevou (kupón ve Stripe) · od 2026-10-10
- [ ] **S17 naostro:** pozvánka Clerku (e-mail, registrace s `__clerk_ticket` na `/w/registrace`, aktivace organizace, `ensureMember`) a obě admin stránky s přihlášením neověřené · od 2026-10-10
- [ ] **S15 — odesílání e-mailů:** ~~doména v Resendu, `WS_EMAIL_FROM`, webhook + `RESEND_WEBHOOK_SECRET`~~ hotovo 2026-11-01 pro Production (webhook vypnutý do nasazení, pak zapnout). Zbývá doplnit `rua` do DMARC (záznam `_dmarc` existuje, `p=none` bez reportů, ověřeno 2026-11-03) a klíč jen pro odesílání. Postup `docs/workspace/SETUP.md` → E-maily · od 2026-10-10
- [ ] **S15 — naostro neověřeno:** Nastavení › E-maily (náhled, zkušební e-mail) s přihlášením, skutečné doručení a vzhled v Gmailu/Outlooku/Apple Mailu, odkaz Potvrdit z telefonu, cron na Vercelu · od 2026-10-10
- [ ] **Workspace — cena za další byznys na účtu** a kdy ho zapnout (R-026). Neblokuje · od 2026-10-08
- [ ] **Workspace — toasty přes adminův `<Toaster>`** (R-027): pozice a délka jsou společné s adminem (vpravo nahoře). Až bude potřeba vlastní toaster (např. spodní lišta na mobilu v S09/S18), řešit upgradem sonneru na 2.x (víc toasterů) nebo úpravou `app/layout.tsx` — obojí sahá na admin, chce souhlas · od 2026-10-08
- [ ] **Workspace — Inter se stahuje i na stránkách Dílků:** `@import` Google Fonts v `app/globals.css` (admin) se načte všude; Instrument Sans ho přebije, jen zbytečný request CSS. Od S02 ho na `/w` a od S04 i na landing page blokuje vynucená CSP — žádný request, ale chyba v konzoli i na veřejné stránce (Lighthouse Best Practices). Řešit, až se bude sahat na admin · od 2026-10-08
- [ ] **Bezpečnost — otevřené položky** (produkční CSP/COOP/CORP, DNS/e-mailové záznamy, Preview auth, security.txt, záloha/obnova): vedené v `.claude/security/STATE.md` → Otevřené položky · od 2026-10-08
- [x] **Landing — e-mail podpory:** `info@vizeon.cz` potvrdil Kryštof 2026-10-31; kontaktní formulář R-065 ukládá dotaz do Hovorů, přímý e-mail zůstává jako záloha.
- [ ] **Workspace — Dnes, Poptávky, Kalendář, Zakázky naostro:** S09 a S10 ověřené jen na náhledu s fiktivními daty. Projít s přihlášením (desktop i telefon): potvrzení jedním klikem, Jiný čas, Odmítnout + Zpět, přetažení termínu, blokace, živé obnovení (poptávka vložená jinde se ukáže do 15 s). Případně s ukázkovými daty (`scripts/ws-seed.mjs`, R-041) · od 2026-10-09
- [ ] **Kalendář — blokace celého byznysu:** bez pracovníka ji DB omezení nehlídá (R-035), ruční rezervace a potvrzení přes ni projdou (tip v detailu poptávky ji ukáže). Volné časy pro web ji od S11 vynechávají; zvážit kontrolu i v ruční rezervaci · `lib/ws/bookings.ts` · od 2026-10-10
- [ ] **Napojený web — naostro s přihlášením a z cizí https domény:** Nastavení › Napojený web, Ověřit napojení, QR PNG/SVG, widget na skutečném cizím webu (Chrome blokuje veřejný web → localhost, ověřit na Preview) · od 2026-10-10
- [ ] **Data cache Nextu i v adminu:** `lib/db.ts` (admin) volá Neon HTTP bez `cache: 'no-store'` — ve Workspace to vracelo stará data v route handlerech (opraveno v `lib/ws/db.ts`). Admin se nemění; ověřit, jestli se ho to týká (např. veřejné booking API), až se bude sahat na admin · od 2026-10-10
- [ ] **Workspace — `/w/ucet` mimo kostru:** stránka účtu (S08) má vlastní rozložení s odkazem zpět, kostra na ni vede z „Účet“. Zasadit do kostry, až bude jasné, jestli má být pod `/w/[byznys]` nebo nad ním · od 2026-10-09
- [ ] **`npm run lint` není nastavený** (`next lint` jen nabídne průvodce ESLintem). Kontrolu dělá `tsc` a build · od 2026-10-09
- [ ] **`N8N_API_KEY`** není v lokálním `.env.local` — lokálně `/api/public/leads` vše odmítne (fail-closed). Na produkci ověřit ve Vercelu · od 2026-10-08

---

## 4. Changelog

*Nejnovější nahoře. Starší měsíce → `archiv/YYYY-MM.md` (viz pravidla §4).*

### 2026-11-12
- **feat** **AD09 hotovo** — jedna entita kontaktu. Nová tabulka `contacts` (migrace 104: `display_name`,
  `company`, `email`, `phone` s CHECKem na E.164, `ico`, `dic`, `note`, `source`, `last_seen_at`,
  `merged_into`, `portal_client_id`) a `contact_id` v `client_leads`, `projects`, `consultation_slots`,
  `completed_projects` a `agent_leads`. Unique na telefon a e-mail je **částečný**
  (`WHERE merged_into IS NULL`), takže duplicita nikdy nezablokuje uložení formuláře. Normalizace
  v `lib/contacts/normalize.ts`, shoda v `lib/contacts/group.ts` (telefon, pak e-mail). Snímek v zakázce
  drží trigger (doplní jen to, co chybí) a přejmenování kontaktu propadne do zakázek, které nesly
  přesně starý text — bez hýbání `updated_at`, aby klientovi v portálu nelhalo „Naposledy upraveno".
  Nová obrazovka `/dashboard/kontakty` + karta kontaktu se sloučením duplicit (R-095: sloučení je
  jedna hodnota a „Zpět" ji smaže); Kontakty jsou v menu v Práci za Hovory. Backfill
  `node scripts/admin-contacts-backfill.mjs` (dry-run výchozí) dal na testovací DB 14 kontaktů z 18
  řádků, 2 sporné případy a 0 nepřiřazených; druhý běh nezapsal nic. Soubory: `migrations/104_kontakty.sql`,
  `lib/contacts/{normalize,group}.ts`, `lib/admin/contacts.ts`, `app/contacts-actions.ts`,
  `app/dashboard/kontakty/**`, `components/admin/contacts/*`, `lib/admin-nav.ts`,
  `components/admin/admin-icons.tsx`, `scripts/admin-contacts-backfill.mjs`, `tsconfig.json`
  (`allowImportingTsExtensions`), `vitest.config.ts` (`hookTimeout`). Migrace 104 **aplikovaná jen
  na testovacím Neonu**.
- **fix** **Převod kontaktu na zakázku už nic neztrácí** (`convertLeadToProject`): předává `contact_id`
  místo kopie textu, přebírá název firmy (dřív zmizel, když se klient jmenoval jménem člověka),
  kopíruje poznámky z `lead_notes` do `project_notes`, naváže termín z kalendáře
  (`calendar_events.project_id` zůstával NULL) a končí **na nové zakázce**, ne na Dnes. E-mail
  klientovi jde přes `after()` (AD08).
- **docs** Bezpečnostní review AD09 (AUDIT-LOG 2026-11-12): jeden nález opravený — funkce migrace 104
  neměly připnutý `search_path` (nově `SECURITY INVOKER SET search_path = pg_catalog, pg_temp`
  a kvalifikované `public.*`). Zapsaný otevřený problém: `contacts` drží osobní údaje a žádná cesta
  výmazu na žádost GDPR pro ně v adminu není.
- **chore** Ověření AD09: `tsc`, nové testy `admin-kontakty` (19, migrace 104 v PGlite — částečný unique,
  snímek zakázky, sloučení i „Zpět", řetěz, hledání), `contacts-normalize` (18) a `admin-prevod-leadu` (4);
  `vitest` má `hookTimeout` 60 s kvůli souběžnému startu PGlite. **Okem v prohlížeči neověřeno.**

### 2026-11-12 (AD08)
- **feat** **AD08 hotovo** — rychlost II a opravy kalendáře, v šesti commitech. (1) **E-maily a oznámení mimo akci**: `after()` z `next/server` v `app/actions.ts` (`notifyClientOfProjectChange`, `confirmWebLead`, `markProjectAsCompleted`) a v `lib/web-leads.ts` (veřejný příjem poptávek, v zadání nebyl) — uložení zakázky, potvrzení poptávky ani poptávka z webu už nečekají na Gmail SMTP. Zmizely dvě plovoucí `void createNotification(…)`, které mohly skončit s odpovědí dřív než zápis. Awaitované zůstávají `sendPortfolioEmail` a `sendCustomLeadEmail` — tam je e-mail smyslem akce a UI hlásí, jestli odešel. (2) **Časové okno kalendáře** (R-093): nový `lib/admin/calendar.ts` (dotazy, dávka) + `lib/admin/calendar-window.ts` (čistá matematika, importuje i prohlížeč); okno je měsíc ± 7 dní, další období dotáhne server action `loadCalendarMonth`. Dřív šla do prohlížeče celá historie. (3) **Finance v GET nezapisují**: generátory opakovaných transakcí z renderu pryč, cash-flow šablony do denního cronu `send-reminders`, v UI tlačítko „Doplnit opakované"; nový cron se nestavěl. (4) **Framer Motion líně** (R-094): admin animuje přes `m` a balíček se načítá z `AdminRoot` (`LazyMotion`) — Hovory 292,1 → 263,8 kB, Kalendář 289,0 → 260,6 kB; `next/dynamic` se neujal a v kódu není. (5) **`useOptimistic`** (v repu dosud 0×) na potvrzení a odmítnutí poptávky a na akce v Hovorech. (6) **PDF faktury** s `ETag` z `md5(pdf_data)`, 304 bez čtení bajtů, `runtime`/`maxDuration`. Soubory: `app/{actions,calendar-actions}.ts`, `app/api/cron/send-reminders/route.ts`, `app/api/invoices/[id]/pdf/route.ts`, `app/dashboard/{calendar,finance}/**`, `app/dashboard/dokoncene/page.tsx`, `components/{SmartCalendar,AdminEventModal,LeadCard,LeadsTable,AiAssistantModal,ConsultationCalendar,PortfolioEmailModal}.tsx`, `components/admin/admin-root.tsx`, `lib/{web-leads,prague-time}.ts`, `lib/admin/{calendar,calendar-window,motion-features}.ts`.
- **fix** **Tři nahlášené chyby kalendáře** („zadám čas a ono se to nepromítne", 2026-11-10): klik na slot se do formuláře nepropsal (`<AnimatePresence>` byla **uvnitř** `AdminEventModal`, takže se nikdy neodmountoval a `useState` inicializátory se spustily jen při načtení stránky — formulář navždy držel „dnes 10:00"); `resetAndClose` po uložení přepsal volbu na „dnes 10:00"; vykreslení zahazovalo minuty, protože pozice se počítala z `getHours()`. Při tom: celý kalendář počítá v **pražské zóně** nad `'YYYY-MM-DD'` místo `Date` v zóně prohlížeče, událost začínající před 8:00 se neschová (přilepí se na horní hranu) a formulář má na telefonu `max-h-[90vh]` s rolováním — `overflow-hidden` samotné odřezávalo tlačítko Uložit.
- **fix** Žádná obrazovka `/dashboard` už nepíše do databáze při vykreslení (hlídá `admin-render-nezapisuje.test.ts`). Finance zakládaly opakované transakce při **každém** GETu: spouštěl je i prefetch odkazu v menu, a naopak nevznikly, když se na obrazovku celý měsíc nikdo nepodíval.
- **fix** **Čtvrtá chyba kalendáře**, našla se až při ověřování v prohlížeči: přepnutí **Měsíc → Den** (nebo Týden) skákalo na **prvního v měsíci**, ne na dnešek — kotva měsíčního zobrazení je jeho první den. Platilo to i před AD08. `switchView` teď jde na dnešek, pokud je v zobrazeném měsíci.
- **chore** **Kalendář ověřený v prohlížeči** (produkční build, dočasná stránka s fiktivními daty mimo `/dashboard`, po ověření smazaná — postup z RD04/RD05): klik na volný slot v **11:00** vyplní `2026-11-12T11:00`–`12:00` (doslova to, co kritérium žádá), druhé otevření na 15:00 ukáže **15:00** (ne „dnes 10:00" — právě tady se stará chyba projevovala), událost 10:15–12:00 začíná viditelně pod linkou 10:00, událost 7:00–9:00 je vidět přilepená na horní hraně, modal má 90 vh s rolováním a konzole je **bez jediné zprávy**. Geometrii potvrdil headless Chrome přes `puppeteer-core` (balíček už v repu kvůli PDF): mřížka má 10:00 na 104 px, událost **10:15** začíná na **118 px** a je vysoká 24 px — stará verze by ji nakreslila na 104 px. Na **390 × 844 px** (headless, `isMobile`) nemá stránka vodorovný posuv, klik na slot 11:00 vyplní 11:00 i tam a modal se vejde celý — tlačítko Uložit je vidět bez rolování.
- **feat** **„Zaplaceno" jedním kliknutím** ve výpisu faktur (`setInvoicePaid` + `components/admin/invoices/mark-paid.tsx`): odznak i tlačítko sdílejí jeden `useOptimistic`, takže se stav přepne hned a při chybě se sám vrátí. Akce **nepřidává peněžní logiku** — nastaví `paid_on` a pustí tutéž `syncInvoiceTransaction`, kterou volá formulář; ochrana proti dvojímu započtení sedí uvnitř ní. Dřív jsem to odložil do AD12 s odůvodněním, že je to nová peněžní akce; ten odhad byl špatný, udělaný bez přečtení té funkce.
- **fix** `today` na stránce faktur se počítal v **UTC** (`new Date().toISOString()`), což je mezi 23:00 a půlnocí o den vedle — a nově je z toho datum zaplacení. Teď `getPragueTodayISO()`. Validace data přešla do `lib/prague-time.ts` jako `isIsoDate`, protože ji potřebuje kalendář i faktury.
- **db** Žádná migrace. `lib/__tests__/admin-indexy.test.ts` má nově opsané **okenní** dotazy kalendáře (dřív bezlimitní) — indexy z migrace 103 na nich dál fungují.
- **docs** Bezpečnost: **DECISIONS #022** — PDF faktury smí ležet v cache prohlížeče (`private, max-age=0, must-revalidate` + `ETag` místo `no-store`), `private` se nikdy neruší. Zápis i do `STATE.md` → Neměnit bez zeptání; `.agents/` synchronizované (`--check` prošel).
- **fix** Bezpečnostní review před uzavřením sezení (AUDIT-LOG 2026-11-12) našlo dvě věci, obě opravené: (1) `loadCalendarMonth` ověřoval jen **tvar** datumu, takže `2026-99-99` prošlo — měsíc 99 se v `Date` přetočí do jiného roku a do SQL šlo neplatné datum (500 místo vysvětlení); nový `isCalendarDay` vyžaduje, aby se datum vrátilo zpátky stejné. (2) PDF route neověřovala, že `id` je UUID — cizí adresa skončila chybou `22P02` a odpovědí 500, nově 404 **bez jediného dotazu**. Rozsah okna kalendáře se nikdy nebere z prohlížeče, počítá ho server z kotvy.
- **chore** Ověření AD08: `tsc`, **845 testů v 73 souborech** (nové `admin-after-emails`, `admin-calendar`, `admin-render-nezapisuje`, `leads-optimistic`, `admin-bundle-guard`, `pdf-route`), `build:check` a smoke test přes podepsanou session — 22 adres adminu, pět záložek detailu a `/dashboard/finance?tab=podnikani` vracejí 200, v logu serveru nula chyb.
- **fix** `admin-indexy.test.ts` padal asi v každém třetím běhu celé sady: `beforeAll` sype 11 000 řádků do PGlite, pustí `ANALYZE` a 7× `EXPLAIN` před migrací i po ní, což je přesně na výchozím 10s limitu hooku. Doplněn vlastní limit 60 s. Tři běhy celé sady po sobě: 73 souborů prošlo. **Okem v prohlížeči neověřeno.** Měření bundlu je v plánu, sekce 11; první „po" měření bylo neplatné (běželo proti starému `next start`, kterému build přepsal statické soubory), proto je v postupu nově kontrola, že žádný skript z HTML na disku nechybí.

*Starší dny: `archiv/2026-11.md`, `archiv/2026-10.md` (včetně 2026-10-31).*
