# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Stručné instrukce: [`../AGENTS.md`](../AGENTS.md); technická fakta: [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md).
>
> **Poslední aktualizace:** 2026-10-18 · redesign aplikace: R-058, RD00 rozpracováno · S19 částečný živý audit/Preview; S05 základní SEO (R-055); S13 dokončena (R-054), Next 16.4 + React 19 (R-053)

---

## 1. Aktuální stav

*Snímek — přepisuje se, nedoplňuje.*

**Fáze:** osobní produkční nástroj, deploy na Vercelu z `main`. Všechny plány v `docs/` jsou implementované.

**Moduly v provozu:**
- **VIZEON** (`/dashboard`) — zakázky, inbox poptávek z vizeon.cz, kalendář, Hovory (leady z n8n, AI agenta i ručně), Dokončené + dotazník spokojenosti, Hodnocení, Náklady, Faktury (archiv napříč byznysy), Šablony webu (knihovna bloků + drag-and-drop per zakázka), notifikace, profil.
- **ALTENO** (`/alteno`) — jádro zakázek + inbox poptávek z alteno.cz (booking API i kontaktní formulář).
- **Klientský portál** `/p/[token]` — progress, NPS feedback, rezervace konzultací.
- **Hub** (`/hub`) — Finance (dvě linie příjmů, faktury, daňová kalkulačka, limity, termíny, legislativní novinky), Byznys/Startup (waitlist, launch emaily), Projekty, Plány (5 kategorií), Škola (LernSax/Beste Schule scraping), Sport (výživa, trénink, váha, Health Score).

**Poslední práce (2026-09-19):** veřejný endpoint `/api/public/alteno-leads` pro kontaktní formulář alteno.cz.

**Rozpracováno:** ZakazIQ Workspace (SaaS) + landing page na větvi `workspace` (R-015). S00: plán `docs/workspace/PLAN.md`, skilly `.claude/skills/zakaziq-*`, env blok v `.env.example`. S01: design systém Dílky v kódu — tokeny `app/ws-tokens.css`, Tailwind `lib/ws/tailwind-dilky.ts`, písma `lib/ws/fonts.ts`, kořen `components/ws/ws-root.tsx`, UI kit `components/ui/`, komponenty `components/ws/brand/`, přehled `/w/_design` (jen dev). S02: bezpečnostní základ — hlavičky v `next.config.mjs`, CSP s nonce v `proxy.ts` + `lib/security/` (od S19 vynucená pro všechny cesty), `security.txt`, CI `.github/workflows/security.yml`, stav v `.claude/security/STATE.md`. S09: kostra aplikace `/w/[byznys]` a obrazovka Dnes (odstavec níže). S19 rozpracováno: checklist `docs/workspace/LAUNCH.md`, CSP v5, omezené streamové načítání requestů; zbývá Preview auth, úplné DNS/HTTP ověření, závislosti a ruční provozní/právní kroky. Prompty sezení: `new - area of zakaziq/prompty/` (rozcestník `00-README.md`). **Redesign podle R-057:** kalendářový příběh, kapitoly zákaznice a peněz a širší kalendář na Dnes jsou nyní přeneseny z commitu `06d7b3f` do tohoto pracovního stromu; `/kalendar` má pruh Příchozí vedle mřížky; detail je od 1280 px zadokovaný vedle obsahu. Zbývá z handoffu: průchod s přihlášením na skutečných datech. Změny S19 a landing/redesign R-057 jsou od 2026-10-18 uložené v commitech `69baadd` (bezpečnost) a `66a7799` (landing + kalendář).

**Sezení Workspace:**

| # | Sezení | Stav |
|---|---|---|
| S00 | Příprava repa, paměti, skillů | hotovo (2026-10-08) |
| S01 | Design systém Dílky v kódu | hotovo (2026-10-08) |
| S02 | Bezpečnostní základ | hotovo (2026-10-08) |
| S03 | Brief landing page | hotovo (2026-10-08) |
| S04 | Landing page — stavba a animace | hotovo (2026-10-08) |
| S05 | Landing page — SEO a texty | základní SEO hotovo (2026-10-17, R-055); klíčová slova vynechána, texty beze změny; oborové podstránky jen návrh (Otevřené problémy) |
| S06 | Databáze a oddělení účtů | hotovo (2026-10-08), migrace a role `ws_app` na Neonu (2026-10-09) |
| S07 | Clerk, registrace, nový byznys | hotovo (2026-10-09) |
| S08 | Stripe předplatné 249 Kč | hotovo v sandboxu (2026-10-10); produkční webhook a live mód před spuštěním (Otevřené problémy) |
| S09 | Kostra aplikace a obrazovka Dnes | hotovo (2026-10-09), naostro s přihlášením neověřeno |
| S10 | Poptávky a kalendář | hotovo (2026-10-10), naostro s přihlášením neověřeno |
| S11 | Veřejné API, objednávací stránka, widget | hotovo (2026-10-10), migrace 076 na Neonu; Nastavení › Napojený web naostro s přihlášením neověřeno |
| S12 | Zákazníci, věrnost, segmenty | hotovo v repu (2026-10-10); migrace 077–078 na Neonu |
| S13 | Nastavení: funkce, služby, kolonky, stavy | hotovo v repu (2026-10-17, větev `chore/next-16`); migrace 079 na Neonu, s přihlášením neověřeno |
| S14 | Peníze: faktury, příjmy, daně | hotovo v repu (2026-10-10, commit `35cba9f`); migrace 080 na Neonu |
| S15 | E-maily, upozornění, novinky | hotovo v repu (2026-10-10); migrace 081 na Neonu, odesílání čeká na doménu v Resendu (`WS_EMAIL_FROM`) |
| S16 | Klientský portál | hotovo v repu (2026-10-10); migrace 082 na Neonu, skutečná data neověřena |
| S17 | Admin: klienti a novinky | hotovo v repu (2026-10-10); migrace 083 na Neonu, s přihlášením neověřeno |
| S18 | Mobil, tmavý režim, GDPR | hotovo v repu (2026-10-17, větev `ws/s18`); migrace 084 neaplikovaná, s přihlášením a test s novým uživatelem neověřeno |
| S19 | Bezpečnostní audit a spuštění | rozpracováno (2026-10-17): CSP v kódu, Preview READY, produkční audit a Nodemailer 10; produkce je starší build bez CSP, Chrome hlásí NextAuth config error; zbývají závislosti a provozní/právní ověření |

**Landing page (S03):** zadání je `docs/landing/PROJECT-BRIEF.md`. Jedna stránka s kotvami v `app/(marketing)/page.tsx`, sekce LP-D + Proč to řešit (R-031), bez formuláře, kontakt e-mailem podpory (R-032), dynamická s vynucenou CSP (R-033), právní stránky `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` zástupně. Úmyslně zatím chybí: e-mail podpory, IČO, právní texty, sociální důkaz (nemáme reference), odkaz Novinky.

**Databáze Workspace (S06):** schéma `ws` (migrace 064–075, 33 tabulek, R-035), role `ws_app` (`scripts/ws-create-role.js`), `lib/ws/{db,context,result}.ts`, šablony 8 oborů `lib/ws/templates/`, testy oddělení účtů v PGlite (R-036). Postup: `docs/workspace/SETUP.md`. Migrace 064–075 jsou na produkčním Neonu (ověřeno 2026-10-09: 33 tabulek, RLS na všech kromě `stripe_events`, `webhook_events`, `rate_limits`). Role `ws_app` založená skriptem, `DATABASE_URL_WS` je v `.env.local`; **ve Vercelu zatím chybí** (Otevřené problémy).

**Přihlášení Workspace (S07):** Clerk 6.39.7 jen pod `/w` (R-037), přihlášení `/w/prihlaseni`, registrace `/w/registrace`, průvodce `/w/novy` (název + obor → účet, byznys a šablona oboru), `/w` (od S09 přesměruje na `/w/[byznys]`), webhook `/api/clerk/webhook`. Dev instance Clerku (aplikace ZakazIQ, `app_3KSvZAk4iFgvwVicglMwWtga6Gd`) propojená `clerk link`, klíče v `.env.local`. Registrace → průvodce → `/w` ověřená naostro 2026-10-09 (Kryštof, e-mailem): v produkční DB 1 účet, 1 člen, 1 byznys se šablonou oboru. Neověřeno: přihlášení přes Google, Turnstile, Safari. Webhook nemá endpoint ani `CLERK_WEBHOOK_SECRET`.

**Předplatné (S08):** 14 dní zdarma s kartou přes Stripe Checkout (R-038), `stripe` 22.6.2 (R-039). Průvodce `/w/novy` má krok 2 (předplatné), návrat z Checkoutu `/w/predplatne`, `/w/ucet` (stav, Customer Portal, doklady), pruh `components/ws/billing/billing-banner.tsx`, webhook `/api/stripe/webhook`, logika `lib/ws/billing.ts`. Testy proti podstrčenému Stripe prochází. **Chybí:** sandbox ZakazIQ ve Stripe a klíče v `.env.local`, takže Checkout ani ruční test (`docs/workspace/SETUP.md` → Stripe § 6) zatím neproběhly a vzhled kroku 2 a `/w/ucet` není vyfocený. Stav předplatného je zapojený v kostře `/w/[business]` (S09: přesměrování při `none`, pruh, odkaz Účet, `?vitejte=1`). Kryštofův účet v produkční DB předplatné nemá, po přihlášení ho průvodce pošle do kroku 2.

**Kostra a Dnes (S09):** `/w` přesměruje na naposledy otevřený byznys, `/w/[byznys]` má postranní panel jen se zapnutými funkcemi, hlavičku (přepínač byznysů, hledání ⌘K, zvonek, „+ Nová“), na telefonu spodní lištu a menu. Dnes = Příchozí | týdenní kalendář | karta zákazníka (R-040), stav v URL (`?detail=`, `?zakaznik=`, `?tyden=`). Ostatní části menu jsou zástupné stránky („Tuhle obrazovku právě stavíme“). Nehotové akce (odkaz na objednání, Nová rezervace, Nová faktura) jsou skryté přepínači v `lib/ws/features.ts` (R-043), zapnou je S11, S10 a S14; bez nich chybí i „+ Nová“. Ukázková data `node scripts/ws-seed.mjs <slug> --ano` (R-041), na produkční DB zatím nepuštěná. Vzhled ověřen na náhledu s fiktivními daty (1440, 820, 390 px), **s přihlášením naostro ne**: Kryštofův účet nemá předplatné, takže ho kostra pošle do kroku 2 průvodce, dokud S08 nedokončí Stripe.

**Poptávky a kalendář (S10):** poptávky jdou potvrdit jedním klikem z Dnes (Příchozí), z Poptávek (`/poptavky`, Nové / Potvrzené / Vyřízené) i z Kalendáře (tlačítko na čárkovaném bloku), v panelu navíc Jiný čas a Odmítnout s tipem „Termín je volný / Koliduje s…“. Kalendář `/kalendar` den / týden / měsíc, v pohledu Den sloupce podle pracovníků, přetažení termínu myší se „Zpět“, blokace, nová rezervace z panelu nebo kliknutím do mřížky; na telefonu seznam. Zakázky `/zakazky` jako tabule podle stavů. Odmítnutí, zrušení a přesuny jdou vrátit (toast 8 s). Živé obnovení po 10 s (`/api/ws/[byznys]/zmeny`, ETag). Nová rezervace zapnutá ve `WS_FEATURES`. Rozhodnutí R-044. Testy 270/270 (z toho 20 nových v `ws-bookings.test.ts`), build OK. Vzhled ověřen jen na dočasném náhledu s fiktivními daty (1440 px v Chromu, 390 px headless) — **s přihlášením naostro ne** (prohlížeč nebyl přihlášený).

**Veřejné API a objednávání (S11):** `POST /api/public/v1/requests` a `GET /api/public/v1/schema` (tajný klíč ze serveru webu, veřejný klíč z povolené domény), objednávací stránka `/r/[slug]` (služba → termín → kontakt → hotovo, barva byznysu), widget `/embed/[slug].js` (shadow DOM, tlačítko nebo `data-mode="inline"`), Nastavení › Napojený web `/w/[byznys]/nastaveni/web` (prompt pro Claude Code, tajný klíč, Ověřit napojení, odkaz + QR, kód widgetu, povolené weby, návod webáři přes `mailto:`, posledních 20 požadavků). Dokumentace `docs/workspace/API.md`. Rozhodnutí R-045. Migrace 076 je na produkčním Neonu (ověřeno: 34 tabulek, RLS na `intake_log`, práva `ws_app`). `WS_KEY_PEPPER` je v `.env.local`, **ve Vercelu chybí**. Ověřeno naostro na `localhost:3001` (byznys `ahoj`): objednávka v Chromu na 390 px až po „Poptávka je odeslaná“ (v DB `source = page`, zákazník a upozornění vznikly), API s tajným klíčem 202 + idempotence, tajný klíč z prohlížeče 401, CORS jen pro povolenou doménu, widget 200 (~3 kB gzip), `frame-ancestors` z DB. Widget v prohlížeči z cizí domény neověřen (Chrome blokuje veřejný web → localhost), vzhled widgetu ověřen s podstrčenou odpovědí API. Nastavení › Napojený web jen na dočasném náhledu s fiktivními daty (smazán) — prohlížeč nebyl přihlášený. V byznysu `ahoj` zůstala poptávka „Zkouška S11“ (ze stránky, viditelná v Dnes) a jedna zkušební (skrytá); tajný klíč, který jsem pro test vygeneroval, nikdo nezná — v Nastavení ho vyměnit.

**Zákazníci, věrnost a skupiny (S12):** `/w/[byznys]/zakaznici` obsahuje hledání, skupiny, útratu po měnách, detail v pravém panelu, historii, souhlas s nabídkami, ukončení spolupráce, slučování duplicit a panel „Komu napsat“ s e-mailovými koncepty. `lib/ws/loyalty.ts` zapisuje platbu návštěvy i razítko atomicky, umí ruční úpravu, odměnu, platnost a razítko za hotovou zakázku; `lib/ws/segments.ts` vyhodnocuje Nové, Stálé, Jednorázové, Spící a Ukončení a cron je přepočítá denně. Věrnostní částky se porovnávají jen v CZK, dokud není zadaný kurz. Migrace 077 je na Neonu (ověřeno funkcí a sloupcem); 078 je připravená k ručnímu vložení a chrání před dodatečným razítkem za návštěvu s odměnou.

**Nastavení (S13):** rozcestník Nastavení obsahuje funkce, služby, formulář, stavy, otevírací dobu a pracovníky, věrnost, skupiny, napojený web, e-maily a vzhled. Funkce se ukládají s vazbami Daně → Příjmy a Připomínky → Kalendář; poptávky a zákazníci zůstávají zapnuté. Služba má cenu, délku, rozestup a „Kdo ji dělá“ (od dvou pracovníků); jde upravit i skrýt. Otevírací doba po dnech s přestávkami, pracovníci (přidat, přejmenovat, skrýt, vlastní směny), dovolené a zavřeno po celých dnech (blokace v kalendáři). Služby, pracovníci, kolonky a stavy se řadí přetažením (myš, prst, klávesnice). Kolonky se po uložení ihned propíší do objednávací stránky a API. Rozhodnutí R-054. Vzhled ověřen na dočasném náhledu s fiktivními daty (1280 a 390 px, smazán); s přihlášením na skutečné DB neověřeno. Chybí: živý náhled kolonky stejnou komponentou jako `/r/[slug]` (dnes vlastní náhled) a úprava existující kolonky a stavu (jen přidat, pořadí, odstranit stav).

**Peníze (S14):** faktury ručně/z hotové zakázky, PDF Dílky, přijaté PDF s volitelným AI přepisem, platby bez dvojího příjmu, přehled měsíce a graf 6/12 měsíců po měnách, celé IČO, odhad daní 2026 a ICS připomínky. Migrace 080 připravená, na Neon neaplikovaná. E-mail faktury je jen koncept pro S15. Postup a omezení: docs/workspace/MONEY.md; skutečný obrat DPH není totéž co přijaté příjmy. S přihlášením na skutečné DB neověřeno.

**E-maily a upozornění (S15):** fronta `ws.outbound_messages` s klíčem události (nezdvojí), Resend za rozhraním (`lib/ws/email/`), odeslání hned po akci, při živém obnovení a denním cronem `/api/cron/ws-email` (R-050). Zákazníkům: přijatá poptávka, potvrzení s .ics, změna, odmítnutí/zrušení (60 s na „Zpět“), připomínka den předem ráno, poděkování s kartou, odměna, faktura s PDF, „Komu napsat“ s odhlášením. Majiteli: nová poptávka s tlačítky Potvrdit / Jiný čas bez přihlášení (`/z/odkaz`, 72 h, jednou), přehled dne/týdne/měsíce, faktura po splatnosti, limit DPH, neúspěšná platba. Nastavení › E-maily a upozornění (přepínače, text s proměnnými, živý náhled, zkušební e-mail, Reply-To, novinky). Zvonek po otevření přečtený, „Co je nového“ z `ws.product_news` (zápis S17). Webhook Resendu pro nedoručené. Testy `ws-email.test.ts` (21). **Neodesílá se nic, dokud není ověřená doména v Resendu a `WS_EMAIL_FROM`** (postup `docs/workspace/SETUP.md` → E-maily). Migrace 081 na Neonu není. Vzhled e-mailů ověřen headless (700 a 375 px), Nastavení s přihlášením neověřeno.

**Klientský portál (S16):** `/z/[token]` bez registrace ukazuje termín nebo zakázku, postup, zprávy firmy, věrnost, vystavené faktury a hodnocení. Zákazník může podle pravidla byznysu termín přesunout nebo zrušit; e-maily k termínu vedou do portálu. Zakázka má v pravém panelu odkaz, zprávy a výsledek. Interní poznámky ani kontakty se nenačítají (R-051). Migrace 082 není na Neonu. Vzhled schválen na počítači i telefonu z dočasného náhledu (smazán); skutečná data po migraci neověřena.

**Admin: klienti a novinky (S17):** `/dashboard/klienti` (účty Workspace: obor, byznysy, stav předplatného, poslední aktivita, poptávky 30 dní, web), detail s klíči a promptem pro web, opakovanou pozvánkou, interní poznámkou a historií z auditu; „Pozvat klienta“ založí Clerk organizaci, účet a byznys ze šablony a pošle pozvánku (klient pak zadá kartu v kroku 2). `/dashboard/novinky`: štítek, nadpis, text, obrázek, odkaz, náhled v aplikaci i e-mailu, tipy „Učesat text“ bez AI, Zveřejnit v aplikaci, Poslat e-mailem všem s potvrzeným počtem příjemců. R-052, DECISIONS #013. Na Neonu jsou migrace 078–083 (ověřeno čtením 2026-10-10, aplikoval Kryštof). Vzhled ověřen headless na náhledu s fiktivními daty (1280 a 390 px, smazán); s přihlášením adminu a skutečnou pozvánkou z Clerku neověřeno.

**Mobil, tmavý režim, GDPR (S18, R-054):** větev `ws/s18` nad `chore/next-16`. Výmaz zákazníka na žádost v jeho kartě (potvrzení jménem; historie s „Smazaný zákazník“, vystavené faktury s povinnými údaji 10 let, pak je cron anonymizuje), export všech dat v Účtu (ZIP s CSV a PDF), zrušení účtu (Stripe hned, data 30 dní, obnovení, pak cron smaže účet i organizaci v Clerku), záznam o zpracování `/w/ucet/zpracovani`, souhlas s nabídkami na `/r`, ve widgetu a v API, fakta o lhůtách na `/podminky` a `/zpracovatelska-smlouva` (zbytek textu `[DOPLNIT]`). Vzhled v Účtu (Podle telefonu / Světlý / Tmavý) přes cookie bez bliknutí; tmavé tokeny + přemapování světlých tříd v `app/ws-tokens.css`. PWA: manifest, ikony z loga, service worker jen s offline stránkou, „Přidat na plochu“ v Účtu. Kalendář na telefonu začíná dnem, „táhni pro obnovení“ na Dnes v aplikaci na ploše. Ověřeno: 477 testů, `tsc`, `build:check`; vzhled Dnes, karty zákazníka a Účtu na dočasném náhledu s fiktivními daty (1400 px tmavý, 390 px světlý i „Podle telefonu“ v tmavém systému, smazán), offline stránka 390 px. **Neověřeno:** obrazovky s přihlášením (prohlížeč nebyl přihlášený), export a výmaz na skutečné DB (migrace 084 není na Neonu), instalace PWA na telefonu, test „člověk, který aplikaci neviděl“.

**Další krok:** dokončit S19 podle `docs/workspace/LAUNCH.md`: nasadit Preview a projít CSP v Chrome/Safari, auditovat dostupné nasazené hosty, vyřešit live Clerk/Stripe/Resend, migraci 084 a předchozí neověřené toky, zálohu/obnovu, právní texty, podporu a pilot. Doménu Kryštof potvrdil jako nastavenou, z tohoto prostředí ale nebyla dostupná pro DNS/HTTP audit. Neprovádět produkční deploy bez výslovného schválení. **Souběžně:** redesign aplikace Workspace podle `docs/workspace/REDESIGN-APP-PLAN.md` (sezení RD00–RD16, prompty `new - area of zakaziq/prompty/redesign/`), RD00 rozpracováno (2026-10-18): rozhodnutí D-1–D-10 odsouhlasená (R-058), rozpracované změny uložené ve dvou commitech, větev `ws/redesign-app`. Zbývá testovací Neon branch (založí Kryštof), měření rychlosti a první průchod s přihlášením; mezitím jde RD01 (nezávisí na DB).

**Upgrade na Next 16 (R-053, 2026-10-17):** větev `chore/next-16` z `workspace` (3 commity: S17, balíčky, kód); aplikace je na Next 16.4.2 s Turbopackem a React 19, `middleware.ts` je `proxy.ts`. Hotové a ověřené lokálně (typy, 451 testů, build, smoke test). S13 je dokončená na stejné větvi (commit po upgradu). **Před mergem zbývá:** ruční průchod s přihlášením (admin NextAuth, Workspace Clerk), PDF faktury a Vercel Preview deploy; merge do `workspace`/`main` a produkční deploy jen se souhlasem Kryštofa.

**Prostředí agentů:** Claude Code i Codex používají stručný `AGENTS.md` a podle úlohy čtou závaznou `docs/AGENTS-REFERENCE.md` (R-047); paměť je společná v `memory/`. Projektové skilly a bezpečnostní záznamy jsou synchronizované do `.agents/`; příprava Codexu a worktree viz `docs/CODEX.md` (R-046). Konfigurace a skripty ověřené lokálně; automatické spuštění setupu a akcí v novém chatu klienta nebylo ověřeno.

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
**Rozhodnutí:** (1) S05 = jen základní technické SEO: metadata, canonical, Open Graph/Twitter, OG obrázek, ikony, `robots.txt`, `sitemap.xml`, JSON-LD `Organization` + `WebSite` + `SoftwareApplication` (249 CZK měsíčně, bez hodnocení). Výzkum klíčových slov a přepis textů kvůli nim se nedělá. (2) Neveřejné cesty (`/w`, `/r`, `/z`, `/embed`, `/api`, admin) mají `X-Robots-Tag: noindex, nofollow`; `robots.txt` zakazuje jen `/api/`. (3) Právní stránky `noindex, follow` a mimo sitemapu, dokud mají `[DOPLNIT]`. (4) Bez `FAQPage`. (5) Oborové podstránky se nestaví, jen návrh.
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
**Důsledek:** větev `ws/redesign-app` z `ws/s18` (RD00); migrace od 085, jen připravit, aplikuje Kryštof; admin se nemění (výjimka jen RD11); stav sezení v plánu, sekce 5. Navazuje na R-057.

## 3. Otevřené problémy

- [ ] **Landing — oborové podstránky (návrh R-055, nestavět bez rozhodnutí):** `/pro/kadernictvi`, `/pro/kosmetika`, `/pro/remeslnici` (zámečnictví, studnařství, stavba), `/pro/autoservis`, `/pro/uklid`; likvidace azbestu spíš jako sekce u řemeslníků. Každá jen s obsahem, který je opravdu jiný: služby a kolonky ze šablony oboru (`lib/ws/templates/`), ukázka objednávky pro obor, vlastní dotazy. Bez skutečných zákazníků z oboru hrozí tenké stránky, proto začít 1–2 obory, kde budou první reference. `/cenik` samostatně nedává smysl (jedna cena, kotva stačí) · od 2026-10-17
- [ ] **Landing — po nasazení na `zakaziq.cz`:** ověřit `curl` canonical/robots/sitemap na produkčním hostu (apex vs. www podle `NEXT_PUBLIC_APP_URL`), schéma v Rich Results Test, odeslat sitemapu do Google Search Console a Bing Webmaster Tools · od 2026-10-17
- [ ] **Landing — kontrast drobných popisků:** Lighthouse přístupnost 96: popisky `text-navy-400` 11 px na bílé a texty v živé ukázce během animace (`opacity-75`, nájezd) nemají 4,5:1. Design Dílků, řešit s mockupem · `components/marketing/{live-demo,features}.tsx` · od 2026-10-17

- [ ] **S18 naostro:** migrace 084 na Neon, obrazovky s přihlášením na telefonu (390 px) a v tmavém režimu, export a výmaz na skutečné DB, zrušení a obnovení testovacího účtu, cron `ws-gdpr` na Vercelu, instalace PWA (Android i iPhone), test „člověk, který aplikaci neviděl“ · od 2026-10-17
- [ ] **Zrušení účtu a nevyčerpané předplatné:** předplatné se ruší hned bez vrácení peněz za zbytek měsíce. Rozhodnout, jestli vracet poměrnou část (Stripe `prorate`/refund) a napsat to do podmínek · `app/w/ucet/actions.ts` · od 2026-10-17
- [ ] **Právní texty a GDPR:** `/podminky` a `/zpracovatelska-smlouva` mají jen fakta o lhůtách (S18), zbytek `[DOPLNIT]`; v záznamu o zpracování chybí provozovatel, regiony Vercel/Neon/Resend/Stripe a délka historie obnovy v Neonu · od 2026-10-17
- [ ] **Výmaz a odeslané e-maily majiteli:** přehledy dne/týdne v `ws.outbound_messages.payload` můžou nést jméno vymazaného zákazníka (výmaz maže jen zprávy s jeho id nebo klíčem). Zvážit čištění payloadu odeslaných zpráv po 90 dnech · od 2026-10-17
- [ ] **Tmavý režim — nové třídy:** přemapování v `app/ws-tokens.css` pokrývá třídy použité k 2026-10-17; nová světlá třída (např. `bg-navy-200/50`) potřebuje vlastní `dark:` nebo řádek v tokenech. `/r`, `/z` a landing zůstávají světlé (rozhodnout, jestli i ony) · od 2026-10-17
- [ ] **Upgrade Next 16 — ruční ověření:** projít s přihlášením admin (NextAuth) a Workspace (Clerk), stáhnout PDF faktury (Chromium pod Turbopackem) a nasadit větev `chore/next-16` jako Vercel Preview, než se mergne · od 2026-10-17
- [ ] **`Dockerfile` nesedí s konfigurací:** kopíruje `.next/standalone`, ale `next.config.mjs` nemá `output: 'standalone'`. Produkce běží na Vercelu; rozhodnout, jestli Dockerfile smazat nebo opravit · od 2026-10-17
- [ ] **Legacy routy:** `app/dashboard/projekty/**` zůstalo po přesunu Projektů do Hubu (R-007); `projekty-actions.ts` se liší od verze v `app/hub/projekty/`. Rozhodnout: smazat, nebo přesměrovat na `/hub/projekty` · od 2026-06-23
- [ ] **Mrtvé env:** `FATSECRET_CLIENT_ID/SECRET` jsou v `.env.example`, ale kód je nepoužívá (vyhledávání jídla jede přes Open Food Facts, `lib/fatsecret.ts` a `/api/fatsecret/search` mají historický název) · od 2026-06-22
- [ ] **Připomínky 2 h před konzultací:** po R-006 není jasné, jestli běží externí hodinový cron (commit 2026-06-20 zmiňuje „externí hodinový cron"). Ověřit u uživatele · od 2026-06-25
- [ ] **Workspace — env ve Vercelu:** Production i Preview mají `DATABASE_URL_WS`, klíče Clerku, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (2026-10-10). Zbývá: `STRIPE_WEBHOOK_SECRET` v Production je od Kryštofa a nemusí patřit produkčnímu endpointu (ten ještě neexistuje) — přepsat podpisovým klíčem endpointu `https://www.zakaziq.cz/api/stripe/webhook` při nasazení `/w`; `NEXT_PUBLIC_APP_URL` v Preview míří na produkční adresu, takže Checkout z Preview vrací na produkci · od 2026-10-08
- [ ] **Clerk — webhook:** v Clerk dashboardu založit endpoint `https://<doména>/api/clerk/webhook` (události `organization.updated`, `organizationMembership.*`) a jeho podpisový klíč dát do `CLERK_WEBHOOK_SECRET` (`.env.local` i Vercel). Do té doby route vrací 503 a členové se nesynchronizují (vlastníka zapíše průvodce) · od 2026-10-09
- [ ] **Clerk — produkční instance** (`clerk deploy`, doména `clerk.zakaziq.cz`, vlastní Google OAuth údaje, produkční klíče). Dev instance nesmí do produkce · před S19 · od 2026-10-09
- [ ] **Clerk — limit 5 členů na organizaci** (výchozí v Clerku). R-020 slibuje neomezeně pracovníků — pracovníci ve `ws.staff` se přihlašovat nemusí, ale přihlašovací účty pro tým (S13?) limit narazí. Ověřit, jestli jde zvednout na našem plánu Clerku · od 2026-10-09
- [ ] **Clerk — e-maily s kódem** chodí z Clerku (šablona a jazyk podle nastavení instance). Ověřit při první registraci, že jsou česky a jménem ZakazIQ; jinak nastavit v dashboardu Clerku (Customization → Emails) · od 2026-10-09
- [ ] **Clerk — `user.updated`** (změna jména/e-mailu) se do `ws.members` nepropisuje — webhook ho nezpracovává, payload nemá organizace. Řešit, až se jména členů budou někde zobrazovat (S13) · od 2026-10-09
- [ ] **Stripe — lokální webhook:** pro `stripe listen` chybí CLI profil ZakazIQ (`stripe login --project-name zakaziq`), omezený klíč na listen nestačí (403); po přihlášení dát jeho `whsec_` do `.env.local`. Potřeba jen při lokálním testu plateb · od 2026-10-09
- [ ] **Stripe — live mód** (produkt, cena, Portal, e-maily, šablona faktury s IČO a „Nejsem plátce DPH“, webhook endpoint, live klíče jen do Vercelu Production) · před S19 · od 2026-10-09
- [ ] **`ws.accounts.trial_ends_at`** se po R-038 nepoužívá. Nechat, nebo odstranit migrací (data se tím nemažou)? Neblokuje · od 2026-10-09
- [ ] **Evidence migrací:** neexistuje tabulka, která by evidovala, které migrace jsou aplikované na produkční DB — stav se drží jen v changelogu (pravidlo: u každé migrace zapsat „aplikována: ano/ne") · od 2026-10-08
- [ ] **Resend jen kvůli waitlistu:** závislost `resend` slouží jedné funkci (`sendLaunchEmailBlast`). Zvážit převod na `lib/email.ts` (R-004) · od 2026-10-08
- [ ] **Workspace — IČO a právní texty** (podmínky, ochrana údajů, zpracovatelská smlouva). V S04 zástupně `[DOPLNIT]` (R-023), skutečné texty blokují S19 · od 2026-10-08
- [ ] **Workspace — SMS poskytovatel** pro připomínky a „Komu napsat". Blokuje S12/S15 (lze odložit) · od 2026-10-08
- [ ] **Workspace — zálohy online přes Stripe Connect** teď, nebo až po spuštění? Neblokuje · od 2026-10-08
- [ ] **Workspace — admin přihlášení:** nechat NextAuth natrvalo, nebo později převést na Clerk? Neblokuje · od 2026-10-08
- [ ] **S14 naostro:** obrazovky Peněz s přihlášením, PDF na Vercelu a externí AI přepis neověřené (migrace 080 na Neonu) · od 2026-10-10
- [ ] **S16 naostro:** ověřit skutečný termín, zakázku, fakturu a hodnocení v `/z/[token]` (migrace 082 na Neonu) · od 2026-10-10
- [ ] **S17 — pozvaní klienti a platba:** pozvaný klient prochází stejným Checkoutem (14 dní s kartou, R-038). Rozhodnout, jestli klienti, kterým Kryštof staví web, mají mít Workspace zdarma nebo se slevou (kupón ve Stripe) · od 2026-10-10
- [ ] **S17 naostro:** pozvánka Clerku (e-mail, registrace s `__clerk_ticket` na `/w/registrace`, aktivace organizace, `ensureMember`) a obě admin stránky s přihlášením neověřené · od 2026-10-10
- [ ] **S15 — odesílání e-mailů:** doména `zakaziq.cz` v Resendu (DNS SPF/DKIM/DMARC), `WS_EMAIL_FROM`, endpoint webhooku + `RESEND_WEBHOOK_SECRET` (lokálně i Vercel). Do té doby nic neodchází. Postup `docs/workspace/SETUP.md` → E-maily · od 2026-10-10
- [ ] **S15 — naostro neověřeno:** Nastavení › E-maily (náhled, zkušební e-mail) s přihlášením, skutečné doručení a vzhled v Gmailu/Outlooku/Apple Mailu, odkaz Potvrdit z telefonu, cron na Vercelu · od 2026-10-10
- [ ] **Workspace — cena za další byznys na účtu** a kdy ho zapnout (R-026). Neblokuje · od 2026-10-08
- [ ] **Zranitelné závislosti:** Nodemailer aktualizován na 10.1.2 (R-056); zbývá 5 high a 2 moderate z Tailwind 3 řetězce. `npm audit fix` bez `--force` je nevyřešil, úplná oprava vyžaduje Tailwind 4 major migraci · od 2026-10-08
- [ ] **Workspace — toasty přes adminův `<Toaster>`** (R-027): pozice a délka jsou společné s adminem (vpravo nahoře). Až bude potřeba vlastní toaster (např. spodní lišta na mobilu v S09/S18), řešit upgradem sonneru na 2.x (víc toasterů) nebo úpravou `app/layout.tsx` — obojí sahá na admin, chce souhlas · od 2026-10-08
- [ ] **Workspace — Inter se stahuje i na stránkách Dílků:** `@import` Google Fonts v `app/globals.css` (admin) se načte všude; Instrument Sans ho přebije, jen zbytečný request CSS. Od S02 ho na `/w` a od S04 i na landing page blokuje vynucená CSP — žádný request, ale chyba v konzoli i na veřejné stránce (Lighthouse Best Practices). Řešit, až se bude sahat na admin · od 2026-10-08
- [ ] **Bezpečnost — otevřené položky** (produkční CSP/COOP/CORP, DNS/e-mailové záznamy, Preview auth, security.txt, záloha/obnova): vedené v `.claude/security/STATE.md` → Otevřené položky · od 2026-10-08
- [ ] **Landing — e-mail podpory:** firemní adresa pro „Napište nám“ (R-032) chybí, na landing `[DOPLNIT]`. Blokuje spuštění (S19) · od 2026-10-08
- [ ] **Landing — kde jsou data uložená:** odpověď v Dotazech má `[DOPLNIT]` (region Neonu, ověřit) · od 2026-10-08
- [ ] **Workspace — Dnes, Poptávky, Kalendář, Zakázky naostro:** S09 a S10 ověřené jen na náhledu s fiktivními daty. Projít s přihlášením (desktop i telefon): potvrzení jedním klikem, Jiný čas, Odmítnout + Zpět, přetažení termínu, blokace, živé obnovení (poptávka vložená jinde se ukáže do 15 s). Případně s ukázkovými daty (`scripts/ws-seed.mjs`, R-041) · od 2026-10-09
- [ ] **Kalendář — blokace celého byznysu:** bez pracovníka ji DB omezení nehlídá (R-035), ruční rezervace a potvrzení přes ni projdou (tip v detailu poptávky ji ukáže). Volné časy pro web ji od S11 vynechávají; zvážit kontrolu i v ruční rezervaci · `lib/ws/bookings.ts` · od 2026-10-10
- [ ] **Workspace — `WS_KEY_PEPPER` ve Vercelu** (Production + Preview) chybí, bez něj API s tajným klíčem vrací 503 a klíč nejde vytvořit. Po nastavení už neměnit (zneplatní všechny tajné klíče) · od 2026-10-10
- [ ] **Napojený web — naostro s přihlášením a z cizí https domény:** Nastavení › Napojený web, Ověřit napojení, QR PNG/SVG, widget na skutečném cizím webu (Chrome blokuje veřejný web → localhost, ověřit na Preview) · od 2026-10-10
- [ ] **Data cache Nextu i v adminu:** `lib/db.ts` (admin) volá Neon HTTP bez `cache: 'no-store'` — ve Workspace to vracelo stará data v route handlerech (opraveno v `lib/ws/db.ts`). Admin se nemění; ověřit, jestli se ho to týká (např. veřejné booking API), až se bude sahat na admin · od 2026-10-10
- [ ] **Kalendář — přetažení na dotykovém displeji** nefunguje (HTML5 drag and drop jen myší); na telefonu a tabletu se přesouvá tlačítkem Přesunout v detailu. Řešit v S18, pokud bude potřeba · od 2026-10-10
- [ ] **Workspace — `/w/ucet` mimo kostru:** stránka účtu (S08) má vlastní rozložení s odkazem zpět, kostra na ni vede z „Účet“. Zasadit do kostry, až bude jasné, jestli má být pod `/w/[byznys]` nebo nad ním · od 2026-10-09
- [ ] **`npm run lint` není nastavený** (`next lint` jen nabídne průvodce ESLintem). Kontrolu dělá `tsc` a build · od 2026-10-09
- [ ] **`N8N_API_KEY`** není v lokálním `.env.local` — lokálně `/api/public/leads` vše odmítne (fail-closed). Na produkci ověřit ve Vercelu · od 2026-10-08

---

## 4. Changelog

*Nejnovější nahoře. Starší měsíce → `archiv/YYYY-MM.md` (viz pravidla §4).*

### 2026-10-18
- **decision** R-058: Kryštof odsouhlasil D-1–D-8 a D-10 (D-9 už padlo), rozsah a pořadí redesignu aplikace Workspace (RD00–RD16). Tabulka rozhodnutí v `docs/workspace/REDESIGN-APP-PLAN.md` (sekce 6) označená jako rozhodnutá.
- **chore** RD00: ~66 rozpracovaných souborů uloženo do dvou commitů na `ws/s18`: `69baadd` (S19 bezpečnost: CSP v5, `request-body`, webhooky, Nodemailer 10, `.npmrc`, `LAUNCH.md`, opravy cen s haléři a skrytých pracovníků) a `66a7799` (landing + kalendář a zadokovaný detail, R-057); třetí commit je paměť a plán redesignu. V `migrations/080_ws_penize_provoz.sql` jsem vrátil přesunutý komentář (stará migrace se neupravuje). Větev `ws/redesign-app` z `ws/s18`. Ověřeno: `tsc` čistý, `npm test` 480 + 1 přeskočený, `sync-agent-context --check` shodné. Nezahrnuto: `.claude/launch.json` (lokální náhled) a kopie plánu v `new - area of zakaziq/docs/`.
- **docs** Plán redesignu aplikace Workspace `docs/workspace/REDESIGN-APP-PLAN.md` rozfázovaný na sezení RD00–RD16 (RD16 = telefon, e-mail a „Napsat“ jedním klikem u zákazníka, vzor admin Hovory; čeká na D-10), prompty v `new - area of zakaziq/prompty/redesign/` (rozcestník `00-README.md`), stav sezení v tabulce plánu (sekce 5). Návrh čeká na odsouhlasení D-1–D-8; D-9 rozhodl Kryštof: Nastavení z hlavního menu do Účtu (RD01), adresy beze změny. Kód se nezměnil. Zjištění z kódu: Neon je ve Frankfurtu a `vercel.json` nemá `regions`, navigace dělá 4–6 kol do DB bez `Suspense`, menu má duplicitní Faktury/Příjmy/Daně, model rezervací zná jednu službu a nemá kapacitu. Zadání Kryštofa: rychlost, kalendář a zakázky, rezervace (objednávka, vlastní rezervace, více služeb, pracovníci, kapacita), fakturace, věrnost, daně a anonymita údajů, Nastavení, sekce Návody. Stará poznámka: changelog 2026-10-17 patří podle pravidel §4 do `archiv/`, přesun zatím neproběhl.

### 2026-10-17
- **feat** Landing 03 Jak to funguje (`components/marketing/how-it-works.tsx`): scroll vede kroky (jako hero ukázka) a pole objednávky se vyplňují postupně po jednom (služba → termín → čas → jméno → odeslání), stejná data Terezy Malé jdou dál do kalendáře, potvrzení a platby. Tlačítka „Ukázat krok“ scrollují na krok, Zpět/Další odstraněny. `tsc` čistý; v Chromu ověřeno na 500px šířce (okno nešlo změnit na desktop), postup polí při scrollu čten z DOM. Desktop a 390 px vizuálně neověřeno. Nezacommitováno.
- **feat** Landing hero ukázka (`components/marketing/live-demo.tsx`): scroll přepíná krok podle kapitoly ve výhledu oběma směry (dřív jen vpřed). Klik na krok platí do přechodu na jinou kapitolu. Brief § 4 (řádky 163 a 381) upraven, R-057 platí dál. Ověřeno v Chromu na localhost:3000 (1440 px): dolů 2→3, nahoru 3→2→1, znovu dolů; `tsc` čistý. Neověřeno na 390 px a přetažení klikem během scrollu. Nezacommitováno.
- **style** Landing: horní odsazení všech sekcí zmenšeno z 72/120 px na 56/96 px a mezery pod nadpisy (12 → 10, hero 12/16 → 10/12) v `features`, `connect`, `faq`, `how-it-works`, `modules`, `pricing`, `hero`. Vzhled beze změny, jen objem. Nezacommitováno; vizuál zatím neověřen v prohlížeči.
- **style** Landing 02 Zákazníci: pod věrnostní kartou je podmínka razítka („Po návštěvě a zaznamenání platby“, pod čarou, bez boxu; `signal` jen pro poptávku a odměnu podle Dílků). Soubor: `components/marketing/features.tsx`. Ověřeno: `tsc` exit 0; vizuál v prohlížeči neověřen. Nezacommitováno.
- **style** Landing 01 Proč to řešit zmenšena (stejný vzhled, menší objem): kratší mezery a odsazení pásů, nadpisy 24/28 px, čas 36 px, výřezy rozhraní max. 340 px a menší paddingy. Soubor: `components/marketing/why-bother.tsx`. Ověřeno: `tsc` exit 0; vizuál v prohlížeči zatím neověřen. Nezacommitováno.
- **feat** Landing 01 Proč to řešit přepracována na čtyři pásy jednoho dne (R-031, stejný přístup jako 04 Funkce): velký čas (mono 44 px), krátký problém, řešení s výřezem rozhraní označeným „Ukázka“, tmavý pás 10:40 jako hlavní moment, jedna zákaznice (Tereza Malá) napříč pásy. Texty zkrácené, fakta a čísla beze změny; skill `humanize-text-cs` prošel, upravena jedna věta (slovosled). Soubory: `components/marketing/why-bother.tsx` (přepsáno), `docs/landing/PROJECT-BRIEF.md` § 4.3. Ověřeno: Puppeteer na 1440, 1024 a 390 px bez přetečení a bez chyb v konzoli, `build:check` exit 0 bez varování. Nezacommitováno.
- **feat** Landing 04 Funkce přepracována podle R-057: asymetrická mozaika dílků místo mřížky 3 × 3, u každé funkce kus rozhraní označený „Ukázka“ (`components/marketing/module-previews.tsx`, nový), přepínače u šesti modulů s pravidly z Nastavení › Funkce (Daně ↔ Příjmy), vypnutá karta jako prázdný čárkovaný dílek, CTA s 14 dny zdarma. Oprava překlepu „Zapnete“ → „Zapněte“. Soubory: `components/marketing/modules.tsx` (přepsáno), `docs/landing/PROJECT-BRIEF.md` § 4.6. Ověřeno: `tsc`, `npm test` 480 + 1 přeskočený, `npm run build:check` (exit 0, bez varování), Puppeteer na 1440, 1024 a 390 px bez přetečení a bez chyb v konzoli, přepínače včetně kaskády a klávesnice. Nezacommitováno (větev `ws/s18`, pracovní strom).
- **style** Landing, příběh poptávky: čísla kroků „01 / 03“ jsou v mono štítku sekcí (velká písmena, 14 px), číslo v signální barvě (`text-signal`) a za ním čárkovaná signální linka (`border-signal-line`, jako blok „nová poptávka“ v Dílcích), aby je návštěvník zaznamenal. Soubor: `components/marketing/live-demo.tsx`. Vizuál zatím neověřen v prohlížeči.
- **feat** Landing hero: řádek důvěry („14 dní zdarma“, „Vše v ceně“, „Zrušíte kdykoli“, „Přihlášení bez hesla“) je teď čipy s ikonami z lucide-react (SVG) v bílých kruzích, 15 px, střední řez. Soubor: `components/marketing/hero.tsx` (konstanta `TRUST`). Ověřeno: `tsc` čistý, Chrome 500 px bez přetečení.
- **style** Landing (`components/marketing/*`): typografie zvětšena o jeden stupeň (text-xs→sm, sm→base, base→lg, 11/13/15/17 px → 13/15/17/19 px). Hero perex: bílý, střední řez, 19/23 px. Admin a Workspace (`components/ws/brand`, `app/w`) beze změny — hustá UI; rozhodnutí Kryštofa po náhledu.
- **fix** Landing hero: odstraněn štítek „Ukázka · jedna poptávka od začátku do konce“ (`ArrivedBadge` smazán z `live-demo.tsx`, použit jen v hero). `tsc` čistý.
- **feat** Landing hero: interaktivní pozadí (`components/marketing/hero-backdrop.tsx`, klientská komponenta v `hero.tsx`). Kurzor nebo prst rozsvítí dílky v kruhu (poloměr 200 px, jen přepnutí průhlednosti přes masku), světelný záblesk se za kurzorem posouvá a klik vyšle krátké vlnění (WAAPI, 1 s). Odkazy a tlačítka fungují dál. `prefers-reduced-motion`: bez pohybu záblesku a vlnění. Ověřeno: `tsc` čistý, Chrome na `localhost:3000` (kurzor rozsvítí dílky kolem, zhasne mimo plochu).
- **feat** Landing 01 Proč to řešit přepracována (Kryštof: původní rozházené kousky „moc AI“, chtěl problém → řešení): pracovní den jako deník se čtyřmi chvílemi (10:40 poptávka během práce, 14:05 přesun termínu, 19:30 kdo zaplatil, za půl roku spící zákaznice). Vlevo problém, vpravo řešení existující funkcí s výřezem rozhraní, označeno „Ukázka“; data sjednocená s hero a kapitolou Peníze (Tereza Malá, 1 850 Kč). H2 „Práce nepočká. Poptávka taky ne.“ Komponenta je teď serverová (bez Framer Motion), jen `Reveal`. Soubory: `components/marketing/why-bother.tsx`, brief § 4.3 a motiv dílků. Ověřeno: `tsc`, `build:check`, Chrome 1440/1024/768/390 px bez vodorovného scrollu. Texty čekají na Kryštofovo schválení.
- **docs** Landing hero: perex pod H1 přepsán z procesu („Poptávka se sama zařadí…“) na popis produktu (přehled podnikání pro malé firmy, co v něm je). Soubor: `components/marketing/hero.tsx`. Meta description v `components/marketing/seo.ts` má stále procesní větu, nezměněno.
- **feat** Redesign R-057, pravý panel: od 1280 px je detail zadokovaný — bez ztmavení a zámku stránky, obsah se vedle něj zúží (kalendář zůstane vidět), pravý pruh Příchozí/zákazník/„Komu napsat“ se schová, klik na jiný termín jen přepne detail, Esc a křížek zavírají. Otevřený blok v mřížce Dnes i Kalendáře je zvýrazněný (`aria-current`). Pod 1280 px beze změny. Soubory: `components/ws/app/{detail-sheet,app-frame}.tsx`, `app/ws-tokens.css`, `components/ws/app/today/{today-board,week-calendar}.tsx`, `components/ws/app/calendar/time-grid.tsx`, `app/w/[business]/{page,kalendar/page,zakaznici/page}.tsx`. Ověřeno v Chromu (puppeteer) na dočasném náhledu s fiktivními daty: 1440/1280 px zadokované (padding 480 px stabilní i při přepnutí detailu přes `loading.tsx`), Esc zavře a vyčistí URL, 1024 px původní panel se ztmavením, tmavý režim; náhled smazán. `tsc`, `npm test` 480 + 1 přeskočený, `build:check` prošly. Neověřeno s přihlášením.
- **feat** Redesign R-057, Kalendář: mřížka zůstává hlavní plochou, vpravo pruh Příchozí (stejná `IncomingList` jako Dnes, potvrzení jedním klikem) se všemi čekajícími poptávkami i mimo zobrazený týden; pod 1280 px pod kalendářem a jen když nějaká čeká. Dotazy příchozích sdílené v `lib/ws/today.ts` (`getIncoming`), chování beze změny. Soubory: `app/w/[business]/kalendar/page.tsx`, `lib/ws/today.ts`. Ověřeno: `tsc`, `npm test` 480 + 1 přeskočený, `npm run build:check`; vzhled na dočasném náhledu s fiktivními daty (1440, 1024 px a 390 px s emulací telefonu, prázdný stav; smazán). Neověřeno s přihlášením a v tmavém režimu.
- **fix/feat** Redesign z `06d7b3f` přenesen z izolovaného worktree do otevřeného projektu na `ws/s18`, aby ho běžící vývojový server zobrazoval. Kalendářová ukázka ovládaná klikáním i scrollováním, kapitoly zákaznice/platby a `TodayBoard`; backend a dřívější rozpracované změny zachované. Samostatný commit existuje na `ws/redesign`; integrace v tomto stromu zatím necommitnutá. Po přenesení prošly typy a synchronizace kontextu; `http://localhost:3000/` vrátil 200 a obsahuje nové produktové scény. Port 3002 obsluhuje starý `next start`; pro redesign použít dev na 3000. Před přenosem v izolaci prošlo 475 testů + 1 přeskočený, typy a komponentové náhledy 390/768/1280/1440 px. Plný build tam blokovaly sdílené závislosti a DNS písem.
- **decision/docs** R-057: Kryštof vybral kombinaci směrů kalendář jako hlavní plochu, jedna poptávka jako příběh Landing a produktové kapitoly. Vytvořen předávací kontext `docs/REDESIGN-HANDOFF.md`, přidán do indexu. Redesign v kódu zatím nezačal.
- **fix** S19: nové `lib/security/request-body.ts` čte těla průběžně do pevného bajtového limitu; použito u Stripe, Clerk, Resend webhooků a veřejného API. Opraven případ, kdy se `req.text()` načetl celý dřív, než se zkontroloval limit (u Clerku se dříve kontroloval jen `content-length`). Nový test `request-body.test.ts`.
- **chore** S19 rozpracováno: admin CSP vynucená, `/login` dynamický kvůli nonce, rozhodnutí #015 a CSP-LOG v5; checklist `docs/workspace/LAUNCH.md`. Bezpečnostní stav synchronizován do `.agents/security/`. Ověřeno: 480 testů prošlo, 1 přeskočen; CSP/request-body testy 17/17, `tsc`, `git diff --check` a `npx next build --webpack` prošly. Standardní `build:check` s Turbopackem selhal na sandboxovém „Operation not permitted“ při bindu portu. Živý web ani npm registry nebyly dostupné pro DNS/network audit, viz `.claude/security/AUDIT-LOG.md`. S19 zůstává otevřené.
- **chore** S19 pokračování: Vercel ověřil `zakaziq.cz`/`www` a produkční deployment zůstává na `main`; Preview READY `project-pnfallur8-sobotkakrystof5-pngs-projects.vercel.app` z aktuálního pracovního stromu, Next 16.4.2 build dokončen. První Preview install selhal na peer rozsahu NextAuth 4/Nodemailer 10; přidán `.npmrc` s legacy peer resolverem (R-056), Vercel build pak prošel. Chrome načetl landing; konzole hlásí NextAuth server configuration error, login/Workspace a Safari neověřeny. Produkční audit: 16 prošlo, 5 varování, 4 chyby; chybí CSP/COOP/CORP, zůstává `x-powered-by`, skript hlásil nedostupný `security.txt` (soubor je v repu a Preview balíčku), SPF a DMARC chybí. Certifikát a TLS 1.3 potvrdil `curl`; původní TLS chyby způsoboval macOS chybějící `timeout`, přenosnost `security-check.sh` opravena. DNS apex `dig` nevrátil DS/CAA/TXT. Po opakovaných kontrolách Vercel vrátil anti-bot 403, další sken neopakovat. `npm audit --omit=dev`: 5 high + 2 moderate, Tailwind 3 řetězec; `npm audit fix --legacy-peer-deps` bez bezpečných oprav. Ověřeno: `npm test` 480 + 1 přeskočený, `npx tsc --noEmit`, `npm ci --dry-run`, `bash -n` security script; Vercel Preview build prošel. Produkce nenasazena; S19 otevřené.
- **feat** S05 základní SEO landing page (R-055): `components/marketing/seo.ts` (adresa webu, titulek, popis, Open Graph, JSON-LD Organization/WebSite/SoftwareApplication), metadata v `app/(marketing)/layout.tsx` (metadataBase, šablona titulku, OG, Twitter), canonical na `/` a právních stránkách, právní stránky `noindex, follow`, `app/robots.ts` (zakázané jen `/api/`), `app/sitemap.ts` (jen `/`), OG/Twitter obrázek 1200×630 přes `next/og` s písmy Dílků (TTF v `app/(marketing)/_og/`, OFL), favicon a apple ikona jen pro marketing (admin žádnou nedostal), `public/zakaziq-logo.png` pro schéma, `X-Robots-Tag: noindex, nofollow` pro `/w`, `/r`, `/z`, `/embed`, `/api` a admin v `next.config.mjs` (+ `.claude/security/STATE.md`). Texty landing page beze změny. Ověřeno: `tsc`, `npm run build:check`, `next start` (hlavičky na 12 cestách, `/podminky` bez hlavičky, ale s meta noindex), JSON-LD validní JSON, jeden H1, Lighthouse SEO 100, best practices 100, přístupnost 96 (kontrast, Otevřené problémy). Neověřeno: produkční host, Rich Results Test.
- **feat** S18 GDPR (R-054), větev `ws/s18` z `chore/next-16`: výmaz zákazníka na žádost (`ws.erase_customer`, karta zákazníka s potvrzením jménem), export všech dat účtu ZIP s CSV a PDF faktur (`/w/ucet/export`, vlastní `lib/ws/zip.ts` bez závislosti), zrušení účtu s 30denní lhůtou a obnovením (`ws.close_account`/`reopen_account`, Stripe předplatné se zruší hned), denní cron `/api/cron/ws-gdpr` (faktury po 10 letech, smazání účtů + organizace v Clerku), záznam o zpracování `/w/ucet/zpracovani`, souhlas s nabídkami na `/r`, ve widgetu a v API (`marketingConsent`), fakta o lhůtách na `/podminky` a `/zpracovatelska-smlouva`. Migrace 084 (aplikována: ne). Testy `ws-gdpr.test.ts` (11) + souhlas v `ws-intake.test.ts`.
- **feat** S18 mobil a PWA: manifest `public/zakaziq.webmanifest`, ikony z loga (`scripts/ws-pwa-icons.mjs` → `public/ikony/`), `public/sw.js` jen s offline stránkou `public/offline.html`, „Přidat na plochu“ v Účtu, kalendář na telefonu výchozí Den (User-Agent), „táhni pro obnovení“ na Dnes v aplikaci na ploše, `viewport-fit=cover`. Tmavý režim: přemapování světlých tříd a tmavé `signal`/`danger` v `app/ws-tokens.css`, opravené razítka a bílé prvky. Přepínač vzhledu s `aria-pressed`. Bezpečnostní review (0 nálezů, DECISIONS #014, AUDIT-LOG). Ověřeno: `npm test` 477 + 1 vynechaný, `tsc`, `npm run build:check`; vzhled na dočasném náhledu s fiktivními daty (smazán).
- **feat** S13 dokončena (R-054): Nastavení › Otevírací doba a pracovníci (týden s přestávkami, pracovníci přidat/přejmenovat/skrýt, vlastní směny, dovolené a zavřeno po dnech se „Zpět“), Služby (úprava, „Kdo ji dělá“, cena s haléři), pořadí přetažením u služeb, pracovníků, kolonek a stavů (`@dnd-kit`, i klávesnicí). Bez migrace. Hláška u služby už nezmiňuje migraci. Soubory: `lib/ws/{hours,settings}.ts`, `app/w/[business]/nastaveni/{actions.ts,oteviraci-doba,sluzby,formular,stavy}`, `components/ws/settings/*`, test `ws-settings.test.ts` (12). Ověřeno: `tsc`, `npm test` 463 + 1 vynechaný, `next build`, vzhled na dočasném náhledu (1280/390 px, bez přetečení), přesun klávesnicí v Chromu; regrese `/login` 200, `/dashboard` `/alteno` `/hub` 307. Neověřeno s přihlášením. Pozn.: `/p/<ne-UUID>` vrací 500 (DB odmítne token), UUID 404 — starší chování adminu, beze změny.
- **chore** `scripts/build-check.sh` = build v repu (Next 16 odděluje `.next/dev`); kopie repa padala pod Turbopackem. Dokumentace v referenci a `docs/CODEX.md`.
- **chore** Upgrade na Next.js 16.4.2 + React 19.3 (R-053), větev `chore/next-16`. Balíčky: `next` 16.4.2, `react`/`react-dom` 19, `@types/react(-dom)` 19 (přesunuty do devDependencies), `qrcode.react` 4.2, `lucide-react` 0.544; `@clerk/nextjs` 6.39.7 a `next-auth` 4.24 beze změny (podporují Next 16). Kód: async `params`/`searchParams`/`cookies()`/`headers()` v ~70 souborech (codemod `next-async-request-api` + ruční opravy; `appOrigin`/`orderPageUrl`/`portalPageUrl` jsou async), `middleware.ts` → `proxy.ts` (funkce `proxy`, Node runtime, logika beze změny), `next.config.mjs` (`serverExternalPackages`, top-level `outputFileTracingIncludes`, `turbopack.root` + `outputFileTracingRoot`), test `ws-db-context` počítá s digestem 404 `NEXT_HTTP_ERROR_FALLBACK;404`, skript `lint` smazán (`next lint` v Next 16 neexistuje a ESLint v projektu nebyl). Důležité: Turbopack 16.2 padal (panic v `ident.rs`) na cestě projektu s rozloženou diakritikou („Podnikání“), protože kořen odhadl nad projektem kvůli cizímu `package-lock.json` v domovské složce — vyřešil explicitní kořen. Doc/bezpečnost: AGENTS.md, reference, admin popis, index, `.claude/security/{STATE,DECISIONS,AUDIT-LOG}` + `.agents/`, komentář v `security.yml`. Ověřeno: `tsc` čistý, `npm test` 451 + 1 vynechaný, `npm run build` (Turbopack) bez varování, Chromium v tracingu PDF routy, smoke test `next start` (admin 307, `/w` → přihlášení, CSP s nonce, `/login` Report-Only). Neověřeno: přihlášení do adminu a Clerku v prohlížeči, PDF a Vercel Preview, vzhled stránek.
- **chore** Commit S17 (`b90d199`) před upgradem, aby se neslil s feature prací.


### Starší
- Říjen do 2026-10-10: [`archiv/2026-10.md`](archiv/2026-10.md) (S00–S17). Červen až září 2026: [`archiv/2026-06-az-09.md`](archiv/2026-06-az-09.md).
