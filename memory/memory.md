# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Stručné instrukce: [`../AGENTS.md`](../AGENTS.md); technická fakta: [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md).
>
> **Poslední aktualizace:** 2026-10-17 · S13 dokončena (R-054) a upgrade na Next 16.4 + React 19 na větvi `chore/next-16` (R-053)

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

**Rozpracováno:** ZakazIQ Workspace (SaaS) + landing page na větvi `workspace` (R-015). S00: plán `docs/workspace/PLAN.md`, skilly `.claude/skills/zakaziq-*`, env blok v `.env.example`. S01: design systém Dílky v kódu — tokeny `app/ws-tokens.css`, Tailwind `lib/ws/tailwind-dilky.ts`, písma `lib/ws/fonts.ts`, kořen `components/ws/ws-root.tsx`, UI kit `components/ui/`, komponenty `components/ws/brand/`, přehled `/w/_design` (jen dev). S02: bezpečnostní základ — hlavičky v `next.config.mjs`, CSP s nonce v `middleware.ts` + `lib/security/` (admin Report-Only, `/w` `/r` `/z` vynucená), `security.txt`, CI `.github/workflows/security.yml`, stav v `.claude/security/STATE.md`. S09: kostra aplikace `/w/[byznys]` a obrazovka Dnes (odstavec níže). Prompty sezení: `new - area of zakaziq/prompty/` (rozcestník `00-README.md`).

**Sezení Workspace:**

| # | Sezení | Stav |
|---|---|---|
| S00 | Příprava repa, paměti, skillů | hotovo (2026-10-08) |
| S01 | Design systém Dílky v kódu | hotovo (2026-10-08) |
| S02 | Bezpečnostní základ | hotovo (2026-10-08) |
| S03 | Brief landing page | hotovo (2026-10-08) |
| S04 | Landing page — stavba a animace | hotovo (2026-10-08) |
| S05 | Landing page — SEO a texty | čeká |
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
| S18 | Mobil, tmavý režim, GDPR | čeká |
| S19 | Bezpečnostní audit a spuštění | čeká |

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

**Další krok:** Kryštof v adminu projde `/dashboard/klienti` a `/dashboard/novinky` s přihlášením: pozve testovací e-mail, projde registraci z pozvánky (Clerk dev) až na krok 2, vygeneruje klíče a prompt, zveřejní novinku a zkontroluje zvonek ve `/w`. Ověřit `/z/[token]` na skutečném termínu (S16). Pro e-maily doména `zakaziq.cz` v Resendu, `WS_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`. Projít Nastavení › Otevírací doba a pracovníci a Služby s přihlášením (S13). Pak S18.

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

## 3. Otevřené problémy

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
- [ ] **Zranitelné závislosti:** po upgradu na Next 16.4.2 (R-053) zmizely critical u `next`; zbývá `nodemailer` 7 (oprava v 10), `next-auth` 4 a řetězec `tailwindcss` 3 (`braces`/`micromatch`/`postcss`). Řešit jako samostatné kroky (nodemailer 10, Tailwind 4, Auth.js 5), rozhodnout nejpozději v S19 · od 2026-10-08
- [ ] **Workspace — toasty přes adminův `<Toaster>`** (R-027): pozice a délka jsou společné s adminem (vpravo nahoře). Až bude potřeba vlastní toaster (např. spodní lišta na mobilu v S09/S18), řešit upgradem sonneru na 2.x (víc toasterů) nebo úpravou `app/layout.tsx` — obojí sahá na admin, chce souhlas · od 2026-10-08
- [ ] **Workspace — Inter se stahuje i na stránkách Dílků:** `@import` Google Fonts v `app/globals.css` (admin) se načte všude; Instrument Sans ho přebije, jen zbytečný request CSS. Od S02 ho na `/w` a od S04 i na landing page blokuje vynucená CSP — žádný request, ale chyba v konzoli i na veřejné stránce (Lighthouse Best Practices). Řešit, až se bude sahat na admin · od 2026-10-08
- [ ] **Bezpečnost — otevřené položky** (vynucení admin CSP, Clerk do CSP, DNS `zakaziq.cz`, živý audit, `Expires` v security.txt): vedené v `.claude/security/STATE.md` → Otevřené položky · od 2026-10-08
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

### 2026-10-17
- **feat** S18 GDPR (R-054), větev `ws/s18` z `chore/next-16`: výmaz zákazníka na žádost (`ws.erase_customer`, karta zákazníka s potvrzením jménem), export všech dat účtu ZIP s CSV a PDF faktur (`/w/ucet/export`, vlastní `lib/ws/zip.ts` bez závislosti), zrušení účtu s 30denní lhůtou a obnovením (`ws.close_account`/`reopen_account`, Stripe předplatné se zruší hned), denní cron `/api/cron/ws-gdpr` (faktury po 10 letech, smazání účtů + organizace v Clerku), záznam o zpracování `/w/ucet/zpracovani`, souhlas s nabídkami na `/r`, ve widgetu a v API (`marketingConsent`), fakta o lhůtách na `/podminky` a `/zpracovatelska-smlouva`. Migrace 084 (aplikována: ne). Testy `ws-gdpr.test.ts` (11) + souhlas v `ws-intake.test.ts`.
- **feat** S13 dokončena (R-054): Nastavení › Otevírací doba a pracovníci (týden s přestávkami, pracovníci přidat/přejmenovat/skrýt, vlastní směny, dovolené a zavřeno po dnech se „Zpět“), Služby (úprava, „Kdo ji dělá“, cena s haléři), pořadí přetažením u služeb, pracovníků, kolonek a stavů (`@dnd-kit`, i klávesnicí). Bez migrace. Hláška u služby už nezmiňuje migraci. Soubory: `lib/ws/{hours,settings}.ts`, `app/w/[business]/nastaveni/{actions.ts,oteviraci-doba,sluzby,formular,stavy}`, `components/ws/settings/*`, test `ws-settings.test.ts` (12). Ověřeno: `tsc`, `npm test` 463 + 1 vynechaný, `next build`, vzhled na dočasném náhledu (1280/390 px, bez přetečení), přesun klávesnicí v Chromu; regrese `/login` 200, `/dashboard` `/alteno` `/hub` 307. Neověřeno s přihlášením. Pozn.: `/p/<ne-UUID>` vrací 500 (DB odmítne token), UUID 404 — starší chování adminu, beze změny.
- **chore** `scripts/build-check.sh` = build v repu (Next 16 odděluje `.next/dev`); kopie repa padala pod Turbopackem. Dokumentace v referenci a `docs/CODEX.md`.
- **chore** Upgrade na Next.js 16.4.2 + React 19.3 (R-053), větev `chore/next-16`. Balíčky: `next` 16.4.2, `react`/`react-dom` 19, `@types/react(-dom)` 19 (přesunuty do devDependencies), `qrcode.react` 4.2, `lucide-react` 0.544; `@clerk/nextjs` 6.39.7 a `next-auth` 4.24 beze změny (podporují Next 16). Kód: async `params`/`searchParams`/`cookies()`/`headers()` v ~70 souborech (codemod `next-async-request-api` + ruční opravy; `appOrigin`/`orderPageUrl`/`portalPageUrl` jsou async), `middleware.ts` → `proxy.ts` (funkce `proxy`, Node runtime, logika beze změny), `next.config.mjs` (`serverExternalPackages`, top-level `outputFileTracingIncludes`, `turbopack.root` + `outputFileTracingRoot`), test `ws-db-context` počítá s digestem 404 `NEXT_HTTP_ERROR_FALLBACK;404`, skript `lint` smazán (`next lint` v Next 16 neexistuje a ESLint v projektu nebyl). Důležité: Turbopack 16.2 padal (panic v `ident.rs`) na cestě projektu s rozloženou diakritikou („Podnikání“), protože kořen odhadl nad projektem kvůli cizímu `package-lock.json` v domovské složce — vyřešil explicitní kořen. Doc/bezpečnost: AGENTS.md, reference, admin popis, index, `.claude/security/{STATE,DECISIONS,AUDIT-LOG}` + `.agents/`, komentář v `security.yml`. Ověřeno: `tsc` čistý, `npm test` 451 + 1 vynechaný, `npm run build` (Turbopack) bez varování, Chromium v tracingu PDF routy, smoke test `next start` (admin 307, `/w` → přihlášení, CSP s nonce, `/login` Report-Only). Neověřeno: přihlášení do adminu a Clerku v prohlížeči, PDF a Vercel Preview, vzhled stránek.
- **chore** Commit S17 (`b90d199`) před upgradem, aby se neslil s feature prací.


### Starší
- Říjen do 2026-10-10: [`archiv/2026-10.md`](archiv/2026-10.md) (S00–S17). Červen až září 2026: [`archiv/2026-06-az-09.md`](archiv/2026-06-az-09.md).
